import { createAgentUIStreamResponse } from "ai";
import { revalidateTag } from "next/cache";
import { currentUser } from "@/lib/services/user";
import { getUserMembershipWithOrg } from "@/lib/services/organization";
import { getAiProAccess } from "@/lib/billing/entitlements";
import { aiRunLimitError, recordUsage } from "@/lib/billing/limits";
import { OrgRole, UsageKind } from "@/generated/prisma/enums";
import { buildEventDraftAgent } from "@/lib/agents/event/build";
import { trimHistory } from "@/lib/agents/history";

export const maxDuration = 300;

const DAY_MS = 24 * 60 * 60 * 1000;
const toDateOnly = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The browser reports its own calendar day, because "next Sunday" is relative to
 * where the user is, not to the server. Clamped to a day either side of UTC now
 * so a crafted value can't send the agent drafting in another year.
 */
function resolveToday(candidate: unknown): string {
  const now = new Date();
  if (typeof candidate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    return toDateOnly(now);
  }
  const min = toDateOnly(new Date(now.getTime() - DAY_MS));
  const max = toDateOnly(new Date(now.getTime() + DAY_MS));
  if (candidate < min) return min;
  if (candidate > max) return max;
  return candidate;
}

export async function POST(req: Request) {
  const { messages, orgId, today } = await req.json();
  if (typeof orgId !== "string") {
    return new Response("Bad request", { status: 400 });
  }

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

  // The person drafting creates the event, so a team with no lead is theirs.
  const agent = await buildEventDraftAgent({
    organizationId: orgId,
    organizationName: membership.organization.name,
    viewer: {
      userId: user.id,
      name: `${user.firstName} ${user.lastName}`,
      firstName: user.firstName,
    },
    today: resolveToday(today),
  });

  if (!agent) {
    return new Response("No service types", { status: 422 });
  }

  const aiLimit = await aiRunLimitError(orgId);

  if (aiLimit) return new Response(aiLimit, { status: 429 });

  // Counted as it starts, so a run that fails partway still counts: the model
  // was paid for either way.
  await recordUsage(orgId, UsageKind.AI_RUN);

  revalidateTag(`org-${orgId}-usage`, { expire: 0 });

  return createAgentUIStreamResponse({
    agent,
    uiMessages: trimHistory(messages),
    timeout: 290_000,
    // The headers are already sent by the time the agent can fail, so without
    // this a mid-stream failure reaches nobody's logs.
    onError: (error) => {
      console.error("POST /api/event-ai stream failed", error);
      return "The assistant stopped before it finished. Please try again.";
    },
  });
}
