import { Suspense } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import {
  OrgSidebarSection,
  OrgSidebarSkeleton,
  OrgTopbar,
} from "@/components/dashboard/org-shell/org-shell-parts";
import { OrgSidebarFrame } from "@/components/dashboard/org-shell/org-sidebar";

// Every page inside an organization shares this shell: the sidebar (a sheet on
// phones, an icon rail when collapsed) and the top bar. The user-specific parts
// stream in behind their own Suspense boundaries, as Cache Components requires
// in a layout. The sidebar frame stays outside its boundary so it hydrates with
// the provider (see OrgSidebarFrame); only the menu inside it waits for data.
export default function OrganizationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  return (
    // The icon rail is a touch wider than shadcn's 3rem, so its buttons can be
    // 36px targets (see RAIL_TARGET in org-sidebar.tsx).
    <SidebarProvider style={{ "--sidebar-width-icon": "3.25rem" } as React.CSSProperties}>
      <OrgSidebarFrame>
        <Suspense fallback={<OrgSidebarSkeleton />}>
          <OrgSidebarSection params={params} />
        </Suspense>
      </OrgSidebarFrame>
      <div className="relative flex w-full min-w-0 flex-1 flex-col bg-background">
        <OrgTopbar params={params} />
        {children}
      </div>
    </SidebarProvider>
  );
}
