
import { notFound } from "next/navigation";
// import {
//   getEventById,
//   getOrganizationById,
//   getCurrentUser,
//   getServiceTypesByOrganization,
// } from "@/lib/services/data"
import { AnimatedSection } from "@/components/dashboard/animate-section";
import { BackLink } from "@/components/dashboard/back-link-button";
import { EventHeader } from "@/components/dashboard/events/event-header";
import { EventPager } from "@/components/dashboard/events/event-pager";
import { EventDetailsCard } from "@/components/dashboard/events/event-details-card";
import { EventSetlistSection } from "@/components/dashboard/events/event-setlist-section";
import { EventAssignmentsCard } from "@/components/dashboard/events/event-assignment-section";
import { EventChatPanel } from "@/components/dashboard/events/event-chat-panel";
import { SmartSchedulingActivity } from "@/components/dashboard/events/smart-scheduling-activity";
// import { EventStatusCard } from "@/components/dashboard/events/event-status-card";
import { currentUser } from "@/lib/services/user";
import { getAdjacentEvents, getEventDetailsById } from "@/lib/services/events";
import { getUserSongKeys } from "@/lib/services/song-keys";
import { getEventSmartSchedulingActivity } from "@/lib/services/activity";
import { getEventMessages } from "@/lib/services/chat";
import {
  getOrgMembersWithUser,
  getUserMembershipRole,
} from "@/lib/services/organization";
import {
  eventTeamLeads,
  getTeamNotificationSettings,
} from "@/lib/services/team-notifications";
import { getOrgPlan } from "@/lib/billing/entitlements";
import { getEmailAllowance } from "@/lib/billing/limits";
import { PLAN_LIMITS } from "@/lib/config/plans";
import { TEAM_ORDER, teamsOfRoles, volunteerRoleConfig } from "@/lib/config/roles";
import type {
  TeamLeadChoices,
  TeamLeadPicks,
} from "@/components/dashboard/events/event-team-leads-field";
import { InvitationStatus, OrgRole } from "@/generated/prisma/enums";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string; eventId: string }>
}) {
  const [{ id: orgId, eventId }, user] = await Promise.all([
    params,
    currentUser(),
  ]);

  if (!user) notFound();

  const [event, membership] = await Promise.all([
    getEventDetailsById(eventId, orgId),
    getUserMembershipRole(user.id, orgId),
  ]);

  if (!event || !membership) notFound();

  const canManage = membership.role === OrgRole.ADMIN || membership.role === OrgRole.OWNER;

  
  const hasAssignment = event.assignments.some(
    (e) => e.userId === user.id && e.status === InvitationStatus.ACCEPTED,
  );

  const hasAccess = canManage || hasAssignment;

  if (!hasAccess) notFound();

  // Prev/next follow the same rule as the guard above, so a step never 404s.
  const adjacent = await getAdjacentEvents(eventId, orgId, user.id, canManage);

  // Offering the save-to-journal button comes off this event's roster, not off
  // the membership's volunteer roles — if you're singing here you get it, and
  // the roster is already loaded. The journal is read under the caller's own
  // tag, so one singer saving a key never busts the shared event cache.
  const isEventVocalist = event.assignments.some(
    (a) =>
      a.userId === user.id &&
      a.status === InvitationStatus.ACCEPTED &&
      volunteerRoleConfig[a.role].sings,
  );

  const myKeys = isEventVocalist ? await getUserSongKeys(user.id, orgId) : [];

  
  // Everyone past the guard above may read the chat; only accepted assignees post.
  const { messages: initialMessages } = await getEventMessages(eventId);

  // Only managers can invite, so members never pay for the roster
  const members = canManage ? await getOrgMembersWithUser(orgId) : [];

  const smartSchedulingActivity = canManage
    ? await getEventSmartSchedulingActivity(eventId, orgId)
    : [];

  // Managers only, like the auto-fill switch and Email Team they drive.
  const [emailAllowance, plan] = canManage
    ? await Promise.all([getEmailAllowance(orgId), getOrgPlan(orgId)])
    : [null, null];

  const smartSchedulingAvailable = plan !== null && PLAN_LIMITS[plan].smartScheduling;

  // Managers only, like the invite pickers and the edit dialog that use it.
  const teamSettings = canManage ? await getTeamNotificationSettings(orgId) : null;

  // Who handles each team here: whoever covers it on this event, else the
  // service type's lead.
  const teamLeads = teamSettings
    ? eventTeamLeads(teamSettings, event.serviceTypeId, event.teamLeads)
    : {};

  let editTeamLeads: { choices: TeamLeadChoices; picks: TeamLeadPicks } | undefined;

  if (teamSettings) {
    const managerIds = new Set(teamSettings.managers.map((manager) => manager.userId));

    // A pick who has since been made a member is already skipped by the
    // alerts, so the dialog doesn't offer it back either.
    const picks: TeamLeadPicks = Object.fromEntries(
      event.teamLeads
        .filter((pick) => managerIds.has(pick.userId))
        .map((pick) => [pick.category, pick.userId]),
    );

    const serviceTypeTeams =
      teamSettings.serviceTypes.find(
        (serviceType) => serviceType.serviceTypeId === event.serviceTypeId,
      )?.teams ?? [];

    const rosterTeams = teamsOfRoles([
      ...event.rolesNeeded,
      ...event.assignments.map((assignment) => assignment.role),
    ]);

    const creator = teamSettings.managers.find(
      (manager) => manager.userId === event.createdById,
    );

    editTeamLeads = {
      picks,
      choices: {
        teams: TEAM_ORDER.filter(
          (team) => rosterTeams.includes(team) || picks[team] !== undefined,
        ),
        defaults: Object.fromEntries(
          serviceTypeTeams.flatMap(({ team, lead }) => (lead ? [[team, lead]] : [])),
        ),
        managers: teamSettings.managers.map(({ userId, firstName, lastName }) => ({
          userId,
          firstName,
          lastName,
        })),
        viewerId: user.id,
        // With no lead, a team falls to the event's creator while they can
        // still act on it, else to the owners.
        fallback: creator
          ? creator.userId === user.id
            ? { userId: creator.userId, name: "You", short: "you" }
            : {
                userId: creator.userId,
                name: `${creator.firstName} ${creator.lastName}`,
                short: creator.firstName,
              }
          : { userId: null, name: "The owners", short: "the owners" },
        serviceTypeName: event.serviceType.name,
      },
    };
  }

  return (
    <main className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="space-y-6 sm:space-y-8">
        <AnimatedSection delay={0.05}>
          <div className="flex items-center justify-between gap-3">
            <BackLink
              href={`/dashboard/organizations/${orgId}`}
              label={`Back to ${event.organization.name}`}
            />
            <EventPager
              organizationId={orgId}
              serviceName={event.serviceType.name}
              serviceColor={event.serviceType.color}
              previous={adjacent.previous}
              next={adjacent.next}
            />
          </div>
        </AnimatedSection>

        <AnimatedSection delay={0.1}>
          <EventHeader
            event={event}
            serviceType={event.serviceType}
            canManage={canManage}
            teamLeads={editTeamLeads}
          />
        </AnimatedSection>

        {canManage && (
          <AnimatedSection delay={0.15}>
            <SmartSchedulingActivity
              enabled={event.smartSchedulingEnabled}
              available={smartSchedulingAvailable}
              items={smartSchedulingActivity}
            />
          </AnimatedSection>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <EventDetailsCard event={event} serviceType={event.serviceType} />
            <EventSetlistSection
              event={event}
              orgId={orgId}
              canManage={canManage}
              canSaveKeys={isEventVocalist}
              myKeys={myKeys}
            />
          </div>
          <div className="space-y-6">
            <EventAssignmentsCard
              event={event}
              currentUserId={user.id}
              canManage={canManage}
              members={members}
              emailAllowance={emailAllowance}
              smartSchedulingAvailable={smartSchedulingAvailable}
              canUpgrade={membership.role === OrgRole.OWNER}
              teamLeads={teamLeads}
            />
            <EventChatPanel
              eventId={eventId}
              serviceColor={event.serviceType.color}
              currentUserId={user.id}
              canPost={hasAssignment}
              me={{
                firstName: user.firstName,
                lastName: user.lastName,
                userImageUrl: user.userImageUrl,
              }}
              initialMessages={initialMessages}
            />
            {/* <EventStatusCard event={event} /> */}
          </div>
        </div>
      </div>
    </main>
  )
}