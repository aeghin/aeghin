"use client"

import { useState, useTransition } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { LogOut } from "lucide-react";
import { leaveOrganization } from "@/lib/actions/roles";

interface LeaveOrgDialogProps {
  organizationId: string;
  name: string;
  isOwner: boolean;
};

export const LeaveOrgDialog = ({ organizationId, name, isOwner }: LeaveOrgDialogProps) => {

  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleLeave = () => {
    startTransition(async () => {
        const result = await leaveOrganization(organizationId);

        if (result.success) {
          toast.success("Successfully left organization", { position: "top-center" });
        } else {
          toast.error(result.error, { position: "top-center" });
        };
    });

    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="mt-4 cursor-pointer"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Leave Organization
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-120">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
            <LogOut className="h-7 w-7" />
          </div>
          <DialogTitle className="text-center text-xl">
            Leave Organization
          </DialogTitle>
          <DialogDescription className="text-center">
            {isOwner ? (
              <>
                {"You're about to leave "}
                <span className="font-medium text-red-600">{name}</span>
                {". You'll lose access to its events and assignments until you're invited back. If you're the only owner, make someone else an owner first, or delete the organization."}
              </>
            ) : (
              <>
                {"You're about to leave "}
                <span className="font-medium text-red-600">{name}</span>
                {". You'll lose access to its events and assignments until you're invited back."}
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleLeave}
            type="button"
            variant="destructive"
            disabled={isPending}
            size="sm"
          >
            {isPending && <Spinner className="mr-2" />}
            {isPending ? "Leaving..." : "Leave Organization"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
