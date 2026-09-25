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
import { startPlanCheckout } from "@/lib/actions/billing";
import type { PaidPlan } from "@/lib/config/plans";
import { InvitationStatus } from "@/generated/prisma/enums";

interface InvitationActionsMenuProps {
  organizationId: string;
  email: string;
  status: InvitationStatus;
  canUpgrade: boolean;
  // The plan that lifts the member limit. Null on a plan with no next step.
  upgradeTo: PaidPlan | null;
}

export const InvitationActionsMenu = ({
  organizationId,
  email,
  status,
  canUpgrade,
  upgradeTo,
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

  const handleUpgrade = async () => {
    if (upgradeTo === null) return;

    const result = await startPlanCheckout(organizationId, upgradeTo);

    if (result.success) {
      window.location.href = result.url;
    } else {
      toast.error(result.error, { position: "top-center" });
    }
  };

  const handleResend = (message: string) => {
    startResend(async () => {
      const result = await resendInvitation(organizationId, email);

      if (result.success) {
        toast.success(message, { position: "top-center" });
      } else if (result.code === "MEMBER_LIMIT" && canUpgrade && upgradeTo !== null) {
        toast.error(result.error, {
          position: "top-center",
          action: { label: "Upgrade", onClick: handleUpgrade },
        });
      } else {
        toast.error(`${result.error}`, { position: "top-center" });
      }
    });
  };

  // EXPIRED belongs here with CANCELED: both are dead rows whose only move is a
  // fresh invitation, and resendInvitation resets the token and the window for
  // either. Leaving it out stranded lapsed invites with no menu at all — the
  // one state where an admin most needs the resend.
  const hasActions =
    status === InvitationStatus.PENDING ||
    status === InvitationStatus.CANCELED ||
    status === InvitationStatus.EXPIRED;

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
        {(status === InvitationStatus.CANCELED ||
          status === InvitationStatus.EXPIRED) && (
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
