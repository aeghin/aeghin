"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  CalendarOff,
  Loader2,
  Search,
  Send,
  TriangleAlert,
  UserPlus,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { cn } from "@/lib/utils";
import { colorClasses } from "@/lib/config/service-types-config";
import { VolunteerRole } from "@/generated/prisma/enums";
import { volunteerRoleConfig } from "@/lib/config/roles";
import {
  checkMemberAvailability,
  inviteMembersToEvent,
} from "@/lib/actions/event";
import type { MemberBlockout, MemberConflict } from "@/lib/actions/event";
import { capitalizeName } from "@/lib/names";

export type InviteMember = {
  userId: string;
  user: {
    firstName: string;
    lastName: string;
    email: string;
    userImageUrl: string | null;
  };
};

export type InviteEventDate = {
  date: string;
  startTime: string;
  endTime: string;
};

/** Somebody already live on the role being invited into. */
export type RoleHolder = {
  name: string;
  /** Confirmed, or still deciding. */
  confirmed: boolean;
  /** Who invited them, or null once that person has left. */
  invitedBy: string | null;
};

interface InviteToEventDialogProps {
  organizationId: string;
  eventId: string;
  role: VolunteerRole;
  /** Org members who hold this volunteer role */
  members: InviteMember[];
  /** Anyone still live on this event — one role per member, so they can't be re-invited */
  unavailableUserIds: string[];
  eventDates: InviteEventDate[];
  /** Renders the trigger as a full row instead of a compact button */
  variant?: "row" | "compact";
  serviceColor: string;
  /**
   * Anybody already live on this role. A second invite is sometimes right —
   * three BGVs — and sometimes two admins filling one hole, so the dialog
   * says who is there and asks before sending another.
   */
  holders?: RoleHolder[];
  /** The team's lead, named in that warning. Null when there's none, or it's you. */
  teamLead?: { name: string; team: string } | null;
}

function formatConflictTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Blockout days are stored as UTC midnight, so they render with timeZone: "UTC" */
function formatBlockoutDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

export function InviteToEventDialog({
  organizationId,
  eventId,
  role,
  members,
  unavailableUserIds,
  eventDates,
  variant = "compact",
  serviceColor,
  holders = [],
  teamLead = null,
}: InviteToEventDialogProps) {
  const serviceColors = colorClasses[serviceColor];
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState(3);

  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [conflicts, setConflicts] = useState<Record<string, MemberConflict>>({});
  const [blockouts, setBlockouts] = useState<Record<string, MemberBlockout>>({});

  const [conflictWarning, setConflictWarning] = useState<{
    userId: string;
    memberName: string;
    conflict: MemberConflict;
  } | null>(null);

  const [confirmingSecond, setConfirmingSecond] = useState(false);

  const [isSending, startSending] = useTransition();

  const roleInfo = volunteerRoleConfig[role];
  const unavailable = new Set(unavailableUserIds);
  const selectedSet = new Set(selected);

  const handleOpenChange = async (next: boolean) => {
    setOpen(next);

    if (!next) {
      setSearch("");
      setSelected([]);
      setConflictWarning(null);
      setConfirmingSecond(false);
      return;
    }

    // Availability is only meaningful once the picker is on screen, and it
    // moves as other events are scheduled — so it's fetched per open.
    setIsLoadingAvailability(true);

    try {
      const availability = await checkMemberAvailability({
        organizationId,
        dates: eventDates,
        excludeEventId: eventId,
      });

      setConflicts(availability.conflicts);
      setBlockouts(availability.blockouts);
    } catch {
      toast.error("Couldn't check availability", { position: "top-center" });
    } finally {
      setIsLoadingAvailability(false);
    }
  };

  const toggleMember = (member: InviteMember, checked: boolean) => {
    // Blockouts are a hard block — never assignable, no override
    if (checked && blockouts[member.userId]) return;

    if (checked && conflicts[member.userId]) {
      setConflictWarning({
        userId: member.userId,
        memberName: `${capitalizeName(member.user.firstName)} ${capitalizeName(member.user.lastName)}`,
        conflict: conflicts[member.userId],
      });
      return;
    }

    setSelected((prev) =>
      checked
        ? [...prev, member.userId]
        : prev.filter((id) => id !== member.userId),
    );
  };

  const confirmConflictSelection = () => {
    if (!conflictWarning) return;
    setSelected((prev) => [...prev, conflictWarning.userId]);
    setConflictWarning(null);
  };

  // Somebody is already on the role: say so before a second invite goes out.
  const handleInvite = () => {
    if (holders.length > 0) {
      setConfirmingSecond(true);
      return;
    }

    sendInvites();
  };

  const sendInvites = () => {
    setConfirmingSecond(false);

    startSending(async () => {
      const result = await inviteMembersToEvent(organizationId, eventId, {
        role,
        userIds: selected,
        expiresAt,
      });

      if (!result.success) {
        toast.error(result.error, { position: "top-center" });
        return;
      }

      const skipped = result.skippedNames.length
        ? ` ${result.skippedNames.join(", ")} already on this event.`
        : "";

      toast.success(
        `Invited ${result.invitedCount} ${result.invitedCount === 1 ? "member" : "members"}.${skipped}`,
        { position: "top-center" },
      );

      handleOpenChange(false);
    });
  };

  const query = search.trim().toLowerCase();
  const filtered = query
    ? members.filter(
        (member) =>
          `${member.user.firstName} ${member.user.lastName}`
            .toLowerCase()
            .includes(query) || member.user.email.toLowerCase().includes(query),
      )
    : members;

  const invitableCount = members.filter((m) => !unavailable.has(m.userId)).length;

  const holderNames = holders.map((holder) => holder.name);
  const anyWaiting = holders.some((holder) => !holder.confirmed);

  return (
    <>
      {/* A second invite into a role — warn, don't block: some roles need several */}
      <Dialog open={confirmingSecond} onOpenChange={setConfirmingSecond}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="h-5 w-5 text-amber-500" />
              Invite another {roleInfo.label}?
            </DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">
                {new Intl.ListFormat("en", { type: "conjunction" }).format(holderNames)}
              </span>{" "}
              {holders.length === 1 ? "is" : "are"} already on this role
              {anyWaiting ? ", and not everyone has answered yet" : ""}. Send
              this only if the role needs more than one person.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              className="mr-2"
              variant="outline"
              onClick={() => setConfirmingSecond(false)}
            >
              Cancel
            </Button>
            <Button
              className={cn(serviceColors.solid, serviceColors.solidHover)}
              onClick={sendInvites}
            >
              Invite Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conflict warning — mirrors the create-event flow: warn, don't block */}
      <Dialog
        open={!!conflictWarning}
        onOpenChange={() => setConflictWarning(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="h-5 w-5 text-amber-500" />
              Scheduling Conflict
            </DialogTitle>
            <DialogDescription>
              {conflictWarning && (
                <>
                  <span className="font-medium text-foreground">
                    {conflictWarning.memberName}
                  </span>{" "}
                  is already assigned to{" "}
                  <span className="font-medium text-foreground">
                    {conflictWarning.conflict.eventName}
                  </span>{" "}
                  from {formatConflictTime(conflictWarning.conflict.startTime)} –{" "}
                  {formatConflictTime(conflictWarning.conflict.endTime)} on this
                  day. Assigning them may cause a time overlap.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              className="mr-2"
              variant="outline"
              onClick={() => setConflictWarning(null)}
            >
              Cancel
            </Button>
            <Button
              className={cn(serviceColors.solid, serviceColors.solidHover)}
              onClick={confirmConflictSelection}
            >
              Select Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        {variant === "row" ? (
          <button
            type="button"
            onClick={() => handleOpenChange(true)}
            className="group flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent"
          >
            {/* Same footprint as an assigned avatar — h-9 plus ring-2 and a
                2px offset — so the open slot sits level with the filled rows
                instead of reading as a smaller, lesser thing. */}
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground ring-2 ring-border ring-offset-2 ring-offset-background transition-colors group-hover:text-foreground group-hover:ring-foreground/25">
              <UserPlus className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 text-sm text-muted-foreground">
              No one assigned yet
            </span>
            <span className="shrink-0 text-sm font-medium text-foreground">
              Invite
            </span>
          </button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => handleOpenChange(true)}
            aria-label={`Invite ${roleInfo.label}`}
            className="h-7 w-7 cursor-pointer text-foreground transition-colors hover:bg-accent"
          >
            <UserPlus className="h-3.5 w-3.5" />
          </Button>
        )}

        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-lg">{roleInfo.icon}</span>
              Invite {roleInfo.label}
            </DialogTitle>
            <DialogDescription>
              {selected.length} selected · {invitableCount} available
            </DialogDescription>
          </DialogHeader>

          {holders.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm dark:border-amber-500/20 dark:bg-amber-500/5">
              <p className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-300">
                <TriangleAlert className="h-4 w-4 shrink-0" />
                Already on this role
              </p>
              <ul className="mt-1.5 space-y-0.5 text-amber-900/90 dark:text-amber-200/90">
                {holders.map((holder) => (
                  <li key={holder.name}>
                    <span className="font-medium">{holder.name}</span>
                    {holder.confirmed
                      ? " — confirmed"
                      : holder.invitedBy
                        ? ` — invited by ${holder.invitedBy}, waiting for an answer`
                        : " — waiting for an answer"}
                  </li>
                ))}
              </ul>
              {teamLead && (
                <p className="mt-1.5 text-xs text-amber-800/80 dark:text-amber-300/80">
                  {teamLead.name} leads {teamLead.team} and is asked to fill its roles.
                </p>
              )}
            </div>
          )}

          {members.length > 5 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email..."
                className="pl-9"
              />
            </div>
          )}

          {isLoadingAvailability ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking availability...
            </div>
          ) : filtered.length > 0 ? (
            <div className="grid max-h-[50vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
              {filtered.map((member) => {
                const isOnEvent = unavailable.has(member.userId);
                const isSelected = selectedSet.has(member.userId);
                const conflict = conflicts[member.userId];
                const blockout = blockouts[member.userId];
                const isBlocked = isOnEvent || !!blockout;

                return (
                  <label
                    key={member.userId}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-3 transition-all",
                      isBlocked
                        ? "cursor-not-allowed border-border bg-muted/40 opacity-70"
                        : isSelected
                          ? cn(
                              "cursor-pointer",
                              serviceColors.borderSolid,
                              serviceColors.tint,
                            )
                          : conflict
                            ? "cursor-pointer border-amber-200 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-500/5"
                            : "cursor-pointer border-border hover:bg-muted/50",
                    )}
                  >
                    <Checkbox
                      checked={isSelected}
                      disabled={isBlocked}
                      onCheckedChange={(checked) =>
                        toggleMember(member, checked as boolean)
                      }
                    />
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarImage
                          src={member.user.userImageUrl ?? undefined}
                          alt={`${member.user.firstName} ${member.user.lastName}`}
                        />
                        <AvatarFallback
                          className={cn(
                            "text-sm font-medium",
                            serviceColors.badge,
                            serviceColors.badgeText,
                          )}
                        >
                          {member.user.firstName.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {capitalizeName(member.user.firstName)}{" "}
                          {capitalizeName(member.user.lastName)}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {member.user.email}
                        </p>
                        {isOnEvent ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Already on this event
                          </p>
                        ) : blockout ? (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                            <CalendarOff className="h-3 w-3 shrink-0" />
                            Blocked out · {formatBlockoutDate(blockout.startDate)}
                            {blockout.endDate !== blockout.startDate && (
                              <> – {formatBlockoutDate(blockout.endDate)}</>
                            )}
                          </p>
                        ) : conflict ? (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                            <TriangleAlert className="h-3 w-3 shrink-0" />
                            {conflict.eventName} ·{" "}
                            {formatConflictTime(conflict.startTime)} -{" "}
                            {formatConflictTime(conflict.endTime)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
              {members.length === 0
                ? "No members hold this role yet"
                : "No members match your search"}
            </p>
          )}

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-card/50 p-3">
            <Label htmlFor="invite-expiry" className="text-sm font-medium">
              Response deadline
            </Label>
            <Select
              value={String(expiresAt)}
              onValueChange={(val) => setExpiresAt(Number(val))}
            >
              <SelectTrigger id="invite-expiry" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 days</SelectItem>
                <SelectItem value="5">5 days</SelectItem>
                <SelectItem value="7">7 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="mr-2"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className={cn(serviceColors.solid, serviceColors.solidHover)}
              onClick={handleInvite}
              disabled={selected.length === 0 || isSending}
            >
              {isSending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send {selected.length > 0 && `(${selected.length})`}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
