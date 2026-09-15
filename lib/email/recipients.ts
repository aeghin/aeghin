import "server-only";

import prisma from "@/lib/prisma";
import { OrgRole } from "@/generated/prisma/enums";

export type EmailRecipient = { email: string; firstName: string };

/**
 * Who hears that an event has been left short.
 *
 * The event's creator, when they are still someone who could act on it. Three
 * things can make them not: `Event.createdById` is nullable and `SetNull`, so
 * it empties when the account is deleted; the creator may have left the
 * organization; and they may have been demoted to MEMBER, who cannot staff an
 * event anyway.
 *
 * In any of those cases this falls back to the organization's owners, which is
 * never an empty list — `leaveOrganization` refuses to let the last owner go,
 * and `assignOwnerRole` is the only way out of that. So the result is one
 * person in the ordinary case and never nobody, which is the property that
 * matters: a hole in the roster that notifies no one is the bug being fixed.
 */
export async function eventStaffingRecipients(
  organizationId: string,
  createdById: string | null,
): Promise<EmailRecipient[]> {
  if (createdById) {
    const creator = await prisma.membership.findUnique({
      where: {
        userId_organizationId: { userId: createdById, organizationId },
      },
      select: {
        role: true,
        user: { select: { email: true, firstName: true } },
      },
    });

    if (creator && creator.role !== OrgRole.MEMBER) {
      return [creator.user];
    }
  }

  const owners = await prisma.membership.findMany({
    where: { organizationId, role: OrgRole.OWNER },
    select: { user: { select: { email: true, firstName: true } } },
  });

  return owners.map((owner) => owner.user);
}
