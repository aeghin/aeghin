import { Suspense } from "react";
import { UserButton } from "@clerk/nextjs";
import {
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  NotificationsBell,
  NotificationsBellSkeleton,
} from "@/components/dashboard/navbar/notifications-bell";
import { PremiumNav } from "@/components/dashboard/navbar/premium-nav";
import { ThemeSwitch } from "@/components/dashboard/navbar/theme-switch";
import { getOrgShell } from "./get-org-shell";
import { OrgBreadcrumb } from "./org-breadcrumb";
import { OrgSidebar } from "./org-sidebar";

type OrgParams = Promise<{ id: string }>;

// Fixed widths: shadcn's SidebarMenuSkeleton picks a random one, which differs
// between the server's HTML and the browser's first render.
const SKELETON_WIDTHS = ["w-24", "w-16", "w-20", "w-18", "w-14", "w-20"];

/** The menu's place inside the sidebar while the shell's data resolves. */
export function OrgSidebarSkeleton() {
  return (
    <SidebarContent className="pt-3">
      <SidebarMenu className="gap-0.5 px-2">
        <SidebarMenuItem className="mb-3 flex h-12 items-center gap-2.5 px-2">
          <div className="size-8 shrink-0 animate-pulse rounded-lg bg-sidebar-accent" />
          <div className="h-4 w-28 animate-pulse rounded bg-sidebar-accent group-data-[collapsible=icon]:hidden" />
        </SidebarMenuItem>
        {SKELETON_WIDTHS.map((width, index) => (
          <SidebarMenuItem key={index} className="flex h-8.5 items-center gap-2.5 px-2.5">
            <div className="size-4.5 shrink-0 animate-pulse rounded bg-sidebar-accent" />
            <div className={`h-3.5 ${width} animate-pulse rounded bg-sidebar-accent group-data-[collapsible=icon]:hidden`} />
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarContent>
  );
}

export async function OrgSidebarSection({ params }: { params: OrgParams }) {
  const { id } = await params;
  const shell = await getOrgShell(id);

  if (!shell) return null;

  return <OrgSidebar shell={shell} />;
}

async function OrgBreadcrumbSection({ params }: { params: OrgParams }) {
  const { id } = await params;
  const shell = await getOrgShell(id);

  if (!shell) return null;

  return (
    <OrgBreadcrumb
      orgId={shell.organization.id}
      canManage={shell.canManage}
      isVocalist={shell.isVocalist}
    />
  );
}

/**
 * The bar across the top of every page inside an org. Same height as the old
 * global navbar (h-14), so pages sized against `100dvh - 3.5rem` still fit.
 */
export function OrgTopbar({ params }: { params: OrgParams }) {
  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur-xl supports-backdrop-filter:bg-background/80 sm:px-4 lg:px-6">
      <SidebarTrigger className="-ml-1 size-9 cursor-pointer text-foreground-soft" />
      <Suspense fallback={null}>
        <OrgBreadcrumbSection params={params} />
      </Suspense>

      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <div className="hidden sm:block">
          <PremiumNav />
        </div>
        <Suspense fallback={<NotificationsBellSkeleton />}>
          <NotificationsBell />
        </Suspense>
        <ThemeSwitch className="hidden sm:inline-flex" />
        <UserButton appearance={{ elements: { avatarBox: { width: "32px", height: "32px" } } }} />
      </div>
    </header>
  );
}
