import { AnimatedSection } from "@/components/dashboard/animate-section";
import { BackLink } from "@/components/dashboard/back-link-button";
import { OrganizationHero } from "@/components/dashboard/organization-hero";
import { OrganizationStatsGrid } from "@/components/dashboard/org-stats-grid";
import { OrganizationTabsSection } from "@/components/dashboard/org-tabs-section";
import { NeedsResponseSection } from "@/components/dashboard/needs-response-section";
import { StatsGridSkeleton } from "@/components/dashboard/org-stats-skeleton";
import { TabsSkeleton } from "@/components/dashboard/org-tabs-skeleton";

import { notFound } from "next/navigation";
import { z } from "zod/v4";
import { Suspense } from "react";
import { getOrganizationDetailsById } from "@/lib/services/organization";
import { redirect } from "next/navigation";
import { OrgRole, VolunteerRole } from "@/generated/prisma/enums";
import { currentUser, userRoles } from "@/lib/services/user";


export default async function OrganizationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>
}) {
  const [{ id }, { tab = "events" }] = await Promise.all([
    params,
    searchParams,
  ]);

  const { data: orgId, success } = z.uuid().safeParse(id);
  
  if (!success) notFound();

  const user = await currentUser();

  if (!user) redirect('/sign-in');

  const { id: userId } = user;

  const [organization, roles] = await Promise.all([
    getOrganizationDetailsById(orgId, userId),
    userRoles(userId, orgId),
  ]);

  if (!organization) notFound();

  const userRole = organization.memberships[0].role;

  const canManage = userRole === OrgRole.OWNER || userRole === OrgRole.ADMIN;

  const isOwner = userRole === OrgRole.OWNER;

  // `roles` is already loaded for the hero, so gating the key journal tab on
  // volunteer roles costs no extra query.
  const volunteerRoles = roles?.volunteerRoles ?? [];

  const isVocalist =
    volunteerRoles.includes(VolunteerRole.LEAD_VOCALIST) ||
    volunteerRoles.includes(VolunteerRole.BGVS);


 return (
    <main className="mx-auto max-w-screen-2xl px-6 py-8">
      <div className="space-y-8">
        <AnimatedSection delay={0.05}>
          <BackLink href="/dashboard" label="Back to Dashboard" />
        </AnimatedSection>
 
        <AnimatedSection delay={0.1}>
          <OrganizationHero
            organization={organization}
            volunteerRoles={roles?.volunteerRoles ?? []}
          />
        </AnimatedSection>

        <Suspense fallback={<StatsGridSkeleton />}>
          <OrganizationStatsGrid
            organizationId={organization.id}
            userId={userId}
            canManage={canManage}
          />
        </Suspense>

        <Suspense fallback={null}>
          <NeedsResponseSection
            organizationId={organization.id}
            userId={userId}
            canManage={canManage}
          />
        </Suspense>
 
        <AnimatedSection delay={0.3}>
          <Suspense fallback={<TabsSkeleton />}>
            <OrganizationTabsSection
              organizationId={organization.id}
              organizationName={organization.name}
              canManage={canManage}
              isOwner={isOwner}
              userId={userId}
              activeTab={tab}
              isVocalist={isVocalist}
            />
          </Suspense>
        </AnimatedSection>
      </div>
    </main>
  )
}

