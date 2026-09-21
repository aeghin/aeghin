"use client";

import { MoreVertical, RefreshCw, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  cancelUserEventAssignment,
  deleteExpiredEventAssignment,
  resendEventInvitation,
} from "@/lib/actions/event";
import { cn } from "@/lib/utils";
import { toast } from "sonner";


import { 
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

interface EventAssignmentsCardProps {
  assignedUserId: string
  eventId: string
  organizationId: string
  isExpired?: boolean
};

export const EventVolunteerRowMenu = ({ assignedUserId, eventId, organizationId, isExpired = false }: EventAssignmentsCardProps) => {

  const [isPending, startTransition] = useTransition();

  const removeUserAssignment = () => {
    startTransition(async () => {
      const result = await cancelUserEventAssignment(assignedUserId, organizationId, eventId);

      if (result.success) {
        toast.success("Removed from Event", { position: "top-center" });
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

  const deleteExpiredInvite = () => {
    startTransition(async () => {
      const result = await deleteExpiredEventAssignment(organizationId, eventId, assignedUserId);

      if (result.success) {
        toast.success("Expired Invite Removed", { position: "top-center" });
      } else {
        toast.error(result.error, { position: "top-center" });
      };
    });
  };
    
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-8 w-8 cursor-pointer transition-opacity hover:bg-transparent focus-visible:ring-0 focus-visible:border-transparent",
          // An expired row's menu is the only way to act on it, and hover
          // doesn't exist on a phone.
          isExpired
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
            <DropdownMenuItem disabled={isPending} onClick={deleteExpiredInvite} className="cursor-pointer text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Expired Invite
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem disabled={isPending} onClick={removeUserAssignment} className="cursor-pointer text-destructive focus:text-destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            Remove From Event
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
