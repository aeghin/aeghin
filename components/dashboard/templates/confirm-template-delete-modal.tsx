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

import { deleteEventTemplate } from "@/lib/actions/event-template";
import { useTransition } from "react";
import { toast } from "sonner";


interface ConfirmTemplateDeleteModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    templateId: string
    organizationId: string
    templateName: string
};


export const ConfirmTemplateDeleteModal = ({ open, onOpenChange, templateId, organizationId, templateName }: ConfirmTemplateDeleteModalProps) => {

  const [isPending, startTransition] = useTransition();

  const deleteTemplate = () => {
    startTransition(async () => {
      const result = await deleteEventTemplate(templateId, organizationId);

      if (result.success === false) {
        toast.error(result.error, { position: "top-center" });
      } else {
        onOpenChange(false);
        toast.success("Template Deleted", { position: "top-center" });
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
            <DialogTitle className="text-center text-xl">Delete Template</DialogTitle>
            <DialogDescription className="text-center mb-2">
              Delete{" "}
             <span className="font-semibold bg-linear-to-r from-rose-500 to-red-600 bg-clip-text text-transparent">{templateName}</span>
              ? Events already created from it are not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button disabled={isPending} variant="outline">Cancel</Button>
            </DialogClose>
            <Button className="bg-red-600 hover:bg-red-600/90 dark:hover:bg-red-700" disabled={isPending} onClick={deleteTemplate}>{isPending ? (<><Spinner className="inline-start"/> Deleting...</>) : ("Delete Template")}</Button>
          </DialogFooter>
        </DialogContent>
    </Dialog>
    )
}
