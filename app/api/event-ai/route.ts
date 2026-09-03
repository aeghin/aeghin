import { createAgentUIStreamResponse } from "ai";
import { currentUser } from "@/lib/services/user";
import { getUserMembershipWithOrg, getOrgMembersWithUser } from "@/lib/services/organization";
import { getOrgServiceTypes } from "@/lib/services/service-types";
import { getOrgEventTemplates } from "@/lib/services/event-templates";
import { getEligibilityByRole } from "@/lib/services/scheduling";
import { getAiProAccess } from "@/lib/billing/entitlements";
import { OrgRole } from "@/generated/prisma/enums";
import {
  createEventDraftAgent,
  type EventAgentDeps,
} from "@/lib/agents/event/agent";

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

  const [serviceTypes, templates, members] = await Promise.all([
    getOrgServiceTypes(orgId),
    getOrgEventTemplates(orgId),
    getOrgMembersWithUser(orgId),
  ]);

  if (serviceTypes.length === 0) {
    return new Response("No service types", { status: 422 });
  }

  // The one place calendar date + clock time become the stored floating-UTC
  // instants. The agent never sees a timezone.
  const deps: EventAgentDeps = {
    checkAvailability: ({ days, roles, maxPerRole }) =>
      getEligibilityByRole({
        organizationId: orgId,
        dates: days.map((d) => ({
          startTime: `${d.date}T${d.startTime}:00Z`,
          endTime: `${d.date}T${d.endTime}:00Z`,
        })),
        roles,
        ...(maxPerRole === undefined ? {} : { maxPerRole }),
      }),
  };

  const agent = createEventDraftAgent({
    orgName: membership.organization.name,
    today: resolveToday(today),
    serviceTypes,
    templates: templates.map((t) => ({
      name: t.name,
      dayOfWeek: t.dayOfWeek,
      location: t.location,
      description: t.description,
      days: t.days,
      rolesNeeded: t.rolesNeeded,
      expiresInDays: t.expiresInDays,
      smartSchedulingEnabled: t.smartSchedulingEnabled,
      serviceTypeId: t.serviceTypeId,
    })),
    roster: members.map((m) => ({
      userId: m.userId,
      name: `${m.user.firstName} ${m.user.lastName}`,
      volunteerRoles: m.volunteerRoles,
    })),
    deps,
  });

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
    timeout: 290_000,
  });
}
