"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarPlus, Check, ChevronsUpDown, LayoutGrid, Moon, Sun, UserPlus } from "lucide-react";
import { useTheme } from "next-themes";
import { InvitePersonModal } from "@/components/setup/invite-person-modal";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { OrgMark } from "./org-mark";
import {
  activeOrgNavKey,
  orgBasePath,
  orgNavHref,
  visibleOrgNav,
  type OrgNavItem,
} from "./org-nav-config";
import type { OrgShell } from "./get-org-shell";

// On the rail every button is a 36px square with its 16px icon centred, which
// fills the rail's 3.25rem less the groups' 8px sides.
const RAIL_TARGET = "group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:p-2.5!";

// The active row is raised onto the page colour with a hairline shadow and an
// orange icon, as in the design system; every other icon stays muted.
const MENU_BUTTON =
  `${RAIL_TARGET} h-8.5 gap-2.5 px-2.5 text-sidebar-foreground [&>svg]:text-muted-foreground ` +
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
    // In dark the sidebar is a step lighter than the page, which already sets
    // it apart, so its edge drops the hairline that read as a stray line there.
    <Sidebar collapsible="icon" className="dark:border-r-transparent">
      {/* The brand row is the top bar's height (h-14) with its own bottom
          border, so the two lines meet in one straight rule across the page. */}
      <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-4 group-data-[collapsible=icon]:px-2.5">
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

      {/* shadcn's rail is 16px centred on the edge, so half of it hung over
          the page. That pushed the sidebar's own layer 8px past its edge, and
          Chrome drew a stray line there that lingered and flickered. Here the
          rail is the sidebar's last 8px, with its hover line on the edge. */}
      <SidebarRail className="w-2 translate-x-0 group-data-[side=left]:right-0 after:left-auto after:right-0" />
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
    const Icon = item.icon;
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
            <Icon />
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
        {canManage && <OrgQuickActions shell={shell} onNavigate={closeOnPhone} />}
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
        {/* Settings and the theme switch share a line; on the rail they
            stack, the switch on top. */}
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col-reverse">
          <SidebarMenu className="min-w-0 flex-1 gap-0.5">
            {visible.filter((item) => item.group === "footer").map(renderItem)}
          </SidebarMenu>
          <ThemeToggle />
        </div>
      </SidebarFooter>
    </>
  );
}

// Raised onto the page colour like the active row, so they read as buttons
// rather than places to go.
const QUICK_BUTTON =
  `${RAIL_TARGET} h-8 bg-background font-medium text-foreground shadow-xs ring-1 ring-sidebar-border ` +
  "hover:bg-sidebar-accent dark:bg-sidebar-accent dark:hover:bg-sidebar-border";

/**
 * The org's two everyday actions for owners and admins, on every page inside
 * the org: Create event wide, Invite member square beside it. On the rail
 * they stack as two icons.
 */
function OrgQuickActions({ shell, onNavigate }: { shell: OrgShell; onNavigate: () => void }) {
  const [inviting, setInviting] = useState(false);
  const { organization, isOwner, seatUsage } = shell;

  return (
    <div className="flex gap-1.5 px-0.5 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:px-0">
      <SidebarMenuButton asChild tooltip="Create event" className={`${QUICK_BUTTON} min-w-0 flex-1 gap-2.5 px-2.5 group-data-[collapsible=icon]:flex-none`}>
        <Link href={`${orgBasePath(organization.id)}/events/create`} onClick={onNavigate}>
          {/* Orange beside its label; plain on the rail, where it would
              stack over the active Events row's orange calendar. */}
          <CalendarPlus className="text-primary group-data-[collapsible=icon]:text-foreground" />
          <span>Create event</span>
        </Link>
      </SidebarMenuButton>

      {/* No label beside it, so its tooltip shows open or collapsed. */}
      <SidebarMenuButton
        tooltip={{ children: "Invite member", hidden: false }}
        onClick={() => setInviting(true)}
        className={`${QUICK_BUTTON} w-8 shrink-0 cursor-pointer justify-center`}
      >
        <UserPlus className="text-muted-foreground" />
        <span className="sr-only">Invite member</span>
      </SidebarMenuButton>

      <InvitePersonModal
        open={inviting}
        onOpenChange={setInviting}
        organizationId={organization.id}
        organizationName={organization.name}
        seatUsage={seatUsage}
        canUpgrade={isOwner}
      />
    </div>
  );
}

const TURN = { duration: 650, easing: "cubic-bezier(0.65, 0, 0.35, 1)" };

/**
 * Light or dark, as the icon alone: a sun in light, a moon in dark. It rests
 * where CSS puts it, so it's right at first paint, before the stored theme can
 * be read; the click plays the turn between them.
 */
function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const { isMobile, state } = useSidebar();
  const [mounted, setMounted] = useState(false);
  const wheelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  const toggle = () => {
    // The ThemeProvider switches CSS transitions off while the theme changes,
    // so the turn is played here. It always goes forward: the sun sets as the
    // moon rises, then the moon sets as the sun comes back up.
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const from = isDark ? 180 : 0;
      wheelRef.current?.animate([{ rotate: `${from}deg` }, { rotate: `${from + 180}deg` }], TURN);
    }
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          role="switch"
          aria-checked={isDark}
          aria-label="Dark mode"
          onClick={toggle}
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground group-data-[collapsible=icon]:size-9 ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2"
        >
          {/* Sun on top, moon underneath, turning on a pivot at the icon's
              bottom edge, so each one passes below the horizon. */}
          <span aria-hidden="true" className="relative size-4 overflow-hidden">
            <span ref={wheelRef} className="absolute inset-x-0 top-0 h-8 dark:rotate-180">
              <Sun className="absolute top-0 left-0 size-4" />
              <Moon className="absolute bottom-0 left-0 size-4 rotate-180" />
            </span>
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side={state === "collapsed" && !isMobile ? "right" : "top"}>
        Dark mode
      </TooltipContent>
    </Tooltip>
  );
}

function OrgSwitcher({ shell, onNavigate }: { shell: OrgShell; onNavigate: () => void }) {
  const { isMobile } = useSidebar();
  const { organization, organizations, roleLabel, volunteerRoleLabels } = shell;
  // The plan isn't repeated here: the badge in the top bar shows it.
  const subtitle =
    volunteerRoleLabels.length > 0 ? `${roleLabel} · ${volunteerRoleLabels.join(", ")}` : roleLabel;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="gap-2.5 px-2 group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:pl-0.5! data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <OrgMark name={organization.name} logoUrl={organization.logoUrl} />
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-semibold tracking-tight text-foreground">
                  {organization.name}
                </span>
                <span title={subtitle} className="truncate text-xs text-muted-foreground">
                  {subtitle}
                </span>
              </span>
              <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
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
                <LayoutGrid className="size-4" />
                All organizations
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
