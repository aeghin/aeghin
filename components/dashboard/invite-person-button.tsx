"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
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
          className="cursor-pointer shadow-lg shadow-primary/20 transition-all hover:scale-105 hover:shadow-primary/30"
          onClick={() => setInviteModalOpen(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Invite Member
        </Button>
      <InvitePersonModal open={inviteModalOpen} onOpenChange={setInviteModalOpen} organizationId={organizationId} organizationName={organizationName} seatUsage={seatUsage} canUpgrade={canUpgrade}/>
    </>
  )
}