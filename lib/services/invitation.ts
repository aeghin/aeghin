import "server-only"

import prisma from "../prisma";
import { cacheLife, cacheTag } from "next/cache";

export const verifyInvitationByToken = async (token: string) => {

    const invitation = await prisma.invitation.findUnique({
    where: {
      token,
    },
    include: {
      organization: true,
      invitedBy: true,
    },
  });

  if (!invitation) return null

  return invitation;

};

export const organizationInvitations = async (organizationId: string) => {
  "use cache"

  cacheLife("minutes");

  cacheTag(`invitations-${organizationId}-list`);
  
 const invitations = await prisma.invitation.findMany({
    where: {
      organizationId
    },
    orderBy: {
      createdAt: "desc"
    },
    include: {
      invitedBy: {
        select: {
          firstName: true, 
          lastName: true
        }
      }
    }
  });

  return invitations;

};