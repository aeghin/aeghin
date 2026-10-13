"use client";

import { useState, useEffect } from "react";
import { animate, m, useMotionValue, useTransform } from "motion/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { OrgRole, VolunteerRole } from "@/generated/prisma/enums";
import { getRoleConfig, volunteerRoleConfig } from "@/lib/config/roles";
import { floatingNow, formatDateInZone } from "@/lib/time-zone";

export type MemberProfileData = {
  role: OrgRole;
  volunteerRoles: VolunteerRole[];
  createdAt: Date;
  organization: {
    name: string;
  };
  user: {
    firstName: string;
    lastName: string;
    userImageUrl: string | null;
  };
};

export type RangeKey = "all" | "year";
export type RangeStats = { invited: number; accepted: number; declined: number };
export type MemberSong = { title: string; artist: string; count: number };


const RING_CIRCUMFERENCE = 2 * Math.PI * 52; 


function useCountUp(target: number) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.round(v));

  useEffect(() => {
    const controls = animate(count, target, { duration: 0.9, ease: [0.33, 1, 0.68, 1] });
    return () => controls.stop();
  }, [count, target]);

  return rounded;
};

export default function MemberProfile({
  membership,
  stats,
  songs,
  timeZone,
}: {
  membership: MemberProfileData;
  stats: Record<RangeKey, RangeStats>;
  songs: MemberSong[];
  /** The organization's zone, for the joined date and the year the stats count. */
  timeZone: string;
}) {
  const [range, setRange] = useState<RangeKey>("all");

  const active = stats[range];
  const pctTarget = active.invited
    ? Math.round((active.accepted / active.invited) * 100)
    : 0;
  const pct = useCountUp(pctTarget);
  const maxCount = Math.max(1, ...songs.map((s) => s.count));

  const inviteWord = active.invited === 1 ? "invite" : "invites";
  const caption =
    active.invited === 0
      ? `No invites ${range === "year" ? "this year" : "yet"}`
      : `${range === "year" ? floatingNow(timeZone).getUTCFullYear() : "All time"} · ${active.invited} ${inviteWord}`;

  const fullName = `${membership.user.firstName} ${membership.user.lastName}`;
  const nameInitial = `${membership.user.firstName.charAt(0)}${membership.user.lastName.charAt(0)}`;
  const userImageUrl = membership.user.userImageUrl ?? undefined;
  const memberRole = getRoleConfig(membership.role);
  const RoleIcon = memberRole.icon;
  const volunteerRoles = membership.volunteerRoles;
  // A real moment, on the organization's clock — the same on the server render
  // and in the browser. UTC put an evening join on the next day.
  const joinedDate = formatDateInZone(membership.createdAt, timeZone);

  

  return (
    // The org and the way back to Members are in the shell's breadcrumb; the
    // page opens straight on the person.
    <div className="min-h-screen bg-background text-foreground bg-[radial-gradient(1100px_480px_at_50%_-8%,rgba(255,255,255,0.9),rgba(255,255,255,0)_62%)] dark:bg-none">
      <main className="mx-auto max-w-285 px-[clamp(20px,5vw,56px)] pb-[clamp(56px,8vw,96px)] pt-[clamp(32px,5.5vw,64px)]">
        <m.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex flex-wrap items-center gap-[clamp(24px,4vw,44px)]"
        >
          <div className="aspect-square w-[clamp(110px,15vw,152px)] flex-none rounded-full border border-border bg-card p-1.75 shadow-[0_12px_32px_rgba(26,25,21,0.09)]">
            <Avatar className="size-full">
              <AvatarImage src={userImageUrl} alt={fullName} />
              <AvatarFallback className="bg-muted text-2xl font-bold text-muted-foreground">
                {nameInitial}
              </AvatarFallback>
            </Avatar>
          </div>

          <div className="min-w-[min(100%,320px)] flex-1">
            <h1 className="mb-3 mt-2 text-[clamp(2.5rem,6vw,4.1rem)] font-bold leading-[1.02] tracking-[-0.035em]">
              {fullName}
            </h1>

            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <Badge variant="outline" className={`gap-2 rounded-full border px-4 py-2 ${memberRole.className}`}>
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <RoleIcon className="h-3.5 w-3.5" />
                  {memberRole.label}
                </span>
              </Badge>
              {volunteerRoles.map((role) => {
                const config = volunteerRoleConfig[role];
                return (
                  <Badge
                    key={role}
                    className="gap-1 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-card"
                  >
                    <span aria-hidden>{config.icon}</span>
                    {config.label}
                  </Badge>
                );
              })}
              <span className="px-1 py-2 text-sm text-muted-foreground">
                Member since {joinedDate}
              </span>
            </div>
          </div>
        </m.section>
        <div className="mt-[clamp(36px,5vw,56px)] grid grid-cols-[repeat(auto-fit,minmax(min(100%,350px),1fr))] items-stretch gap-[clamp(16px,2.5vw,24px)]">
          <m.section
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex flex-col rounded-[24px] border border-border bg-card p-[clamp(22px,3vw,32px)] shadow-[0_1px_2px_rgba(26,25,21,0.04)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Event acceptance
              </h2>
              <Tabs value={range} onValueChange={(v) => setRange(v as RangeKey)}>
                <TabsList className="h-auto rounded-full bg-muted p-0.75">
                  <TabsTrigger
                    value="all"
                    className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-[0_1px_3px_rgba(26,25,21,0.14)]"
                  >
                    All time
                  </TabsTrigger>
                  <TabsTrigger
                    value="year"
                    className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-[0_1px_3px_rgba(26,25,21,0.14)]"
                  >
                    This year
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="mt-6 flex flex-1 items-center justify-center">
              <div className="relative aspect-square w-[min(190px,52vw)]">
                <svg viewBox="0 0 120 120" className="block size-full">
                  <circle cx="60" cy="60" r="52" fill="none" strokeWidth="9" className="stroke-muted" />
                  <m.circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeDasharray={RING_CIRCUMFERENCE}
                    initial={{ strokeDashoffset: RING_CIRCUMFERENCE }}
                    animate={{ strokeDashoffset: RING_CIRCUMFERENCE * (1 - pctTarget / 100) }}
                    transition={{ duration: 1, ease: [0.22, 0.8, 0.24, 1] }}
                    transform="rotate(-90 60 60)"
                    className="stroke-primary"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                  <div className="text-[clamp(34px,9vw,44px)] font-bold leading-none tracking-[-0.03em]">
                    <m.span>{pct}</m.span>
                    <span className="text-[0.5em] font-semibold text-muted-foreground">%</span>
                  </div>
                  <div className="text-xs tracking-[0.04em] text-muted-foreground">accepted</div>
                </div>
              </div>
            </div>

            <div className="mt-5.5 grid grid-cols-3 gap-3 border-t border-border pt-5">
              {(
                [
                  { label: "Invited", value: active.invited, dot: "bg-foreground" },
                  { label: "Accepted", value: active.accepted, dot: "bg-primary" },
                  { label: "Declined", value: active.declined, dot: "bg-muted-foreground/40" },
                ] as const
              ).map((s) => (
                <div key={s.label} className="flex flex-col gap-1">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={`block size-1.75 rounded-full ${s.dot}`} />
                    {s.label}
                  </span>
                  <span className="text-[22px] font-bold">{s.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-3.5 text-[12.5px] text-muted-foreground">{caption}</div>
          </m.section>

          {/* ----------------------- Top 5 songs */}
          <m.section
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex flex-col rounded-[24px] border border-border bg-card p-[clamp(22px,3vw,32px)] shadow-[0_1px_2px_rgba(26,25,21,0.04)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Top 5 songs
              </h2>
              <span className="text-[13px] text-muted-foreground">All time</span>
            </div>

            <div className="mt-2.5 flex flex-col">
              {songs.length === 0 ? (
                <p className="py-8 text-center text-[13.5px] text-muted-foreground">
                  No songs performed yet.
                </p>
              ) : (
                songs.map((song, i) => (
                  <div key={`${song.title}-${song.artist}`} className="py-3.25">
                    <div className="grid grid-cols-[30px_1fr_auto] items-center gap-3.5">
                      <span className="text-[15px] font-bold text-muted-foreground/50">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-[15.5px] font-semibold tracking-[-0.005em]">
                          {song.title}
                        </div>
                        <div className="mt-0.5 text-[13.5px] text-muted-foreground">{song.artist}</div>
                      </div>
                      <div className="text-[19px] font-bold tracking-[-0.01em]">
                        {song.count}
                        <span className="text-xs font-medium text-muted-foreground">×</span>
                      </div>
                    </div>

                    {/* Play-count bar */}
                    <div className="ml-11 mt-2.5 h-1.25 overflow-hidden rounded-full bg-muted">
                      <m.div
                        className="h-full rounded-full bg-primary"
                        initial={{ width: 0 }}
                        animate={{ width: `${(song.count / maxCount) * 100}%` }}
                        transition={{ duration: 0.9, ease: [0.22, 0.8, 0.24, 1] }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </m.section>
        </div>
      </main>
    </div>
  );
}
