import { Suspense } from "react";
import { EventsTabContent } from "@/components/dashboard/events-tab-content";
import { MembersTabContent } from "@/components/dashboard/members-tab-content";
import { InvitationsTabContent } from "@/components/dashboard/invitations-tab-content";
import { SettingsTabContent } from "@/components/dashboard/settings-tab-content";
import { SettingsTabSkeleton } from "@/components/dashboard/settings-tab-skeleton";
import { TemplatesTabContent } from "@/components/dashboard/templates-tab-content";
import { TemplatesTabSkeleton } from "@/components/dashboard/templates-tab-skeleton";
import { OrgTabNav } from "./org-tab-nav";
import { EventsTabSkeleton } from "@/components/dashboard/events-tab-skeleton";
import { MembersTabSkeleton } from "@/components/dashboard/members-tab-skeleton";
import { InvitationsTabSkeleton } from "@/components/dashboard//invitations-tab-skeleton";
import { BlockoutsTabContent } from "@/components/dashboard/blockouts-tab-content";
import { BlockoutsTabSkeleton } from "@/components/dashboard/blockouts-tab-skeleton";
import { ActivityTabContent } from "@/components/dashboard/activity-tab-content";
import { ActivityTabSkeleton } from "@/components/dashboard/activity-tab-skeleton";

import { getOrgMemberCountById } from "@/lib/services/organization";
import { userEventsTotalCount } from "@/lib/services/events";

interface OrganizationTabsSectionProps {
  organizationId: string;
  organizationName: string;
  canManage: boolean;
  isOwner: boolean;
  userId: string;
  activeTab: string;
};

export const OrganizationTabsSection = async ({
  organizationId,
  organizationName,
  canManage,
  isOwner,
  userId,
  activeTab,
}: OrganizationTabsSectionProps) => {
  const validTabs = ["events", "members", "blockouts", "invitations", "templates", "activity", "settings"];
  const tab = validTabs.includes(activeTab) ? activeTab : "events";


  const effectiveTab =
    (tab === "invitations" || tab === "templates" || tab === "activity") && !canManage ? "events" : tab;
 
    const [totalEventsCount, totalMembersCount] = await Promise.all([
      userEventsTotalCount(userId, organizationId, canManage),
      getOrgMemberCountById(organizationId)
    ]);

    const counts = {
      events: totalEventsCount,
      members: totalMembersCount
    };

  return (
    <div className="space-y-6">
      <OrgTabNav
        activeTab={effectiveTab}
        canManage={canManage}
        counts={counts}
      />
 
      <div className="mt-6">
        {effectiveTab === "events" && (
          <Suspense fallback={<EventsTabSkeleton canManage={canManage} />}>
            <EventsTabContent
              organizationId={organizationId}
              canManage={canManage}
              userId={userId}
            />
          </Suspense>
        )}
 
        {effectiveTab === "members" && (
          <Suspense fallback={<MembersTabSkeleton />}>
            <MembersTabContent
              organizationId={organizationId}
              organizationName={organizationName}
              userId={userId}
            />
          </Suspense>
        )}
 
        {effectiveTab === "blockouts" && (
          <Suspense fallback={<BlockoutsTabSkeleton />}>
            <BlockoutsTabContent
              organizationId={organizationId}
              userId={userId}
            />
          </Suspense>
        )}

        {effectiveTab === "invitations" && canManage && (
          <Suspense fallback={<InvitationsTabSkeleton />}>
            <InvitationsTabContent
              organizationId={organizationId}
            />
          </Suspense>
        )}

        {effectiveTab === "templates" && canManage && (
          <Suspense fallback={<TemplatesTabSkeleton />}>
            <TemplatesTabContent
              organizationId={organizationId}
            />
          </Suspense>
        )}

        {effectiveTab === "activity" && canManage && (
          <Suspense fallback={<ActivityTabSkeleton />}>
            <ActivityTabContent
              organizationId={organizationId}
            />
          </Suspense>
        )}
 
        {effectiveTab === "settings" && (
          <Suspense fallback={<SettingsTabSkeleton />}>
            <SettingsTabContent
              organizationId={organizationId}
              canManage={canManage}
              isOwner={isOwner}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
};
