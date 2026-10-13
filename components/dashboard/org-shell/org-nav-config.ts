import {
  Activity,
  Calendar,
  CalendarOff,
  LayoutTemplate,
  Mail,
  Mic2,
  Music,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export type OrgNavKey =
  | "events"
  | "songs"
  | "members"
  | "blockouts"
  | "keys"
  | "invitations"
  | "templates"
  | "activity"
  | "settings";

export interface OrgNavItem {
  key: OrgNavKey;
  label: string;
  icon: LucideIcon;
  group: "main" | "manage" | "footer";
  /** Owners and admins only — the same gate the section's page enforces. */
  adminOnly: boolean;
  /** Lead vocalists and BGVs only: the key journal. */
  vocalOnly: boolean;
}

export const ORG_NAV: OrgNavItem[] = [
  { key: "events", label: "Events", icon: Calendar, group: "main", adminOnly: false, vocalOnly: false },
  { key: "songs", label: "Songs", icon: Music, group: "main", adminOnly: false, vocalOnly: false },
  { key: "members", label: "Members", icon: Users, group: "main", adminOnly: false, vocalOnly: false },
  { key: "blockouts", label: "Blockouts", icon: CalendarOff, group: "main", adminOnly: false, vocalOnly: false },
  { key: "keys", label: "My keys", icon: Mic2, group: "main", adminOnly: false, vocalOnly: true },
  { key: "invitations", label: "Invitations", icon: Mail, group: "manage", adminOnly: true, vocalOnly: false },
  { key: "templates", label: "Templates", icon: LayoutTemplate, group: "manage", adminOnly: true, vocalOnly: false },
  { key: "activity", label: "Activity", icon: Activity, group: "manage", adminOnly: true, vocalOnly: false },
  { key: "settings", label: "Settings", icon: Settings, group: "footer", adminOnly: false, vocalOnly: false },
];

export function visibleOrgNav(canManage: boolean, isVocalist: boolean): OrgNavItem[] {
  return ORG_NAV.filter(
    (item) => (!item.adminOnly || canManage) && (!item.vocalOnly || isVocalist),
  );
}

export function orgBasePath(orgId: string): string {
  return `/dashboard/organizations/${orgId}`;
}

/** Events is the org's home, at its root URL; every other item is its own route. */
export function orgNavHref(orgId: string, key: OrgNavKey): string {
  const base = orgBasePath(orgId);
  return key === "events" ? base : `${base}/${key}`;
}

/**
 * Which item the current URL belongs to: the first path segment under the
 * org, with event pages under Events and member profiles under Members.
 */
export function activeOrgNavKey(
  pathname: string,
  orgId: string,
  visible: OrgNavItem[],
): OrgNavKey | null {
  const base = orgBasePath(orgId);

  if (pathname === base || pathname.startsWith(`${base}/events`)) return "events";
  if (pathname.startsWith(`${base}/profile`)) return "members";

  const segment = pathname.slice(base.length + 1).split("/")[0];
  return visible.find((item) => item.key === segment)?.key ?? null;
}
