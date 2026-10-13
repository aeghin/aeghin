"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavIcon } from "@/components/icons/nav-icons";
import { PremiumNav } from "@/components/dashboard/navbar/premium-nav";
import { ThemeSwitch } from "@/components/dashboard/navbar/theme-switch";
import { OrgMark } from "./org-mark";
import {
  activeOrgNavKey,
  orgBasePath,
  orgNavHref,
  visibleOrgNav,
  type OrgNavItem,
} from "./org-nav-config";
import type { OrgShell } from "./get-org-shell";

// The active row is raised onto the page colour with a hairline shadow and an
// orange icon, as in the design system; every other icon stays muted.
const MENU_BUTTON =
  "h-8.5 gap-2.5 px-2.5 text-sidebar-foreground [&>svg]:size-4.5 [&>svg]:text-muted-foreground " +
  "data-[active=true]:bg-background data-[active=true]:text-foreground data-[active=true]:shadow-xs " +
  "data-[active=true]:[&>svg]:text-primary dark:data-[active=true]:bg-sidebar-accent";

/** On a phone the sidebar is a sheet; picking a page should put it away. */
function useCloseOnPhone() {
  const { isMobile, setOpenMobile } = useSidebar();
  return () => {
    if (isMobile) setOpenMobile(false);
  };
}

/**
 * The sidebar itself — desktop panel, icon rail, or phone sheet — and the
 * brand row, which needs no data. It renders outside the shell's Suspense
 * boundary on purpose: the phone/desktop switch reads the viewport after the
 * first render, and a boundary that streamed in later would hydrate desktop
 * markup against a phone sheet (React #418). Only the menu (children) waits.
 */
export function OrgSidebarFrame({ children }: { children: React.ReactNode }) {
  const closeOnPhone = useCloseOnPhone();

  return (
    <Sidebar collapsible="icon">
      {/* The brand row is the top bar's height (h-14) with its own bottom
          border, so the two lines meet in one straight rule across the page. */}
      <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-4 group-data-[collapsible=icon]:px-2">
        <Link
          href="/dashboard"
          onClick={closeOnPhone}
          className="flex items-center gap-2.5 rounded-md outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <img src="/aeghin-icon.svg" alt="" className="size-7 shrink-0 rounded-lg group-data-[collapsible=icon]:size-8" />
          <span className="font-brand text-base font-semibold tracking-tight text-foreground group-data-[collapsible=icon]:hidden">
            aeghin
          </span>
          <span className="sr-only">All organizations</span>
        </Link>
      </div>

      {children}

      <SidebarRail />
    </Sidebar>
  );
}

/** The switcher and the menu, once the shell's data is in. */
export function OrgSidebar({ shell }: { shell: OrgShell }) {
  const pathname = usePathname();
  const closeOnPhone = useCloseOnPhone();

  const { organization, canManage, isVocalist } = shell;
  const visible = visibleOrgNav(canManage, isVocalist);
  const active = activeOrgNavKey(pathname, organization.id, visible);

  const renderItem = (item: OrgNavItem) => {
    return (
      <SidebarMenuItem key={item.key}>
        <SidebarMenuButton
          asChild
          isActive={active === item.key}
          tooltip={item.label}
          className={MENU_BUTTON}
        >
          <Link
            href={orgNavHref(organization.id, item.key)}
            onClick={closeOnPhone}
            aria-current={active === item.key ? "page" : undefined}
          >
            <NavIcon name={item.icon} />
            <span>{item.label}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <>
      <SidebarHeader className="pt-3">
        <OrgSwitcher shell={shell} onNavigate={closeOnPhone} />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {visible.filter((item) => item.group === "main").map(renderItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {canManage && (
          <SidebarGroup>
            <SidebarGroupLabel>Manage</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {visible.filter((item) => item.group === "manage").map(renderItem)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="pb-3">
        {/* Phones have no room for these in the top bar, so they ride along
            in the sheet instead. */}
        <div className="flex items-center justify-between gap-2 px-2 pb-1 md:hidden">
          <PremiumNav />
          <ThemeSwitch className="ml-auto" />
        </div>
        <SidebarMenu className="gap-0.5">
          {visible.filter((item) => item.group === "footer").map(renderItem)}
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="All organizations" className={MENU_BUTTON}>
              <Link href="/dashboard" onClick={closeOnPhone}>
                <NavIcon name="organizations" />
                <span>All organizations</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </>
  );
}

function OrgSwitcher({ shell, onNavigate }: { shell: OrgShell; onNavigate: () => void }) {
  const { isMobile } = useSidebar();
  const { organization, organizations, roleLabel, planLabel } = shell;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="gap-2.5 px-2 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <OrgMark name={organization.name} logoUrl={organization.logoUrl} />
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-semibold tracking-tight text-foreground">
                  {organization.name}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {planLabel ? `${roleLabel} · ${planLabel}` : roleLabel}
                </span>
              </span>
              <NavIcon name="switch" className="ml-auto size-4 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-60"
            side={isMobile ? "bottom" : "right"}
            align="start"
            sideOffset={6}
          >
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Organizations
            </DropdownMenuLabel>
            {organizations.map((org) => (
              <DropdownMenuItem key={org.id} asChild className="cursor-pointer gap-2.5">
                <Link href={orgBasePath(org.id)} onClick={onNavigate}>
                  <OrgMark name={org.name} logoUrl={org.logoUrl} className="size-6 rounded-md text-[10px]" />
                  <span className="truncate">{org.name}</span>
                  {org.id === organization.id && <Check className="ml-auto size-4" />}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="cursor-pointer gap-2.5">
              <Link href="/dashboard" onClick={onNavigate}>
                <NavIcon name="organizations" className="size-4" />
                All organizations
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
