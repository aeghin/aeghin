import { Users, Mail, Calendar, Music } from "lucide-react";
import { AnimatedSection } from "@/components/dashboard/animate-section";
import { StatsCard } from "@/components/dashboard/stats-card";
import { getOrgMemberCountById, getUserVolunteerRolesByOrg } from "@/lib/services/organization";
import { userEventsTotalCount, getUserEvents } from "@/lib/services/events";
import { getSeatUsage } from "@/lib/billing/limits";
import { PLAN_NAMES } from "@/lib/config/plans";
import { InvitationStatus } from "@/generated/prisma/enums";


interface OrganizationStatsGridProps {
  organizationId: string
  userId: string
  canManage: boolean
};

export const OrganizationStatsGrid = async ({
  organizationId,
  userId,
  canManage,
}: OrganizationStatsGridProps) => {

  const [memberCount, userRolesCount, upcomingCount, userEvents, seatUsage] = await Promise.all([
    getOrgMemberCountById(organizationId),
    getUserVolunteerRolesByOrg(organizationId, userId),
    userEventsTotalCount(userId, organizationId, canManage),
    getUserEvents(organizationId, userId),
    getSeatUsage(organizationId),
  ]);

  // Invites still open for a reply: pending, not expired, event not over.
  const now = new Date();
  const pendingCount = userEvents.filter(
    (event) =>
      event.assignments.some(
        (a) => a.status === InvitationStatus.PENDING && a.expiresAt > now,
      ) && event.dates.some((d) => d.endTime >= now),
  ).length;

  // Only managers invite, so only they see the cap. Pending invites hold seats
  // too, which is why they come off what's left.
  let membersValue: string | number = memberCount;
  let membersDescription = "In this organization";
  let membersHighlight = false;

  if (canManage && seatUsage) {
    const planName = PLAN_NAMES[seatUsage.plan];
    const left = seatUsage.left === 0 ? `${planName} limit reached` : `${seatUsage.left} left on ${planName}`;

    membersValue = `${memberCount} / ${seatUsage.limit}`;
    membersDescription =
      seatUsage.pendingInvites > 0 ? `${seatUsage.pendingInvites} invited · ${left}` : left;
    membersHighlight = seatUsage.left === 0;
  }

  const statCards = [
    {
      title: "Members",
      value: membersValue,
      icon: Users,
      description: membersDescription,
      highlight: membersHighlight,
    },
    {
      title: canManage ? "Upcoming Events" : "My Upcoming Events",
      value: upcomingCount,
      icon: Calendar,
      description: canManage ? "Across the organization" : "You're scheduled to serve",
    },
    {
      title: "Pending Responses",
      value: pendingCount,
      icon: Mail,
      description: "Invites awaiting your reply",
    },
    {
      title: "My Roles",
      value: userRolesCount,
      icon: Music,
      description: "Volunteer positions you fill",
    },
  ];

  return (
    <AnimatedSection delay={0.2} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {statCards.map((stat, i) => (
        <AnimatedSection key={stat.title} delay={0.25 + i * 0.05} transition={{ duration: 0.3 }}>
          <StatsCard {...stat} />
        </AnimatedSection>
      ))}
    </AnimatedSection>
  )
}
