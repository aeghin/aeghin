"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Activity, Calendar, CalendarOff, Mic2, Users, Mail, LayoutTemplate, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

// `vocalOnly` sits on every entry the way `adminOnly` does — a uniform shape
// keeps the filter a plain boolean test instead of an `in` narrowing.
const tabs = [
  { value: "events", label: "Events", icon: Calendar, adminOnly: false, vocalOnly: false },
  { value: "members", label: "Members", icon: Users, adminOnly: false, vocalOnly: false },
  { value: "blockouts", label: "Blockouts", icon: CalendarOff, adminOnly: false, vocalOnly: false },
  { value: "keys", label: "My Keys", icon: Mic2, adminOnly: false, vocalOnly: true },
  { value: "invitations", label: "Invitations", icon: Mail, adminOnly: true, vocalOnly: false },
  { value: "templates", label: "Templates", icon: LayoutTemplate, adminOnly: true, vocalOnly: false },
  { value: "activity", label: "Activity", icon: Activity, adminOnly: true, vocalOnly: false },
  { value: "settings", label: "Settings", icon: Settings, adminOnly: false, vocalOnly: false },
] as const;

interface OrgTabNavProps {
  activeTab: string;
  canManage: boolean;
  /** Lead vocalists and BGVs — the only members with a key journal. */
  isVocalist: boolean;
  counts?: {
    events?: number;
    members?: number;
  };
}

/** How far the edge fades reach when there is more row to scroll to. */
const FADE = 24;

export const OrgTabNav = ({ activeTab, canManage, isVocalist, counts }: OrgTabNavProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rowRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const handleTabChange = (tab: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const visibleTabs = tabs.filter(
    (tab) => (!tab.adminOnly || canManage) && (!tab.vocalOnly || isVocalist),
  );

  const updateEdges = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    const left = row.scrollLeft > 1;
    const right = row.scrollLeft + row.clientWidth < row.scrollWidth - 1;
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const observer = new ResizeObserver(updateEdges);
    observer.observe(row);
    return () => observer.disconnect();
  }, [updateEdges]);

  // The row scrolls on a narrow screen, so the chosen tab is brought into the
  // middle of it — by its own scroll, never the page's.
  const settled = useRef(false);
  useEffect(() => {
    const row = rowRef.current;
    const tab = row?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!row || !tab) return;
    row.scrollTo({
      left: tab.offsetLeft - (row.clientWidth - tab.offsetWidth) / 2,
      behavior: settled.current ? "smooth" : "instant",
    });
    settled.current = true;
  }, [activeTab]);

  const fade = `linear-gradient(to right, ${
    edges.left ? `transparent, black ${FADE}px` : "black, black"
  }, ${edges.right ? `black calc(100% - ${FADE}px), transparent` : "black, black"})`;

  return (
    // One row at every width: past what fits it scrolls sideways, with the
    // edges fading to say so, instead of wrapping into a grid.
    <div className="w-full rounded-xl bg-secondary/50 sm:w-fit sm:max-w-full">
      <div
        ref={rowRef}
        role="tablist"
        onScroll={updateEdges}
        className="relative flex gap-1 overflow-x-auto p-1"
        style={{ scrollbarWidth: "none", maskImage: fade, WebkitMaskImage: fade }}
      >
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.value;
          const count = counts?.[tab.value as keyof typeof counts];

          return (
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              key={tab.value}
              onClick={() => handleTabChange(tab.value)}
              className={cn(
                "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:px-4 sm:py-2.5",
                isActive
                  ? "text-primary bg-background ring-1 ring-primary/25 shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="mr-2 h-4 w-4" />
              {tab.label}
              {count !== undefined && (
                <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
