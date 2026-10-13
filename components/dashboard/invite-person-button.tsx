"use client"

import { useState } from "react"
import { UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { InvitePersonModal } from "@/components/setup/invite-person-modal";
import type { OrgPlan } from "@/lib/config/plans";

interface InviteMemberButtonProps {
    organizationId: string,
    organizationName: string,
    // Null when the plan has no member cap.
    seatUsage: { plan: OrgPlan; limit: number; left: number; pendingInvites: number } | null,
    canUpgrade: boolean
}

export function InviteMemberButton({ organizationId, organizationName, seatUsage, canUpgrade }: InviteMemberButtonProps) {

  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  return (
    <>
        <Button
          size="sm"
          variant="outline"
          className="cursor-pointer transition-all"
          onClick={() => setInviteModalOpen(true)}
        >
          <UserPlus className="mr-2 h-4 w-4" />
          Invite member
        </Button>
      <InvitePersonModal open={inviteModalOpen} onOpenChange={setInviteModalOpen} organizationId={organizationId} organizationName={organizationName} seatUsage={seatUsage} canUpgrade={canUpgrade}/>
    </>
  )
}