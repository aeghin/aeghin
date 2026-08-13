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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { Trash2, AlertCircle } from "lucide-react";

import { deleteOrganization } from "@/lib/actions/organizations";

import { useRouter } from "next/navigation";


interface DeleteOrgDialogProps {
    organizationId: string
    name: string
};

export const DeleteOrgDialog = ({ organizationId, name }: DeleteOrgDialogProps) => {

    const [open, setOpen] = useState(false);
    const [confirmText, setConfirmText] = useState("");
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    const isMatch = name.length > 0 && confirmText === name;

    const handleOpenChange = (nextOpen: boolean) => {
      if (isPending) return;
      setOpen(nextOpen);
      setConfirmText("");
    };

    const handleDelete = () => {
      if (!isMatch) return;

      startTransition(async () => {
        const result = await deleteOrganization(organizationId)

        if (result.success) {
          toast.success("Organization Deleted", { position: "top-center" });
          router.replace("/dashboard");
        } else {
          toast.error(result.error)
        };
      });
    };


    return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
         <Button
          variant="destructive"
          size="sm"
          className="mt-4 cursor-pointer"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Organization
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-120">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
          <DialogTitle className="text-center text-xl text-red-600">
            Delete Organization
          </DialogTitle>
          <DialogDescription className="text-center">
            {"Deleting "}
            <span className="text-red-600">{name}</span>
            {" cannot be undone once completed. All data will be erased."}
          </DialogDescription>
        </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="confirm-org-name" className="block text-sm font-normal">
                {"To confirm, type "}
                <span className="font-mono font-semibold break-words whitespace-pre-wrap text-red-600">{name}</span>
                {" exactly:"}
              </Label>
              <Input
                id="confirm-org-name"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                disabled={isPending}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-invalid={confirmText.length > 0 && !isMatch}
                className="font-mono"
              />
            </div>
            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button onClick={handleDelete} type="button" variant="destructive" disabled={isPending || !isMatch} size="sm">
                {isPending && <Spinner className="mr-2" />}
                {isPending ? "Deleting..." : "Delete Organization"}
              </Button>
            </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
