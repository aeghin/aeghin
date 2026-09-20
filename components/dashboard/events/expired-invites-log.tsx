"use client";

import { useState } from "react";
import { Hourglass } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

export type ExpiredInvite = {
  userId: string;
  firstName: string;
  lastName: string;
  userImageUrl: string | null;
  /** Pre-formatted by the card — keeps the role config out of the client bundle. */
  roleLabel: string;
  expiresAt: Date;
};

/**
 * `expiresAt` is a real instant — `Date.now()` plus the chosen window — not one
 * of the floating-UTC wall clocks the event dates use, so this formats in the
 * viewer's own zone. Don't "fix" it to `timeZone: "UTC"` to match the date
 * helpers elsewhere in this folder; that would be the wrong day near midnight.
 */
const formatLapsed = (date: Date) =>
  date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * Every invitation on this event that lapsed unanswered, behind the count in
 * the Team card header.
 *
 * Lapsed invites don't hold roster rows — the role has to read as needing
 * someone, and a dead row suppressed its invite CTA. Putting the record here
 * rather than beside each role keeps it to one place at the top of the card:
 * a bare number told nobody who to chase, and a marker on every affected role
 * grew the card back in proportion to how bad the problem was.
 */
export function ExpiredInvitesLog({ invitees }: { invitees: ExpiredInvite[] }) {
  const [open, setOpen] = useState(false);

  if (invitees.length === 0) return null;

  // Newest lapse first: the one most likely still worth chasing.
  const rows = [...invitees].sort(
    (a, b) => b.expiresAt.getTime() - a.expiresAt.getTime(),
  );

  return (
    // HoverCard rather than Popover: hand-rolling hover onto a Popover meant
    // closing on pointerleave, and the 4px gap between trigger and panel counts
    // as a leave — so crossing it closed and reopened the panel, which is the
    // flicker. Radix keeps a grace area between the two and debounces both
    // edges, which is the entire reason this primitive exists.
    //
    // Still controlled, because HoverCard is pointer-only by design and never
    // opens on touch. The tap handler below is what makes it work on a phone.
    <HoverCard
      open={open}
      onOpenChange={setOpen}
      openDelay={80}
      closeDelay={120}
    >
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-label={`${invitees.length} expired ${invitees.length === 1 ? "invitation" : "invitations"}. Show details.`}
          // Touch and pen only. A mouse must never reach this: HoverCard has
          // already opened on hover by the time a click lands, so toggling here
          // would shut it the instant it was clicked.
          onPointerUp={(event) => {
            if (event.pointerType !== "mouse") setOpen((prev) => !prev);
          }}
          className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md text-xs font-medium tabular-nums text-slate-500 outline-none transition-colors hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-ring dark:hover:text-slate-400"
        >
          <Hourglass className="h-3 w-3" />
          {invitees.length} expired
        </button>
      </HoverCardTrigger>

      <HoverCardContent align="end" className="w-68 p-2">
        <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Expired {invitees.length === 1 ? "invite" : "invites"}
        </p>

        <ul className="space-y-0.5">
          {rows.map((person) => (
            <li
              key={person.userId}
              className="flex items-center gap-2 rounded-md px-2 py-1.5"
            >
              <Avatar className="h-6 w-6 shrink-0 opacity-70 grayscale">
                <AvatarImage src={person.userImageUrl ?? undefined} alt="" />
                <AvatarFallback className="text-[9px] font-medium">
                  {person.firstName.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">
                  {person.firstName} {person.lastName}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {person.roleLabel}
                </p>
              </div>
              <span className="shrink-0 text-[11px] tabular-nums text-slate-500">
                {formatLapsed(person.expiresAt)}
              </span>
            </li>
          ))}
        </ul>

        <p className="px-2 pt-1.5 text-[11px] text-muted-foreground">
          Re-invite from the role below to reopen.
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}
