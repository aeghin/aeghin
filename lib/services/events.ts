import "server-only";

import prisma from "@/lib/prisma";
import { InvitationStatus } from "@/generated/prisma/enums";
import { cacheLife, cacheTag } from "next/cache";


const DASHBOARD_ASSIGNMENT_STATUSES: InvitationStatus[] = [
  InvitationStatus.ACCEPTED,
  InvitationStatus.PENDING,
  InvitationStatus.EXPIRED,
];

export const userEventsTotalCount = async (userId: string, organizationId: string, canManage: boolean) => {
    "use cache"

    cacheLife("minutes");

    if (canManage) {
      cacheTag(`org-${organizationId}-events`);

      return prisma.event.count({
        where: {
          organizationId,
          dates: {
            some: {
              endTime: {
                gte: new Date(),
              }
            }
          }
        },
      });
    }

    cacheTag(`user-${userId}-events-${organizationId}`);

    const count = await prisma.eventAssignment.count({
        where: {
          userId,
          organizationId,
          status: InvitationStatus.ACCEPTED,
          event: {
            dates: {
              some: {
                endTime: {
                  gte: new Date(),
                }
              }
            }
          }
        },
      });

      return count;
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
// badge still shows. Tagged org-wide so the list refreshes when events change.
export const getOrgEvents = async (organizationId: string, userId: string) => {
    "use cache"

    cacheLife("minutes");
    cacheTag(`org-${organizationId}-events`);

  const events = await prisma.event.findMany({
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
    });

    return events;
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
        assignments: {
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

    return details;

}


type OrgAssignmentCounts = {
  pending: number
  upcoming: number
};

// Per-org assignment counts for the dashboard org cards. Lives here rather than
// on getUserOrganizations because these numbers move on accept/decline, which
// busts `user-${userId}-events-${orgId}` — a tag the org-list query never carries.
export const getAssignmentCountsByOrg = async (userId: string) => {

  "use cache";

  cacheLife("minutes");

  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: { organizationId: true },
  });

  for (const m of memberships) {
    cacheTag(`user-${userId}-events-${m.organizationId}`);
  }

  const now = new Date();

  const grouped = await prisma.eventAssignment.groupBy({
    by: ["organizationId", "status"],
    where: {
      userId,
      event: {
        dates: {
          some: {
            endTime: { gte: now },
          },
        },
      },
      OR: [
        { status: InvitationStatus.ACCEPTED },
        { status: InvitationStatus.PENDING, expiresAt: { gt: now } },
      ],
    },
    _count: { _all: true },
  });

  const counts: Record<string, OrgAssignmentCounts> = {};

  for (const m of memberships) {
    counts[m.organizationId] = { pending: 0, upcoming: 0 };
  }

  for (const row of grouped) {
    const entry = counts[row.organizationId];
    if (!entry) continue;

    if (row.status === InvitationStatus.ACCEPTED) entry.upcoming = row._count._all;
    else entry.pending = row._count._all;
  }

  return counts;
};

