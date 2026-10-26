import { createAgentUIStreamResponse } from "ai";
import { revalidateTag } from "next/cache";
import { currentUser } from "@/lib/services/user";
import { getUserMembershipWithOrg } from "@/lib/services/organization";
import { getAiProAccess } from "@/lib/billing/entitlements";
import { aiRunLimitError, recordUsage } from "@/lib/billing/limits";
import { OrgRole, UsageKind, type RoleCategory as Team } from "@/generated/prisma/enums";
import { TEAM_ORDER } from "@/lib/config/roles";
import { buildTeamFillAgent } from "@/lib/agents/team/build";
import { trimHistory } from "@/lib/agents/history";

export const maxDuration = 300;

/**
 * Fill with AI on the event page: suggests invitations for the teams the
 * caller can staff on this event — theirs, and the ones they back up — and
 * nothing else. Same gates as the draft route, in the same order, plus the
 * team check; the invitations themselves go through inviteMembersToEvent
 * after somebody reads the card.
 */
export async function POST(req: Request) {
  const { messages, orgId, eventId, teams } = await req.json();

  if (typeof orgId !== "string" || typeof eventId !== "string") {
    return new Response("Bad request", { status: 400 });
  }

  const requested = Array.isArray(teams)
    ? teams.filter((team): team is Team => TEAM_ORDER.includes(team))
    : undefined;

  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const hasPro = await getAiProAccess({ userId: user.id, orgId });
  if (!hasPro) return new Response("Upgrade required", { status: 403 });

  const membership = await getUserMembershipWithOrg(user.id, orgId);
  const canManage =
    membership?.role === OrgRole.ADMIN || membership?.role === OrgRole.OWNER;

  if (!membership || !canManage) {
    return new Response("Not found", { status: 404 });
  }

  const built = await buildTeamFillAgent({
    organizationId: orgId,
    organizationName: membership.organization.name,
    eventId,
    viewer: {
      userId: user.id,
      name: `${user.firstName} ${user.lastName}`,
      firstName: user.firstName,
    },
    teams: requested,
  });

  if ("refusal" in built) {
    switch (built.refusal) {
      case "not-found":
        return new Response("Not found", { status: 404 });
      case "over":
        return new Response("This event is over.", { status: 409 });
      case "not-yours":
        return new Response("Only whoever's in charge of a team, or its backup, can fill it with AI.", { status: 403 });
    }
  }

  const aiLimit = await aiRunLimitError(orgId);

  if (aiLimit) return new Response(aiLimit, { status: 429 });

  // Counted as it starts, so a run that fails partway still counts: the model
  // was paid for either way.
  await recordUsage(orgId, UsageKind.AI_RUN);

  revalidateTag(`org-${orgId}-usage`, { expire: 0 });

  return createAgentUIStreamResponse({
    agent: built.agent,
    uiMessages: trimHistory(messages),
    timeout: 290_000,
    onError: (error) => {
      console.error("POST /api/team-ai stream failed", error);
      return "The assistant stopped before it finished. Please try again.";
    },
  });
}
