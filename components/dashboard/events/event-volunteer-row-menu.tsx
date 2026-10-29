"use client";

import { AlertCircle, MoreVertical, RefreshCw, Trash2, UserRoundMinus } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  cancelUserEventAssignment,
  deleteEventInvite,
  resendEventInvitation,
} from "@/lib/actions/event";
import { cn } from "@/lib/utils";
import { InvitationStatus } from "@/generated/prisma/enums";
import { toast } from "sonner";


import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EventAssignmentsCardProps {
  assignedUserId: string
  eventId: string
  organizationId: string
  isExpired?: boolean
  /** Declined or removed: all that's left is taking the invite off, which closes its spot. */
  isEnded?: boolean
  /** Who the row is, for what the confirmation says. */
  name: string
  roleLabel: string
  /** As the row shows it — EXPIRED once the deadline passes, before the sweep writes it. */
  status: InvitationStatus
};

type Confirm = "removeFromEvent" | "removePerson";

export const EventVolunteerRowMenu = ({ assignedUserId, eventId, organizationId, isExpired = false, isEnded = false, name, roleLabel, status }: EventAssignmentsCardProps) => {

  const [isPending, startTransition] = useTransition();

  // What the dialog says, and whether it's up: two pieces, so closing it
  // doesn't switch its words while it fades out.
  const [confirm, setConfirm] = useState<Confirm>("removeFromEvent");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const ask = (next: Confirm) => {
    setConfirm(next);
    setConfirmOpen(true);
  };

  const removeUserAssignment = () => {
    startTransition(async () => {
      const result = await cancelUserEventAssignment(assignedUserId, organizationId, eventId);

      if (result.success) {
        toast.success("Removed from Event", { position: "top-center" });
        setConfirmOpen(false);
      } else {
        toast.error(result.error, { position: "top-center" });
      };
    });
  };

  const resendInvite = () => {
    startTransition(async () => {
      const result = await resendEventInvitation(organizationId, eventId, assignedUserId);

      if (result.success) {
        toast.success("Invitation Resent", { position: "top-center" });
      } else {
        toast.error(result.error, { position: "top-center" });
      };
    });
  };

  const deleteInvite = () => {
    startTransition(async () => {
      const result = await deleteEventInvite(organizationId, eventId, assignedUserId);

      if (result.success) {
        toast.success("Person Removed", { position: "top-center" });
        setConfirmOpen(false);
      } else {
        toast.error(result.error, { position: "top-center" });
      };
    });
  };

  // One line each, in the words of the row's own status pill, so it's plain
  // whether this is somebody on the event or an invite that's already over.
  // Only taking off somebody live tells them; the open spot shows on the card.
  const rest =
    confirm === "removePerson"
      ? `'s ${status === InvitationStatus.DECLINED ? "declined" : status === InvitationStatus.CANCELED ? "canceled" : "expired"} invite from ${roleLabel}.`
      : status === InvitationStatus.ACCEPTED
        ? ` from ${roleLabel}. They'll be told.`
        : `'s pending invite from ${roleLabel}. They'll be told.`;

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-8 w-8 cursor-pointer transition-opacity hover:bg-transparent focus-visible:ring-0 focus-visible:border-transparent",
          // An expired or ended row's menu is the only way to act on it, and
          // hover doesn't exist on a phone.
          isExpired || isEnded
            ? "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            : "opacity-0 group-hover:opacity-100",
        )}
        >
        <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          ACTION(s)
        </DropdownMenuLabel>
        {isExpired ? (
          <>
            <DropdownMenuItem disabled={isPending} onClick={resendInvite} className="cursor-pointer">
              <RefreshCw className="mr-2 h-4 w-4" />
              Resend Invitation
            </DropdownMenuItem>
            <DropdownMenuItem disabled={isPending} onClick={() => ask("removePerson")} className="cursor-pointer">
              <UserRoundMinus className="mr-2 h-4 w-4 text-destructive" />
              Remove Person
            </DropdownMenuItem>
          </>
        ) : isEnded ? (
          <DropdownMenuItem disabled={isPending} onClick={() => ask("removePerson")} className="cursor-pointer">
            <UserRoundMinus className="mr-2 h-4 w-4 text-destructive" />
            Remove Person
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled={isPending} onClick={() => ask("removeFromEvent")} className="cursor-pointer">
            <Trash2 className="mr-2 h-4 w-4 text-destructive" />
            Remove From Event
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>

    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <DialogContent className="sm:max-w-120">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <DialogTitle className="text-center text-xl text-destructive">
            {confirm === "removePerson" ? "Remove Person" : "Remove From Event"}
          </DialogTitle>
          <DialogDescription className="text-center text-muted-foreground">
            {"Removes "}
            <span className="font-semibold text-foreground">{name}</span>
            {rest}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={confirm === "removePerson" ? deleteInvite : removeUserAssignment}
            disabled={isPending}
          >
            {isPending && <Spinner className="mr-2" />}
            {isPending ? "Removing..." : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
};
