"use client"

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { CircleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { removeMember } from "@/lib/actions/roles";
import { useTransition } from "react";
import { toast } from "sonner";


interface ConfirmMemberDeleteModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    userId: string
    organizationId: string
    memberName: string
};


export const ConfirmMemberDeleteModal = ({open, onOpenChange, userId, organizationId, memberName }: ConfirmMemberDeleteModalProps) => {

  const [isPending, startTransition] = useTransition(); 

  const deleteMember = () => {
   startTransition(async () => {
      const result = await removeMember(userId, organizationId);

      if (result.success === false) {
        toast.error(result.error, { position: "top-center" });
      } else {
        onOpenChange(false);
        toast.success("Member Successfully Deleted", { position: "top-center" });
      };
    });
  };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <CircleAlert className="h-6 w-6 text-destructive" />
            </div>
            <DialogTitle className="text-center text-xl">Remove Member</DialogTitle>
            <DialogDescription className="text-center mb-2">
              Remove{" "}
             <span className="font-semibold bg-linear-to-r from-rose-500 to-red-600 bg-clip-text text-transparent">{memberName}</span>
              {" "}from this organization? They&apos;ll be taken off upcoming events.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button disabled={isPending} variant="outline">Cancel</Button>
            </DialogClose>
            <Button className="bg-red-600 hover:bg-red-600/90 dark:hover:bg-red-700" disabled={isPending} onClick={deleteMember}>{isPending ? (<><Spinner className="inline-start"/> Removing...</>) : ("Remove Member")}</Button>
          </DialogFooter>
        </DialogContent>
    </Dialog>
    )
}