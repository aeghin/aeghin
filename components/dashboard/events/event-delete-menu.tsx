"use client";

import { useState, useTransition } from "react";
import { MoreVertical, Pencil, Trash2, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { deleteEvent } from "@/lib/actions/event";
import { toast } from "sonner";

import {
  EditEventDetailsDialog,
  type EditableAssignee,
  type EditableEventDates,
} from "./edit-event-details-dialog";


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

interface EventDeleteMenuProps {
  eventId: string;
  organizationId: string;
  eventName: string;
  serviceColor: string;
  eventDetails: {
    description: string;
    location: string;
    dates: EditableEventDates;
    rehearsalStart: Date | null;
    rehearsalEnd: Date | null;
    assignees: EditableAssignee[];
  };
};

export const EventDeleteMenu = ({
  eventId,
  organizationId,
  eventName,
  serviceColor,
  eventDetails,
}: EventDeleteMenuProps) => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const router = useRouter();

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteEvent(organizationId, eventId);

      if (result.success) {
        toast.success("Event has been deleted", { position: "top-center" });
        router.replace(`/dashboard/organizations/${organizationId}`)
      } else {
        toast.error(result.error, { position: "top-center" });
      };

    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Event actions"
            className="absolute right-4 top-4 z-10 cursor-pointer text-muted-foreground transition-colors hover:bg-muted"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            ACTION(s)
          </DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => setEditOpen(true)}
            className="cursor-pointer"
          >
            <Pencil className="mr-2 h-4 w-4" />
            Edit Details
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setConfirmOpen(true)}
            className="cursor-pointer text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Event
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditEventDetailsDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        eventId={eventId}
        organizationId={organizationId}
        serviceColor={serviceColor}
        assignees={eventDetails.assignees}
        initial={{
          name: eventName,
          description: eventDetails.description,
          location: eventDetails.location,
          dates: eventDetails.dates,
          rehearsalStart: eventDetails.rehearsalStart,
          rehearsalEnd: eventDetails.rehearsalEnd,
        }}
      />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-120">
          <DialogHeader>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <DialogTitle className="text-center text-xl text-destructive">
              Delete Event
            </DialogTitle>
            <DialogDescription className="text-center text-muted-foreground">
              {"Deleting "}
              <span className="font-semibold text-foreground">{eventName}</span>
              {" cannot be undone. All assignments and dates will be erased."}
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
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending && <Spinner className="mr-2" />}
              {isPending ? "Deleting..." : "Delete Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
