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

import { Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTransition } from "react";
import { assignOwnerRole } from "@/lib/actions/roles";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";


interface ConfirmAssignOwnerModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    userId: string
    organizationId: string
    memberName: string
};


export const ConfirmAssignOwnerModal = ({ open, onOpenChange, userId, organizationId, memberName }: ConfirmAssignOwnerModalProps) => {

    const [isPending, startTransition] = useTransition();

    const handleAssignOwner = () => {
      startTransition(async () => {
        const result = await assignOwnerRole({ userId, organizationId })

        if (result.success) {
          toast.success(`${memberName} is now an owner.`, { position: "top-center" });
          onOpenChange(false)
        } else {
          toast.error(result.error, { position: "top-center" });
        };

    })};


    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
              <Crown className="h-6 w-6 text-amber-600" />
            </div>
            <DialogTitle className="text-center text-xl">Make Owner</DialogTitle>
            <DialogDescription className="text-center mb-2">
              Make{" "}
             <span className="font-semibold bg-linear-to-r from-amber-500 to-yellow-600 bg-clip-text text-transparent">{memberName}</span>
              {" "}an owner? Owners have full control over this organization. Another owner can change this later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button disabled={isPending} variant="outline">Cancel</Button>
            </DialogClose>
            <Button disabled={isPending} onClick={handleAssignOwner} className="relative bg-amber-600 hover:bg-amber-600/90 dark:hover:bg-amber-700">
              <span className={isPending ? "invisible" : undefined}>Make Owner</span>
              {isPending && <Spinner className="absolute inset-0 m-auto" />}
            </Button>
          </DialogFooter>
        </DialogContent>
    </Dialog>
    )
}
