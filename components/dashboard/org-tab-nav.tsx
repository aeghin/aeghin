"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Activity, Calendar, CalendarOff, Users, Mail, LayoutTemplate, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { value: "events", label: "Events", icon: Calendar, adminOnly: false },
  { value: "members", label: "Members", icon: Users, adminOnly: false },
  { value: "blockouts", label: "Blockouts", icon: CalendarOff, adminOnly: false },
  { value: "invitations", label: "Invitations", icon: Mail, adminOnly: true },
  { value: "templates", label: "Templates", icon: LayoutTemplate, adminOnly: true },
  { value: "activity", label: "Activity", icon: Activity, adminOnly: true },
  { value: "settings", label: "Settings", icon: Settings, adminOnly: false },
] as const;

interface OrgTabNavProps {
  activeTab: string;
  canManage: boolean;
  counts?: {
    events?: number;
    members?: number;
  };
}

export const OrgTabNav = ({ activeTab, canManage, counts }: OrgTabNavProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleTabChange = (tab: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const visibleTabs = tabs.filter((tab) => !tab.adminOnly || canManage);

  return (
    <div className="grid grid-cols-2 sm:inline-flex h-auto gap-1 rounded-xl bg-secondary/50 p-1 sm:flex-wrap">
      {visibleTabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.value;
        const count = counts?.[tab.value as keyof typeof counts];

        return (
          <button
            type="button"
            key={tab.value}
            onClick={() => handleTabChange(tab.value)}
            className={cn(
              "cursor-pointer rounded-lg px-4 py-2.5 text-sm transition-all inline-flex items-center justify-center",
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
  );
};