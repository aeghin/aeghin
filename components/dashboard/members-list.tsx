"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, Phone, ChevronRight, CalendarDays, Search, SearchX, ArrowUpRight } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger
} from "@/components/ui/hover-card";

import { OrgRole, VolunteerRole } from "@/generated/prisma/enums";
import { getRoleConfig, volunteerRoleConfig } from "@/lib/config/roles";

import { cn } from "@/lib/utils";

import { RoleAssignButtons } from "@/components/dashboard/role-assign-buttons";

interface Members {
  organizationId: string
  volunteerRoles: VolunteerRole[]
  role: OrgRole
  user: {
    id: string
    firstName: string
    lastName: string
    email: string
    phoneNumber: string
    userImageUrl: string | null
    createdAt: Date
  }
}

interface MembersListProps {
  members: Members[]
  currentUserId: string
  viewerRole: OrgRole
}

export function MembersList({ members, currentUserId, viewerRole }: MembersListProps) {

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<OrgRole | "ALL">("ALL");
  const [volunteerFilter, setVolunteerFilter] = useState<VolunteerRole | "ALL">("ALL");

  const formatName = (name: string) =>
    name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();

  const formatPhone = (phone: string) => {
    const digits = phone.replace(/\D/g, "").replace(/^1/, "");
    if (digits.length !== 10) return phone;
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const query = search.trim().toLowerCase();

  const filtered = members.filter((member) => {
    const fullName = `${member.user.firstName} ${member.user.lastName}`.toLowerCase();

    const matchesSearch =
      query === "" ||
      fullName.includes(query) ||
      member.user.email.toLowerCase().includes(query);

    const matchesRole = roleFilter === "ALL" || member.role === roleFilter;

    const matchesVolunteer =
      volunteerFilter === "ALL" || member.volunteerRoles.includes(volunteerFilter);

    return matchesSearch && matchesRole && matchesVolunteer;
  });

  return (
    <div className="divide-y divide-border/40">
      <div className="flex flex-col gap-2 bg-secondary/10 px-6 py-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              viewerRole === OrgRole.MEMBER
                ? "Search by name..."
                : "Search by name or email..."
            }
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as OrgRole | "ALL")}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All roles</SelectItem>
            {Object.values(OrgRole).map((role) => {
              const roleConfig = getRoleConfig(role);
              const RoleIcon = roleConfig.icon;
              return (
                <SelectItem key={role} value={role}>
                  <RoleIcon />
                  {roleConfig.label}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <Select value={volunteerFilter} onValueChange={(value) => setVolunteerFilter(value as VolunteerRole | "ALL")}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Volunteer role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All volunteer roles</SelectItem>
            {Object.entries(volunteerRoleConfig).map(([role, config]) => (
              <SelectItem key={role} value={role}>
                {config.icon} {config.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {filtered.map((member) => {
        const roleConfig = getRoleConfig(member.role)
        const RoleIcon = roleConfig.icon
        const volunteerRoles = member.volunteerRoles.map((role) => volunteerRoleConfig[role])

        const isSelf = member.user.id === currentUserId;

        const joinedDate = new Date(member.user.createdAt).toLocaleDateString(
          "en-US",
          { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" },
        );

        const canManageMember =
          viewerRole !== OrgRole.MEMBER &&
          !isSelf &&
          member.role !== OrgRole.OWNER &&
          (viewerRole === OrgRole.OWNER || member.role === OrgRole.MEMBER);

        const canManageVolunteerRoles =
          viewerRole !== OrgRole.MEMBER &&
          !(viewerRole === OrgRole.ADMIN && member.role === OrgRole.OWNER);

        const canAssignOwner =
          viewerRole === OrgRole.OWNER &&
          !isSelf &&
          member.role !== OrgRole.OWNER;

        return (
          <div
            key={member.user.id}
            className="group flex items-start justify-between gap-4 px-6 py-4 transition-colors hover:bg-accent/30 sm:items-center"
          >
            <div className="flex min-w-0 items-start gap-4 sm:items-center">
              <Avatar className="h-11 w-11 transition-transform group-hover:scale-105">
                <AvatarImage src={member.user.userImageUrl ?? undefined} />
                <AvatarFallback className="bg-linear-to-br text-xsm font-semibold text-foreground">
                  {member.user.firstName.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{member.user.id === currentUserId ? "You" : `${formatName(member.user.firstName)} ${formatName(member.user.lastName)}`}</span>
                  <Badge variant="outline" className={cn("text-[10px] font-medium", roleConfig.className)}>
                    <RoleIcon className="mr-1 h-3 w-3" />
                    {roleConfig.label}
                  </Badge>
                  {volunteerRoles.length > 0 && (
                    <HoverCard openDelay={100} closeDelay={200}>
                      <HoverCardTrigger asChild>
                        <button type="button" className="cursor-pointer text-muted-foreground transition-transform hover:scale-125 -ml-1">
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </HoverCardTrigger>
                      <HoverCardContent side="right" className="w-auto max-w-72 p-3">
                        <p className="text-center mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Volunteer Role(s)</p>
                        <div className="flex flex-wrap gap-1.5">
                          {volunteerRoles.map(({ label, icon }) => (
                            <Badge
                              key={label}
                              variant="secondary"
                              className="gap-1 bg-muted/50 text-[10px] font-normal"
                            >
                              <span aria-hidden>{icon}</span>
                              {label}
                            </Badge>
                          ))}
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  )}
                </div>
                <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:gap-2">
                  {member.user.email && (
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="truncate">{member.user.email}</span>
                    </span>
                  )}
                  {member.user.email && member.user.phoneNumber && (
                    <span className="hidden text-border sm:inline">•</span>
                  )}
                  {member.user.phoneNumber && (
                    <span className="inline-flex items-center gap-1.5 tabular-nums">
                      <Phone className="h-3 w-3 shrink-0" />
                      {formatPhone(member.user.phoneNumber)}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 tabular-nums sm:hidden">
                    <CalendarDays className="h-3 w-3 shrink-0" />
                    Joined {joinedDate}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="hidden whitespace-nowrap text-xs tabular-nums text-muted-foreground sm:inline-block">
                Joined {joinedDate}
              </span>
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 pointer-coarse:opacity-100"
                title={`View ${member.user.firstName}'s profile`}
              >
                <Link href={`/dashboard/organizations/${member.organizationId}/profile/${member.user.id}`}>
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
              {canManageMember || canManageVolunteerRoles ? (
                <RoleAssignButtons
                  currentRole={member.role}
                  userId={member.user.id}
                  organizationId={member.organizationId}
                  memberName={member.user.firstName}
                  currentVolunteerRoles={member.volunteerRoles}
                  canManageMember={canManageMember}
                  canManageVolunteerRoles={canManageVolunteerRoles}
                  canAssignOwner={canAssignOwner}
                />
              ) : (
                <div className="h-8 w-8" aria-hidden />
              )}
            </div>
          </div>
        )
      })}
      {filtered.length === 0 && (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
          <SearchX className="h-8 w-8 opacity-20" />
          <p className="text-sm">No members match your filters</p>
        </div>
      )}
    </div>
  )
}
