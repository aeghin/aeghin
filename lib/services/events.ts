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
            }
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

