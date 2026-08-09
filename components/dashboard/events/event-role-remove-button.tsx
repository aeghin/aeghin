"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { VolunteerRole } from "@/generated/prisma/enums";
import { volunteerRoleConfig } from "@/lib/config/roles";
import { removeEventRole } from "@/lib/actions/event";

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
      className="h-6 w-6 cursor-pointer text-muted-foreground opacity-0 transition-all hover:bg-transparent hover:text-destructive focus-visible:opacity-100 group-hover/role:opacity-100"
    >
      {isPending ? <Spinner className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
    </Button>
  );
};
