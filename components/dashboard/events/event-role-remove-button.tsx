"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tip } from "@/components/tip";
import { VolunteerRole } from "@/generated/prisma/enums";
import { volunteerRoleConfig } from "@/lib/config/roles";
import { removeEventRole } from "@/lib/actions/event";
import { useTip } from "@/hooks/use-tip";

interface EventRoleRemoveButtonProps {
  organizationId: string;
  eventId: string;
  role: VolunteerRole;
};

export const EventRoleRemoveButton = ({
  organizationId,
  eventId,
  role,
}: EventRoleRemoveButtonProps) => {

  const [isPending, startTransition] = useTransition();

  const { label } = volunteerRoleConfig[role];

  const handleRemove = () => {
    startTransition(async () => {
      const result = await removeEventRole(organizationId, eventId, { role });

      if (result.success) {
        toast.success(`${label} removed from this event`, { position: "top-center" });
      } else {
        toast.error(result.error, { position: "top-center" });
      };
    });
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`Remove ${label} from this event`}
      disabled={isPending}
      onClick={handleRemove}
      // Shown on hover, except on a touch screen, which has no hover to show it.
      className="h-6 w-6 cursor-pointer text-muted-foreground opacity-0 transition-all hover:bg-transparent hover:text-destructive focus-visible:opacity-100 group-hover/role:opacity-100 pointer-coarse:opacity-100"
    >
      {isPending ? <Spinner className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
    </Button>
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
