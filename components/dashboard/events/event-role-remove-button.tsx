"use client";

import { useState, useTransition } from "react";
import { AlertCircle, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Tip } from "@/components/tip";
import { InvitationStatus, VolunteerRole } from "@/generated/prisma/enums";
import { volunteerRoleConfig } from "@/lib/config/roles";
import { removeEventRole } from "@/lib/actions/event";
import { useTip } from "@/hooks/use-tip";

interface EventRoleRemoveButtonProps {
  organizationId: string;
  eventId: string;
  role: VolunteerRole;
  /**
   * The statuses of the invites still on the role's card — declined, canceled
   * or expired, as their pills read. They go with the role.
   */
  invites: InvitationStatus[];
};

const STATUS_WORDS: [InvitationStatus, string][] = [
  [InvitationStatus.DECLINED, "declined"],
  [InvitationStatus.CANCELED, "canceled"],
  [InvitationStatus.EXPIRED, "expired"],
];

const list = new Intl.ListFormat("en", { type: "conjunction" });

export const EventRoleRemoveButton = ({
  organizationId,
  eventId,
  role,
  invites,
}: EventRoleRemoveButtonProps) => {

  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { label } = volunteerRoleConfig[role];

  // "and its declined invite", in the pills' words, so it's plain nobody on
  // the event goes with it.
  const words = STATUS_WORDS.filter(([status]) => invites.includes(status)).map(
    ([, word]) => word,
  );
  const alsoClears =
    words.length === 0
      ? ""
      : ` and its ${list.format(words)} ${invites.length === 1 ? "invite" : "invites"}`;

  const handleRemove = () => {
    startTransition(async () => {
      const result = await removeEventRole(organizationId, eventId, { role });

      if (result.success) {
        toast.success(`${label} removed from this event`, { position: "top-center" });
        setConfirmOpen(false);
      } else {
        toast.error(result.error, { position: "top-center" });
      };
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Remove ${label} from this event`}
        disabled={isPending}
        onClick={() => setConfirmOpen(true)}
        // Shown on hover, except on a touch screen, which has no hover to show it.
        className="h-6 w-6 cursor-pointer text-muted-foreground opacity-0 transition-all hover:bg-transparent hover:text-destructive focus-visible:opacity-100 group-hover/role:opacity-100 pointer-coarse:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-120">
          <DialogHeader>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <DialogTitle className="text-center text-xl text-destructive">
              Remove Role
            </DialogTitle>
            <DialogDescription className="text-center text-muted-foreground">
              {"Removes "}
              <span className="font-semibold text-foreground">{label}</span>
              {`${alsoClears} from this event.`}
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
              onClick={handleRemove}
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

/**
 * The phone's swipe hint, as the web removes a role: under the line of the
 * first role nobody is on, pointing up at its name, with the × at that line's
 * end.
 */
export const EventRoleRemoveTip = ({ userId }: { userId: string }) => {
  const tip = useTip("removeRole", userId);

  if (!tip.show) return null;

  return (
    <Tip
      icon={X}
      title="Remove a role you don't need"
      message={
        <>
          <span className="pointer-coarse:hidden">Point at it and click ×.</span>
          <span className="hidden pointer-coarse:inline">Tap its ×.</span> A role with
          someone on it stays until they&apos;re removed.
        </>
      }
      onDismiss={tip.dismiss}
    />
  );
};
