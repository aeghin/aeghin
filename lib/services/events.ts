import "server-only";

import prisma from "@/lib/prisma";
import { InvitationStatus } from "@/generated/prisma/enums";
import { cacheLife, cacheTag } from "next/cache";
import { roleMeterOf, staffingTallies } from "@/lib/staffing";
import { parseRoleSpots } from "@/lib/role-spots";
import { MAX_BEHIND_UTC_MS, floatingNow } from "@/lib/time-zone";
import { getOrganizationTimeZone } from "@/lib/services/organization";


const DASHBOARD_ASSIGNMENT_STATUSES: InvitationStatus[] = [
  InvitationStatus.ACCEPTED,
  InvitationStatus.PENDING,
  InvitationStatus.EXPIRED,
];

/** Each event's last end, the moment it's over: floating, like its times. */
const lastEndOf = (dates: { endTime: Date }[]) =>
  Math.max(...dates.map((date) => date.endTime.getTime()));

/**
 * The last end of every event that could still be to come — the caller's
 * accepted ones, or the organization's for a manager. Wide by half a day
 * because no zone runs further behind UTC, which keeps an entry right however
 * long it is served; the exact test is made against the clock on every read,
 * by `userEventsTotalCount`.
 */
const upcomingEventEnds = async (userId: string, organizationId: string, canManage: boolean) => {
    "use cache"

    cacheLife("minutes");

    const after = new Date(Date.now() - MAX_BEHIND_UTC_MS);

    if (canManage) {
      cacheTag(`org-${organizationId}-events`);

      const events = await prisma.event.findMany({
        where: {
          organizationId,
          dates: { some: { endTime: { gte: after } } },
        },
        select: { dates: { select: { endTime: true } } },
      });

      return events.map((event) => lastEndOf(event.dates));
    }

    cacheTag(`user-${userId}-events-${organizationId}`);

    const assignments = await prisma.eventAssignment.findMany({
      where: {
        userId,
        organizationId,
        status: InvitationStatus.ACCEPTED,
        event: { dates: { some: { endTime: { gte: after } } } },
      },
      select: { event: { select: { dates: { select: { endTime: true } } } } },
    });

    return assignments.map((assignment) => lastEndOf(assignment.event.dates));
}

/**
 * Events still to come, on the organization's clock: event times are its wall
 * clock, and the real one would drop this morning's service before it began.
 * Read against the clock here rather than inside a cache, so a service drops
 * out of the count the moment it ends — as it does from the Events list.
 */
export const userEventsTotalCount = async (userId: string, organizationId: string, canManage: boolean) => {
    const [ends, timeZone] = await Promise.all([
      upcomingEventEnds(userId, organizationId, canManage),
      getOrganizationTimeZone(organizationId),
    ]);

    const ahead = floatingNow(timeZone).getTime();

    return ends.filter((end) => end >= ahead).length;
}

export const getUserEvents = async (organizationId: string, userId: string) => {
    "use cache"

    cacheLife("minutes");
    cacheTag(`user-${userId}-events-${organizationId}`);

  const events = await prisma.event.findMany({
      where: {
        organizationId,
        assignments: {
          some: {
            userId,
            status: { in: DASHBOARD_ASSIGNMENT_STATUSES }
          }
        }
      },
      include: {
        dates: true,
        assignments: {
          where: {
            userId,
            status: { in: DASHBOARD_ASSIGNMENT_STATUSES }
          },
          select: {
            id: true,
            userId: true,
            role: true,
            status: true,
            assignedBy: { 
              select: {
                firstName: true,
              }
            },
            expiresAt: true,
          }
        }
      }
    });

    return events;
};


// All events in the org, for owners/admins who oversee every event regardless
// of assignment. Includes the caller's own assignment (if any) so their role
// badge still shows, and each event's role meter for its card. Tagged org-wide
// so the list refreshes when events or anybody's answer to one change.
export const getOrgEvents = async (organizationId: string, userId: string) => {
    "use cache"

    cacheLife("minutes");
    cacheTag(`org-${organizationId}-events`);

  const [events, tallies] = await Promise.all([
    prisma.event.findMany({
      where: {
        organizationId,
      },
      include: {
        dates: true,
        assignments: {
          where: {
            userId,
            status: { in: DASHBOARD_ASSIGNMENT_STATUSES }
          },
          select: {
            id: true,
            userId: true,
            role: true,
            status: true,
            assignedBy: {
              select: {
                firstName: true,
              }
            },
            expiresAt: true,
          }
        }
      }
    }),
    staffingTallies(organizationId, new Date()),
  ]);

    return events.map((event) => ({
      ...event,
      roleSpots: parseRoleSpots(event.roleSpots),
      roleMeter: roleMeterOf(event.rolesNeeded, parseRoleSpots(event.roleSpots), tallies.get(event.id)),
    }));
};


type AdjacentEvent = {
  id: string
  name: string
  startTime: Date
};

type AdjacentEvents = {
  previous: AdjacentEvent | null
  next: AdjacentEvent | null
};

// The events either side of this one within its service type, for prev/next on
// the event page — Sunday steps to Sunday, never to the Wednesday in between.
// Walks the same two cached lists the Events tab reads, with the same arguments,
// so it shares their entries and tags and needs no cache of its own. Managers
// step through every event in the org; everyone else only through events
// they've accepted, the only ones the event page opens for them, so a step
// can't land on a 404.
export const getAdjacentEvents = async (
  eventId: string,
  organizationId: string,
  userId: string,
  canManage: boolean,
): Promise<AdjacentEvents> => {

  const events = canManage
    ? await getOrgEvents(organizationId, userId)
    : (await getUserEvents(organizationId, userId)).filter((event) =>
        event.assignments.some((a) => a.status === InvitationStatus.ACCEPTED),
      );

  const serviceTypeId = events.find((event) => event.id === eventId)?.serviceTypeId;

  // By first start time, like the schedule list. The id breaks ties so two
  // events at the same time can't trade places between pages and skip or loop.
  const timeline = events
    .filter((event) => event.serviceTypeId === serviceTypeId && event.dates.length > 0)
    .map((event) => ({
      id: event.id,
      name: event.name,
      startTime: new Date(
        Math.min(...event.dates.map((d) => d.startTime.getTime())),
      ),
    }))
    .sort(
      (a, b) =>
        a.startTime.getTime() - b.startTime.getTime() ||
        a.id.localeCompare(b.id),
    );

  const index = timeline.findIndex((event) => event.id === eventId);

  // Only while a cached list is catching up with a change made a moment ago.
  if (index === -1) return { previous: null, next: null };

  return {
    previous: timeline[index - 1] ?? null,
    next: timeline[index + 1] ?? null,
  };
};


export const getEventDetailsById = async (eventId: string, organizationId: string) => {
  
  "use cache";

  cacheLife("hours");

  cacheTag(`event-${eventId}-org-${organizationId}-details`);
  cacheTag(`org-${organizationId}-songs`);
  cacheTag(`org-${organizationId}-st`);

  const details = await prisma.event.findFirst({
      where: {
        id: eventId,
        organizationId
      },
      include: {
        organization: {
          select: {
            name: true
          }
        },
        dates: { orderBy: { startTime: "asc" } },
        serviceType: true,
        // A dismissed decline stays for the member's acceptance record, but
        // isn't on the roster.
        assignments: {
          where: { dismissedAt: null },
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                userImageUrl: true,
              }
            },
            // Who sent it, for the invite screen's "already waiting" warning.
            assignedBy: {
              select: {
                firstName: true,
                lastName: true,
              }
            }
          }
        },
        // Who handles a team on this event only, in place of its lead.
        teamLeads: {
          select: {
            category: true,
            userId: true,
          }
        },
        setlistSongs: {
          orderBy: { position: "asc" },
          include: {
            song: {
              select: {
                id: true,
                title: true,
                artist: true,
                youtubeUrl: true,
                spotifyUrl: true,
                attachments: {
                  orderBy: { createdAt: "asc" }
                }
              }
            },
            // The arrangement this event plays, null for the Original.
            arrangement: {
              select: {
                name: true,
                useSongLinks: true,
                spotifyUrl: true,
                youtubeUrl: true,
              }
            },
            setlistSongAssignment: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                    userImageUrl: true,
                  }
                }
              }
            }
          }
        }
      }
    });

    return details && { ...details, roleSpots: parseRoleSpots(details.roleSpots) };

}


type OrgAssignmentCounts = {
  pending: number
  upcoming: number
};

/**
 * The caller's accepted and pending assignments whose events could still be to
 * come, with what `getAssignmentCountsByOrg` needs to finish the test against
 * the clock: each organization's zone, each event's last end, each deadline.
 * Wide by half a day, which no zone runs further behind UTC than.
 */
const assignmentsAhead = async (userId: string) => {

  "use cache";

  cacheLife("minutes");

  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: { organizationId: true, organization: { select: { timeZone: true } } },
  });

  for (const m of memberships) {
    cacheTag(`user-${userId}-events-${m.organizationId}`);
    // A new time zone moves what counts as still to come.
    cacheTag(`org-${m.organizationId}-details`);
  }

  const assignments = await prisma.eventAssignment.findMany({
    where: {
      userId,
      organizationId: { in: memberships.map((m) => m.organizationId) },
      status: { in: [InvitationStatus.ACCEPTED, InvitationStatus.PENDING] },
      event: {
        dates: { some: { endTime: { gte: new Date(Date.now() - MAX_BEHIND_UTC_MS) } } },
      },
    },
    select: {
      organizationId: true,
      status: true,
      expiresAt: true,
      event: { select: { dates: { select: { endTime: true } } } },
    },
  });

  return {
    zones: memberships.map((m) => [m.organizationId, m.organization.timeZone] as const),
    assignments: assignments.map((assignment) => ({
      organizationId: assignment.organizationId,
      accepted: assignment.status === InvitationStatus.ACCEPTED,
      expiresAt: assignment.expiresAt.getTime(),
      lastEnd: lastEndOf(assignment.event.dates),
    })),
  };
};

// Per-org assignment counts for the dashboard org cards. Lives here rather than
// on getUserOrganizations because these numbers move on accept/decline, which
// busts `user-${userId}-events-${orgId}` — a tag the org-list query never carries.
//
// Counted against the clock on every read, not inside the cache: a service is
// over at its end on its organization's clock, and an invitation at its
// deadline, whenever the cached rows were read.
export const getAssignmentCountsByOrg = async (userId: string) => {
  const { zones, assignments } = await assignmentsAhead(userId);
  const now = new Date();

  const counts: Record<string, OrgAssignmentCounts> = {};
  const ahead = new Map<string, number>();

  for (const [organizationId, timeZone] of zones) {
    counts[organizationId] = { pending: 0, upcoming: 0 };
    ahead.set(organizationId, floatingNow(timeZone, now).getTime());
  }

  for (const assignment of assignments) {
    const entry = counts[assignment.organizationId];
    const from = ahead.get(assignment.organizationId);
    if (!entry || from === undefined || assignment.lastEnd < from) continue;

    if (assignment.accepted) entry.upcoming += 1;
    else if (assignment.expiresAt > now.getTime()) entry.pending += 1;
  }

  return counts;
};

