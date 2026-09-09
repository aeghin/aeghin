"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal, RefreshCw, Send, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cancelOrgInvite, resendInvitation } from "@/lib/actions/invitation";
import { InvitationStatus } from "@/generated/prisma/enums";

interface InvitationActionsMenuProps {
  organizationId: string;
  email: string;
  status: InvitationStatus;
}

export const InvitationActionsMenu = ({
  organizationId,
  email,
  status,
}: InvitationActionsMenuProps) => {
  const [isCanceling, startCancel] = useTransition();
  const [isResending, startResend] = useTransition();

  const handleCancel = () => {
    startCancel(async () => {
      const result = await cancelOrgInvite(organizationId, email);
      result.success
        ? toast.success("Invitation Canceled", { position: "top-center" })
        : toast.error(`${result.error}`, { position: "top-center" });
    });
  };

  const handleResend = (message: string) => {
    startResend(async () => {
      const result = await resendInvitation(organizationId, email);
      result.success
        ? toast.success(message, { position: "top-center" })
        : toast.error(`${result.error}`, { position: "top-center" });
    });
  };

  const hasActions =
    status === InvitationStatus.PENDING || status === InvitationStatus.CANCELED;

  if (!hasActions) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 cursor-pointer opacity-100 transition-opacity group-hover:opacity-100 sm:opacity-0"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {status === InvitationStatus.PENDING && (
          <>
            <DropdownMenuItem
              className="cursor-pointer"
              disabled={isResending}
              onSelect={() => handleResend("Invitation Resent")}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Resend Invitation
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer"
              disabled={isCanceling}
              onSelect={handleCancel}
            >
              <Ban className="mr-2 h-4 w-4" />
              Cancel Invitation
            </DropdownMenuItem>
          </>
        )}
        {status === InvitationStatus.CANCELED && (
          <DropdownMenuItem
            className="cursor-pointer"
            disabled={isResending}
            onSelect={() => handleResend("Invitation Sent")}
          >
            <Send className="mr-2 h-4 w-4" />
            Send New Invitation
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
