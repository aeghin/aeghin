"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  ORG_NAV,
  activeOrgNavKey,
  orgBasePath,
  orgNavHref,
  visibleOrgNav,
} from "./org-nav-config";

interface OrgBreadcrumbProps {
  orgId: string;
  canManage: boolean;
  isVocalist: boolean;
}

interface Crumb {
  label: string;
  href?: string;
}

/** Where the page sits under the org, read from the path alone. */
function trail(pathname: string, orgId: string, canManage: boolean, isVocalist: boolean): Crumb[] {
  const base = orgBasePath(orgId);
  const events: Crumb = { label: "Events", href: orgNavHref(orgId, "events") };

  if (pathname === `${base}/events/create`) return [events, { label: "Create event" }];
  if (pathname.endsWith("/setlist/editor")) {
    return [events, { label: "Event", href: pathname.replace(/\/setlist\/editor$/, "") }, { label: "Setlist editor" }];
  }
  if (pathname.startsWith(`${base}/events/`)) return [events, { label: "Event" }];
  if (pathname.startsWith(`${base}/profile/`)) {
    return [{ label: "Members", href: orgNavHref(orgId, "members") }, { label: "Member" }];
  }

  const key = activeOrgNavKey(pathname, orgId, visibleOrgNav(canManage, isVocalist));
  return [{ label: ORG_NAV.find((item) => item.key === key)?.label ?? "Events" }];
}

/**
 * The way back from a nested page (an event, a member, the setlist editor),
 * replacing the old back arrows. The org's name lives in the switcher and a
 * top-level section is already lit in the sidebar, so on desktop a lone
 * section crumb would only repeat them — it shows on phones, where the sidebar
 * is tucked away in a sheet.
 */
export function OrgBreadcrumb({ orgId, canManage, isVocalist }: OrgBreadcrumbProps) {
  const pathname = usePathname();
  const crumbs = trail(pathname, orgId, canManage, isVocalist);

  return (
    <div className={cn("flex min-w-0 items-center gap-2", crumbs.length === 1 && "md:hidden")}>
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="flex-nowrap">
          {crumbs.map((crumb, index) => (
            <Fragment key={`${crumb.label}-${index}`}>
              {index > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem className="min-w-0">
                {crumb.href ? (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href} className="truncate">
                      {crumb.label}
                    </Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage className="truncate font-medium">{crumb.label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
