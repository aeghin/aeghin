import "server-only";

import prisma from "../prisma";
import { cacheLife, cacheTag } from 'next/cache';
import { zoneOrFallback } from '@/lib/time-zone';
import { InvitationStatus } from "@/generated/prisma/enums";

export const getOrganizationDetailsById = async (id: string, userId: string) => {
    "use cache";

    cacheLife('minutes');

    cacheTag(`org-${id}-details`);
    cacheTag(`user-${userId}-org-${id}-role`);

  const organization = await prisma.organization.findUnique({
    where: {
      id,
    },
    include: {
      memberships: {
        where: {
          userId
        },
        select: {
          role: true,
        },
      },
    },
  });

  if (!organization || organization.memberships.length === 0) {
    return null;
  };

  return organization;
};


export const getUserOrganizations = async (userId: string) => {

  "use cache";

  cacheLife('hours');

  cacheTag(`user-${userId}-orgs`)

  
  const user = await prisma.user.findUnique({
  where: { id: userId },
  include: {
    memberships: {
      include: {
        organization: {
          include: {
            _count: {
              select: {
                invitations: {
                  where: {
                    status: InvitationStatus.PENDING
                  },
                },
                memberships: true,
              },
            },
          },
        },
      },
    },
  },
});

if (!user) return [];
  
    
   const organizations = user?.memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      description: m.organization.description,
      logoUrl: m.organization.logoUrl,
      role: m.role,
      memberCount: m.organization._count.memberships,
      invitationCount: m.organization._count.invitations,
      volunteerRoles: m.volunteerRoles,
    }));

    for (const o of organizations) {
      cacheTag(`org-${o.id}-list-entry`);
    };

    return organizations;
};

export const getOrgMemberCountById = async (organizationId: string) => {

  "use cache";

  cacheLife('hours');

  cacheTag(`org-${organizationId}-member-count`);

  const count = await prisma.membership.count({
    where: {
      organizationId
    }
  });

  return count;
};

export const organizationMembersList = async (organizationId: string) => {

  "use cache";

  cacheLife("hours");

  cacheTag(`org-${organizationId}-members-list`);


  const members = await prisma.membership.findMany({
    where: {
      organizationId,
    },
    orderBy: [
      { createdAt: "asc" },
      { id: "asc" },
    ],
    select: {
      organizationId: true,
      volunteerRoles: true,
      role: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phoneNumber: true,
          userImageUrl: true,
          createdAt: true
        }
      },
    }
  });

  return members;

};


export const getUserMembershipCount = async (userId: string) => {
  
  "use cache";
  
  cacheLife("hours");

  cacheTag(`user-${userId}-memberships`);


  const count = await prisma.membership.count({
      where: {
        userId
      },
    });

    return count;

};

export const getUserMembershipRole = async (userId: string, organizationId: string) => {

  "use cache"

  cacheLife("hours");

  cacheTag(`user-${userId}-org-${organizationId}-role`);

  const role = await prisma.membership.findUnique({
        where: {
          userId_organizationId: {
            userId,
            organizationId,
          },
        },
        select: {
          role: true
        }
      });

      return role;
};

export const getUserMembershipWithOrg = async (userId: string, organizationId: string) => {

  "use cache";

  cacheLife("hours");

  cacheTag(`user-${userId}-org-${organizationId}-role`);

  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      organizationId,
    },
    include: {
      organization: {
        select: {
          name: true,
        },
      },
    },
  });

  return membership;
};

export const getOrgMembersWithUser = async (organizationId: string) => {

  "use cache";

  cacheLife("hours");

  cacheTag(`org-${organizationId}-members-list`);

  const members = await prisma.membership.findMany({
    where: {
      organizationId,
    },
    include: {
      user: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          userImageUrl: true,
        },
      },
    },
  });

  return members;
};


/**
 * The organization's IANA zone: what its event times — floating wall clock —
 * are compared to the real clock in (lib/time-zone.ts). Carries the details tag,
 * which every edit of the organization expires.
 */
export const getOrganizationTimeZone = async (organizationId: string): Promise<string> => {

  "use cache";

  cacheLife("hours");

  cacheTag(`org-${organizationId}-details`);

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { timeZone: true },
  });

  return zoneOrFallback(organization?.timeZone);
};


export const getOrganizationSettings = async (organizationId: string) => {

  "use cache";

  cacheLife("hours");

  cacheTag(`org-${organizationId}-setting-details`);
  cacheTag(`org-${organizationId}-st`);

  const details = await prisma.organization.findUnique({
    where: {
      id: organizationId
    },
    select: {
      name: true,
      description: true,
      logoUrl: true,
      timeZone: true,
      serviceTypes: {
        where: { deletedAt: null }
      }
    }
  });

  return details;

};