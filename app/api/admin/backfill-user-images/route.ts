import { clerkClient } from "@clerk/nextjs/server";
import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";

/**
 * POST /api/admin/backfill-user-images[?dryRun=1]
 *
 * Re-runnable repair for `User.userImageUrl`.
 *
 * That column is only ever written by the Clerk webhook, so a row whose user
 * signed up before the sync existed — and who has not edited their Clerk
 * profile since, which is what fires `user.updated` — still holds `null`. Those
 * are the members rendering the one-letter `AvatarFallback` instead of Clerk's
 * initials avatar; the ones that "somehow" have it are the ones a
 * `user.updated` happened to touch.
 *
 * Clerk always issues an `image_url`: for someone who never uploaded a picture
 * it points at the generated default, which the instance's avatar setting
 * renders as initials. So the repair is to copy whatever `image_url` Clerk
 * holds today onto every user we know about.
 *
 * Guarded by a shared secret rather than a session — it is an operator task,
 * and `proxy.ts` deliberately does not run Clerk middleware over `/api/admin`:
 *
 *   curl -X POST https://aeghin.com/api/admin/backfill-user-images?dryRun=1 \
 *     -H "Authorization: Bearer $ADMIN_TASK_SECRET"
 *
 * Drop `?dryRun=1` to write. The response reports what changed, and running it
 * twice is a no-op the second time.
 */

/** Clerk's list endpoint caps at 500; 100 keeps each round trip small. */
const CLERK_PAGE_SIZE = 100;

/** Neon sits behind a pooler, so writes go out in bounded transactions. */
const WRITE_CHUNK_SIZE = 50;

export async function POST(req: NextRequest) {
  const secret = process.env.ADMIN_TASK_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "ADMIN_TASK_SECRET is not configured" },
      { status: 503 },
    );
  }

  const presented =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";

  if (!secretMatches(presented, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
  const client = await clerkClient();

  // Keyed both ways: accounts predating the production instance still carry a
  // development-instance clerkId (same reason `user.created` upserts on email),
  // and those rows would never match on id alone.
  const imageByClerkId = new Map<string, string>();
  const imageByEmail = new Map<string, string>();

  let clerkTotal = Infinity;

  for (let offset = 0; offset < clerkTotal; offset += CLERK_PAGE_SIZE) {
    const { data, totalCount } = await client.users.getUserList({
      limit: CLERK_PAGE_SIZE,
      offset,
      orderBy: "+created_at",
    });

    clerkTotal = totalCount;

    if (data.length === 0) break;

    for (const clerkUser of data) {
      if (!clerkUser.imageUrl) continue;

      imageByClerkId.set(clerkUser.id, clerkUser.imageUrl);

      // Primary address only: a secondary address on one Clerk account can be
      // the primary on another, and that would hand a row the wrong avatar.
      const primaryEmail = clerkUser.emailAddresses.find(
        (address) => address.id === clerkUser.primaryEmailAddressId,
      )?.emailAddress;

      if (primaryEmail) {
        imageByEmail.set(primaryEmail.toLowerCase(), clerkUser.imageUrl);
      }
    }
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      clerkId: true,
      email: true,
      userImageUrl: true,
      memberships: { select: { organizationId: true } },
    },
  });

  const pending: {
    id: string;
    clerkId: string;
    imageUrl: string;
    organizationIds: string[];
  }[] = [];

  // Rows Clerk no longer knows about — deleted accounts, or a dev-instance
  // holdover whose email also changed. Reported rather than guessed at.
  const unmatched: string[] = [];
  let alreadyCurrent = 0;

  for (const user of users) {
    const imageUrl =
      imageByClerkId.get(user.clerkId) ??
      imageByEmail.get(user.email.toLowerCase());

    if (!imageUrl) {
      unmatched.push(user.email);
      continue;
    }

    if (imageUrl === user.userImageUrl) {
      alreadyCurrent += 1;
      continue;
    }

    pending.push({
      id: user.id,
      clerkId: user.clerkId,
      imageUrl,
      organizationIds: user.memberships.map((m) => m.organizationId),
    });
  }

  const summary = {
    dryRun,
    clerkUsers: imageByClerkId.size,
    databaseUsers: users.length,
    updated: pending.length,
    alreadyCurrent,
    unmatched,
  };

  if (dryRun || pending.length === 0) return NextResponse.json(summary);

  for (let i = 0; i < pending.length; i += WRITE_CHUNK_SIZE) {
    await prisma.$transaction(
      pending
        .slice(i, i + WRITE_CHUNK_SIZE)
        .map(({ id, imageUrl }) =>
          prisma.user.update({ where: { id }, data: { userImageUrl: imageUrl } }),
        ),
    );
  }

  // The same tags `user.updated` busts for an avatar change. Event rosters
  // render the image too, but they age out on their own cacheLife instead of
  // being enumerated here — same tradeoff the webhook already makes.
  const touchedOrgIds = new Set<string>();

  for (const { clerkId, organizationIds } of pending) {
    revalidateTag(`user-${clerkId}`, { expire: 0 });
    for (const organizationId of organizationIds) touchedOrgIds.add(organizationId);
  }

  for (const organizationId of touchedOrgIds) {
    revalidateTag(`org-${organizationId}-members-list`, { expire: 0 });
  }

  return NextResponse.json(summary);
}

/**
 * `timingSafeEqual` throws on a length mismatch, and the length of a token is
 * not the part worth hiding — so it is checked first.
 */
function secretMatches(presented: string, secret: string) {
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);

  return a.length === b.length && timingSafeEqual(a, b);
}
