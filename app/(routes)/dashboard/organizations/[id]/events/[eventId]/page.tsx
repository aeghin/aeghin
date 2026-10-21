
import { notFound } from "next/navigation";
// import {
//   getEventById,
//   getOrganizationById,
//   getCurrentUser,
//   getServiceTypesByOrganization,
// } from "@/lib/services/data"
import { AnimatedSection } from "@/components/dashboard/animate-section";
import { EventHeader } from "@/components/dashboard/events/event-header";
import { EventPager } from "@/components/dashboard/events/event-pager";
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
  getOrganizationTimeZone,
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
import { floatingNow } from "@/lib/time-zone";

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

  const [event, membership, timeZone] = await Promise.all([
    getEventDetailsById(eventId, orgId),
    getUserMembershipRole(user.id, orgId),
    getOrganizationTimeZone(orgId),
  ]);

  if (!event || !membership) notFound();

  const canManage = membership.role === OrgRole.ADMIN || membership.role === OrgRole.OWNER;

  
  const ownSpot = event.assignments.find(
    (e) => e.userId === user.id && e.status === InvitationStatus.ACCEPTED,
  );
  const hasAssignment = !!ownSpot;

  const hasAccess = canManage || hasAssignment;

  if (!hasAccess) notFound();

  // The church's clock, which event times are written in: what "today" is,
  // which blocks are over, and whether it has started.
  const now = floatingNow(timeZone);

  // "Can't make it" sits in the header's ⋮ until the event starts; the action
  // holds to the same rule. Only a manager can still open it afterwards.
  const withdraw =
    ownSpot && !event.dates.some((date) => date.startTime.getTime() <= now.getTime())
      ? { roleLabel: volunteerRoleConfig[ownSpot.role].label, stays: canManage }
      : undefined;

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
    <main className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="space-y-6 sm:space-y-8">
        <AnimatedSection delay={0.05}>
          <EventHeader
            event={event}
            serviceType={event.serviceType}
            canManage={canManage}
            teamLeads={editTeamLeads}
            withdraw={withdraw}
            now={now}
            pager={
              <EventPager
                organizationId={orgId}
                serviceName={event.serviceType.name}
                serviceColor={event.serviceType.color}
                previous={adjacent.previous}
                next={adjacent.next}
              />
            }
          />
        </AnimatedSection>

        {/* From lg, two columns that fill the width: the setlist with the chat
            under it on the wide side, staffing (Smart Scheduling over the
            Team) on the narrow one. Below lg each column wrapper is
            `contents`, so the four cards stack in the order they always have:
            Smart Scheduling, setlist, team, chat. */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
          <div className="contents lg:block lg:space-y-6">
            <div className="order-2 lg:order-none">
              <EventSetlistSection
                event={event}
                orgId={orgId}
                canManage={canManage}
                canSaveKeys={isEventVocalist}
                myKeys={myKeys}
              />
            </div>
            <div className="order-4 lg:order-none">
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
            </div>
          </div>
          <div className="contents lg:block lg:space-y-6">
            {canManage && (
              <AnimatedSection delay={0.15} className="order-1 lg:order-none">
                <SmartSchedulingActivity
                  enabled={event.smartSchedulingEnabled}
                  available={smartSchedulingAvailable}
                  items={smartSchedulingActivity}
                  timeZone={timeZone}
                  serviceColor={event.serviceType.color}
                />
              </AnimatedSection>
            )}
            <div className="order-3 lg:order-none">
              <EventAssignmentsCard
                event={event}
                currentUserId={user.id}
                canManage={canManage}
                canWithdraw={!!withdraw}
                members={members}
                emailAllowance={emailAllowance}
                smartSchedulingAvailable={smartSchedulingAvailable}
                canUpgrade={membership.role === OrgRole.OWNER}
                teamLeads={teamLeads}
              />
            </div>
            {/* <EventStatusCard event={event} /> */}
          </div>
        </div>
      </div>
    </main>
  )
}