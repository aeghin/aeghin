import prisma from "@/lib/prisma";
import { inviteMember } from "@/lib/actions/invitation";
import { orgInvitationSchema } from "@/lib/validations/invitations";
import type { InvitationStatus, VolunteerRole } from "@/generated/prisma/enums";
import {
    actionFailure,
    canManage,
    clerkIdOf,
    expireTag,
    fail,
    isObject,
    json,
    membershipFor,
    readJson,
    route,
} from "@/lib/mobile/route";

/**
 * Wire contract for the invitations list. Mirrors `OrganizationInvitation` in
 * the Expo app (`src/types/organization.ts`) — keep the two in sync.
 */
type OrganizationInvitation = {
    id: string;
    email: string;
    status: InvitationStatus;
    volunteerRoles: VolunteerRole[];
    expiresAt: string;
    createdAt: string;
    invitedBy: { firstName: string; lastName: string };
};

type Params = { orgId: string };

/**
 * GET /api/mobile/v1/organizations/[orgId]/invitations
 *
 * Every invitation the organization has sent, newest first. Owners and
 * admins only — the dashboard hides the tab from members, and this answers
 * 403 to them for the same reason.
 */
export const GET = route<Params>("GET .../invitations", async (_req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    if (!canManage(membership.role)) return fail(403, "Forbidden");

    const rows = await prisma.invitation.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            email: true,
            status: true,
            volunteerRoles: true,
            expiresAt: true,
            createdAt: true,
            invitedBy: { select: { firstName: true, lastName: true } },
        },
    });

    const invitations: OrganizationInvitation[] = rows.map((row) => ({
        ...row,
        expiresAt: row.expiresAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
    }));

    return json({ invitations });
});

/**
 * POST /api/mobile/v1/organizations/[orgId]/invitations
 *
 * Invites one person by email: `{ email, phoneNumber, volunteerRoles }`.
 *
 * The organization comes from the path, so a caller cannot invite into
 * somebody else's organization by editing the payload. The action is the
 * dashboard's own — the role gate, the "already a member" check, the upsert
 * that refreshes a stale invitation, the activity entry and the email all
 * live there. Validated here first so a bad field comes back as its own
 * message rather than the action's generic failure.
 */
export const POST = route<Params>("POST .../invitations", async (req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const body = await readJson(req);

    if (!isObject(body)) return fail(400, "Expected an invitation.");

    const parsed = orgInvitationSchema.safeParse({ ...body, orgId });

    if (!parsed.success) {
        return fail(400, parsed.error.issues[0]?.message ?? "Invalid invitation.");
    }

    const result = await inviteMember(parsed.data, expireTag);

    if (!result.success) {
        if (result.error === "User is member") {
            return fail(409, "That person is already a member.");
        }
        return actionFailure(result.error);
    }

    return json({ success: true }, 201);
});
