import prisma from "@/lib/prisma";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { NextRequest, after } from "next/server";
import { revalidateTag } from "next/cache";
import { ActivityType, OrgRole } from "@/generated/prisma/enums";
import { UTApi } from "uploadthing/server";

export async function POST(req: NextRequest) {
  const event = await verifyWebhook(req, {
    signingSecret: process.env.CLERK_WEBHOOK_SIGNING_SECRET!,
  });

  if (event.type === "user.created") {
    const userId = event.data.id;
    const email = event.data.email_addresses[0].email_address;
    const firstName = event.data.first_name!;
    const lastName = event.data.last_name!;
    const phoneNumber = event.data.phone_numbers[0].phone_number;
    const userImageUrl = event.data.image_url;

    // Keyed on email, not clerkId: accounts predating the production instance
    // still carry their development-instance clerkId, and Clerk cannot transfer
    // users between instances. Re-pointing the existing row keeps memberships,
    // assignments and orgs attached. Safe because email is verified at sign-up.
    const existing = await prisma.user.findUnique({ where: { email } });

    await prisma.user.upsert({
      where: { email },
      update: {
        clerkId: userId,
        firstName,
        lastName,
        phoneNumber,
        userImageUrl,
      },
      create: {
        clerkId: userId,
        email,
        firstName,
        lastName,
        phoneNumber,
        userImageUrl,
      },
    });

    // The sign-up redirect can land before this webhook does, caching a null
    // user for the cacheLife("hours") window. Clear it either way.
    revalidateTag(`user-${userId}`, { expire: 0 });

    if (!existing) after(() => notifyNewSignup({ email, firstName, lastName }));
  }

  if (event.type === "user.updated") {
    const {
      id,
      email_addresses,
      first_name,
      last_name,
      image_url,
      phone_numbers,
    } = event.data;

    const existingUser = await prisma.user.findUnique({
      where: { clerkId: id },
    });

    if (!existingUser) return new Response("Unable to find user", { status: 404 });

    const primaryEmail = email_addresses.find(
      (e) => e.id === event.data.primary_email_address_id,
    )?.email_address;
    const primaryPhone = phone_numbers.find(
      (p) => p.id === event.data.primary_phone_number_id,
    )?.phone_number;

    const updates: Record<string, string | undefined> = {};

    if (primaryEmail && primaryEmail !== existingUser.email)
      updates.email = primaryEmail;
    if (first_name && first_name !== existingUser.firstName)
      updates.firstName = first_name;
    if (last_name && last_name !== existingUser.lastName)
      updates.lastName = last_name;
    if (image_url !== existingUser.userImageUrl) updates.userImageUrl = image_url;
    if (primaryPhone && primaryPhone !== existingUser.phoneNumber)
      updates.phoneNumber = primaryPhone;

    if (Object.keys(updates).length > 0) {
      await prisma.user.update({
        where: { clerkId: id },
        data: updates,
      });

      revalidateTag(`user-${id}`, { expire: 0 });

      const memberships = await prisma.membership.findMany({
        where: { user: { clerkId: id } },
        select: { organizationId: true },
      });

      for (const { organizationId } of memberships) {
        revalidateTag(`org-${organizationId}-members-list`, { expire: 0 });
      }
    }
  }


  if (event.type === "user.deleted") {
    const clerkId = event.data.id;

    // The deleted payload types `id` as optional.
    if (!clerkId) return new Response("Webhook received", { status: 200 });

    // Everything the cache tags need must be read before the cascade runs.
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        memberships: { select: { organizationId: true, role: true } },
        assignedEvents: { select: { eventId: true, organizationId: true } },
        setlistSongAssignment: {
          select: {
            setlistSong: {
              select: { eventId: true, event: { select: { organizationId: true } } },
            },
          },
        },
      },
    });

    // Already gone, or never synced. 200 so Clerk stops redelivering.
    if (!user) return new Response("Webhook received", { status: 200 });

    const orgIds = user.memberships.map((m) => m.organizationId);

    // Assignment rosters and setlist credits both render through the same
    // event-details tag, so they feed one set.
    const eventOrgById = new Map<string, string>();
    for (const a of user.assignedEvents) eventOrgById.set(a.eventId, a.organizationId);
    for (const s of user.setlistSongAssignment)
      eventOrgById.set(s.setlistSong.eventId, s.setlistSong.event.organizationId);

    // Invites addressed to this email can sit in orgs they never joined.
    const invitedOrgs = await prisma.invitation.findMany({
      where: { email: user.email },
      select: { organizationId: true },
    });

    // Orgs this user solely owned: promote a successor, or tear the org down if
    // they were the last member. Orgs don't depend on each other, so they all
    // resolve at once instead of one round trip at a time.
    const ownedOrgIds = user.memberships.flatMap((m) =>
      m.role === OrgRole.OWNER ? [m.organizationId] : [],
    );

    const succession = await Promise.all(
      ownedOrgIds.map(async (organizationId) => {
        const otherOwners = await prisma.membership.count({
          where: { organizationId, role: OrgRole.OWNER, userId: { not: user.id } },
        });
        if (otherOwners > 0) return null;

        // Admins inherit first, so only look at members when there are none.
        const successor =
          (await prisma.membership.findFirst({
            where: { organizationId, role: OrgRole.ADMIN },
            orderBy: { createdAt: "asc" },
            select: { userId: true },
          })) ??
          (await prisma.membership.findFirst({
            where: { organizationId, role: OrgRole.MEMBER },
            orderBy: { createdAt: "asc" },
            select: { userId: true },
          }));

        return { organizationId, successorId: successor?.userId ?? null };
      }),
    );

    const promotions: { userId: string; organizationId: string }[] = [];
    const doomedOrgIds: string[] = [];

    for (const entry of succession) {
      if (!entry) continue;
      if (entry.successorId) {
        promotions.push({
          userId: entry.successorId,
          organizationId: entry.organizationId,
        });
      } else {
        doomedOrgIds.push(entry.organizationId);
      }
    }

    // Feed entries for orgs that outlive this user: the departure itself, plus
    // any silent owner succession. Names are snapshotted before the rows go.
    const successors = promotions.length
      ? await prisma.user.findMany({
          where: { id: { in: promotions.map((p) => p.userId) } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];

    const successorNameById = new Map(
      successors.map((s) => [s.id, `${s.firstName} ${s.lastName}`]),
    );

    const doomedOrgIdSet = new Set(doomedOrgIds);
    const survivingOrgIds = orgIds.filter((id) => !doomedOrgIdSet.has(id));

    const activityRows = [
      ...survivingOrgIds.map((organizationId) => ({
        organizationId,
        type: ActivityType.MEMBER_LEFT,
        actorName: `${user.firstName} ${user.lastName}`,
        detail: "Account deleted",
      })),
      ...promotions.map(({ userId, organizationId }) => ({
        organizationId,
        type: ActivityType.ROLE_CHANGED,
        targetName: successorNameById.get(userId) ?? "A member",
        detail: "Owner",
      })),
    ];

    // UploadThing keys have to be collected before the rows go.
    const doomedOrgs = doomedOrgIds.length
      ? await prisma.organization.findMany({
          where: { id: { in: doomedOrgIds } },
          select: {
            logoKey: true,
            songs: { select: { attachments: { select: { key: true } } } },
          },
        })
      : [];

    await prisma.$transaction([
      // Promote before the owner's membership cascades away.
      ...promotions.map(({ userId, organizationId }) =>
        prisma.membership.update({
          where: { userId_organizationId: { userId, organizationId } },
          data: { role: OrgRole.OWNER },
        }),
      ),
      // Invitations addressed to this user carry no FK, only an email string.
      prisma.invitation.deleteMany({ where: { email: user.email } }),
      ...(activityRows.length
        ? [prisma.activityLog.createMany({ data: activityRows })]
        : []),
      // Cascades: Membership, EventAssignment, BlockoutDate, Message,
      // SetlistSongAssignment, and the invitations they sent.
      prisma.user.delete({ where: { id: user.id } }),
      // ServiceType and Song are RESTRICT-referenced, so children go first —
      // same order deleteOrganization uses.
      ...doomedOrgIds.flatMap((organizationId) => [
        prisma.event.deleteMany({ where: { organizationId } }),
        prisma.song.deleteMany({ where: { organizationId } }),
        prisma.eventTemplate.deleteMany({ where: { organizationId } }),
        prisma.serviceType.deleteMany({ where: { organizationId } }),
        prisma.organization.delete({ where: { id: organizationId } }),
      ]),
    ]);

    const utKeys = doomedOrgs.flatMap((o) => [
      ...(o.logoKey ? [o.logoKey] : []),
      ...o.songs.flatMap((s) => s.attachments.map((a) => a.key)),
    ]);

    // Best effort — orphaned files must not fail an otherwise-complete delete.
    if (utKeys.length) {
      try {
        await new UTApi().deleteFiles(utKeys);
      } catch (err) {
        console.error("user.deleted: UploadThing cleanup failed", err);
      }
    }

    revalidateTag(`user-${clerkId}`, { expire: 0 });
    revalidateTag(`user-${user.id}-orgs`, { expire: 0 });
    revalidateTag(`user-${user.id}-memberships`, { expire: 0 });
    revalidateTag(`user-${user.id}-roles`, { expire: 0 });

    for (const organizationId of orgIds) {
      revalidateTag(`user-${user.id}-org-${organizationId}-role`, { expire: 0 });
      revalidateTag(`user-${user.id}-events-${organizationId}`, { expire: 0 });
      revalidateTag(`user-${user.id}-blockouts-${organizationId}`, { expire: 0 });
      revalidateTag(`user-${user.id}-songs-${organizationId}`, { expire: 0 });
      revalidateTag(`org-${organizationId}-members-list`, { expire: 0 });
      revalidateTag(`org-${organizationId}-member-count`, { expire: 0 });
      revalidateTag(`org-${organizationId}-list-entry`, { expire: 0 });
      revalidateTag(`org-${organizationId}-acceptance-stats`, { expire: 0 });
      revalidateTag(`org-${organizationId}-events`, { expire: 0 });
      revalidateTag(`org-${organizationId}-activity`, { expire: 0 });
    }

    for (const { organizationId } of [...user.memberships, ...invitedOrgs]) {
      revalidateTag(`invitations-${organizationId}-list`, { expire: 0 });
    }

    for (const [eventId, organizationId] of eventOrgById) {
      revalidateTag(`event-${eventId}-org-${organizationId}-details`, { expire: 0 });
    }

    for (const { userId, organizationId } of promotions) {
      revalidateTag(`user-${userId}-org-${organizationId}-role`, { expire: 0 });
      revalidateTag(`user-${userId}-orgs`, { expire: 0 });
    }
  }

  return new Response("Webhook received", { status: 200 });
}

type NewSignup = {
  email: string;
  firstName: string;
  lastName: string;
};

async function notifyNewSignup({ email, firstName, lastName }: NewSignup) {
  const webhookUrl = process.env.DISCORD_SIGNUP_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: "New signup",
            color: 16347926,
            fields: [
              { name: "Name", value: `${firstName} ${lastName}`, inline: true },
              { name: "Email", value: email, inline: true },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error(
        `Discord signup notification failed: ${response.status} ${await response.text()}`,
      );
    }
  } catch (error) {
    console.error("Discord signup notification failed", error);
  }
}
