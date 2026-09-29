import "server-only";

import prisma from "@/lib/prisma";
import type { RoleCategory as Team } from "@/generated/prisma/enums";
import TeamLeadEmail from "@/components/email/team-lead-template";
import { volunteerRoleLabels } from "@/lib/activity";
import { roleToCategory, teamLabel, teamOfRole } from "@/lib/config/roles";
import { organizationSender } from "@/lib/email/organization";
import { sendEmailBatches } from "@/lib/email/send";
import { sendPushNotices } from "@/lib/push/send";

/**
 * Tells somebody, once, that an owner has made them a team's lead — so the
 * first decline they're asked to fill doesn't arrive out of nowhere.
 *
 * Best effort: the lead is already set, and a failure is logged rather than
 * surfaced to the owner who set it.
 */
export async function notifyNewTeamLead({
  organizationId,
  team,
  userId,
  assignedByName,
}: {
  organizationId: string;
  team: Team;
  userId: string;
  assignedByName: string;
}): Promise<void> {
  try {
    const [lead, organization] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, firstName: true },
      }),
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true, logoUrl: true },
      }),
    ]);

    if (!lead || !organization) return;

    const label = teamLabel(team);

    const roleLabels = (Object.keys(roleToCategory) as (keyof typeof roleToCategory)[])
      .filter((role) => teamOfRole(role) === team)
      .map((role) => volunteerRoleLabels[role])
      .join(", ");

    await sendEmailBatches("team lead assigned", [
      {
        from: organizationSender(organization.name),
        to: lead.email,
        subject: `You're now the ${label} lead at ${organization.name}`,
        react: TeamLeadEmail({
          recipientName: lead.firstName,
          organizationName: organization.name,
          logoUrl: organization.logoUrl,
          teamLabel: label,
          roleLabels,
          assignedByName,
          settingsLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${organizationId}?tab=settings`,
        }),
      },
    ]);

    await sendPushNotices("team lead assigned", [
      {
        email: lead.email,
        title: `You're the ${label} lead`,
        subtitle: organization.name,
        body: `${assignedByName} made you the ${label} lead. You'll now get ${label} staffing alerts.`,
        data: { type: "organization", organizationId },
      },
    ]);
  } catch (err) {
    console.error(`Failed to tell a new ${team} lead in org ${organizationId}`, err);
  }
}
