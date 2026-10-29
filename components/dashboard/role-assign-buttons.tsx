"use client"

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { Button } from "@/components/ui/button";

import { MoreVertical, Shield, Users, Trash2, Settings2, Crown, MicVocal } from "lucide-react";

import { OrgRole, VolunteerRole, VoiceType } from "@/generated/prisma/enums";
import {
    ROLE_ORDER,
    VOICE_TYPE_ORDER,
    hasSingingRole,
    voiceTypeLabel,
    volunteerRoleConfig,
} from "@/lib/config/roles";

import { useOptimistic, useState, useTransition } from "react";

import { updateUserRole } from "@/lib/actions/roles";
import { toast } from "sonner";
import { ConfirmMemberDeleteModal } from "@/components/dashboard/confirm-member-delete-modal";
import { ConfirmAssignOwnerModal } from "@/components/dashboard/confirm-assign-owner-modal";
import { updateVolunteerRoles, updateVoiceType } from "@/lib/actions/roles";

/** The Voice Type menu's "Not set": a radio item can't carry null. */
const NO_VOICE_TYPE = "none";

interface RoleAssignButtonsProps {
    userId: string;
    organizationId: string;
    currentRole: OrgRole;
    memberName: string;
    currentVolunteerRoles: VolunteerRole[];
    currentVoiceType: VoiceType | null;
    canManageMember: boolean;
    canRemoveMember: boolean;
    canManageVolunteerRoles: boolean;
    canAssignOwner: boolean;
}

export const RoleAssignButtons = ({ currentRole, userId, organizationId, memberName, currentVolunteerRoles, currentVoiceType, canManageMember, canRemoveMember, canManageVolunteerRoles, canAssignOwner }: RoleAssignButtonsProps) => {


    const [isPending, startTransition] = useTransition();
    const [removeMemberConfirm, setRemoveMemberConfirm] = useState(false);
    const [assignOwnerConfirm, setAssignOwnerConfirm] = useState(false);

    const [optimisticRoles, toggleOptimistic] = useOptimistic<VolunteerRole[], VolunteerRole>(
        currentVolunteerRoles,
        (current, role) =>
            current.includes(role)
                ? current.filter((r) => r !== role)
                : [...current, role]
    );

    // The menu renders a checkbox per known role, so keep the lookup keyed.
    const optimisticRoleSet = new Set(optimisticRoles);

    const [optimisticVoiceType, setOptimisticVoiceType] = useOptimistic<VoiceType | null, VoiceType | null>(
        currentVoiceType,
        (_current, voiceType) => voiceType
    );

    const handleRoleChange = (role: string) => {
        const newRole = role as OrgRole;

        startTransition(async () => {
            toast.promise(
                updateUserRole({ userId, organizationId, role: newRole }).then((result) => {
                    if (!result.success) throw new Error(result.error);
                    return result;
                }),
                {
                    position: "bottom-center",
                    classNames: {
                        toast: "justify-center"
                    },
                    loading: "Updating Role...",
                    success: {
                        message: "Role Updated!",
                        duration: 5000,
                    },
                    error: (err) => ({
                        message: err instanceof Error ? err.message : "Something went wrong, try again!",
                        duration: 5000,
                    }),
                }
            );
        });
    };

    const handleVolunteerRoleToggle = (role: VolunteerRole) => {
        startTransition(async () => {

            toggleOptimistic(role);

            const result = await updateVolunteerRoles(userId, organizationId, role)
            if (!result.success) {
                toast.error(result.error, { position: "top-center" });
            } else {
                toast.success("Successfully updated volunteer role", { position: "top-center" });
            };
        });
    };

    const handleVoiceTypeChange = (value: string) => {
        const voiceType = value === NO_VOICE_TYPE ? null : (value as VoiceType);

        startTransition(async () => {

            setOptimisticVoiceType(voiceType);

            const result = await updateVoiceType(userId, organizationId, voiceType);
            if (!result.success) {
                toast.error(result.error, { position: "top-center" });
            } else {
                toast.success("Successfully updated voice type", { position: "top-center" });
            };
        });
    };

    return (
    <>
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 cursor-pointer opacity-0 transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100 hover:bg-transparent focus-visible:ring-0 focus-visible:border-transparent"
                >
                    <MoreVertical className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
                {canManageMember && (
                    <>
                        <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Change Role
                        </DropdownMenuLabel>
                        <DropdownMenuRadioGroup value={currentRole} onValueChange={handleRoleChange}>
                            {/* Shown checked so an owner's row says what they are; picking Admin or Member steps them down. */}
                            {currentRole === OrgRole.OWNER && (
                                <DropdownMenuRadioItem disabled value={OrgRole.OWNER}>
                                    <Crown className="mr-2 h-4 w-4 text-gold" />
                                    Owner
                                </DropdownMenuRadioItem>
                            )}
                            <DropdownMenuRadioItem disabled={isPending} value={OrgRole.ADMIN} className="cursor-pointer">
                                 <Shield className="mr-2 h-4 w-4" />
                                Admin
                            </DropdownMenuRadioItem>
                            <DropdownMenuRadioItem disabled={isPending} value={OrgRole.MEMBER} className="cursor-pointer">
                               <Users className="mr-2 h-4 w-4" />
                                Member
                            </DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                        {canAssignOwner && (
                            <DropdownMenuItem inset onClick={() => setAssignOwnerConfirm(true)} disabled={isPending} className="cursor-pointer text-gold focus:text-gold">
                                <Crown className="mr-2 h-4 w-4 text-gold" />
                                Make Owner
                            </DropdownMenuItem>
                        )}
                    </>
                )}
                {canManageMember && <DropdownMenuSeparator />}
                {canManageVolunteerRoles && (
                    <>
                        <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Volunteer Role(s)
                        </DropdownMenuLabel>
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger disabled={isPending} className="cursor-pointer">
                                <Settings2 className="mr-2 h-4 w-4" />
                                Manage Roles
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="w-52">
                                {ROLE_ORDER.map((role) => {
                                    const config = volunteerRoleConfig[role];
                                    return (
                                        <DropdownMenuCheckboxItem
                                            key={role}
                                            checked={optimisticRoleSet.has(role)}
                                            onCheckedChange={() => handleVolunteerRoleToggle(role)}
                                            onSelect={(e) => e.preventDefault()}
                                            disabled={isPending}
                                            className="cursor-pointer"
                                        >
                                            <span className="mr-1 text-base leading-none" aria-hidden>{config.icon}</span>
                                            {config.label}
                                        </DropdownMenuCheckboxItem>
                                    );
                                })}
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        {/* Only a singer has one; it shows the moment a role that sings is ticked. */}
                        {hasSingingRole(optimisticRoles) && (
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger disabled={isPending} className="cursor-pointer">
                                    <MicVocal className="mr-2 h-4 w-4" />
                                    Voice Type
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent className="w-44">
                                    <DropdownMenuRadioGroup value={optimisticVoiceType ?? NO_VOICE_TYPE} onValueChange={handleVoiceTypeChange}>
                                        <DropdownMenuRadioItem value={NO_VOICE_TYPE} disabled={isPending} className="cursor-pointer">
                                            Not set
                                        </DropdownMenuRadioItem>
                                        {VOICE_TYPE_ORDER.map((voiceType) => (
                                            <DropdownMenuRadioItem key={voiceType} value={voiceType} disabled={isPending} className="cursor-pointer">
                                                {voiceTypeLabel(voiceType)}
                                            </DropdownMenuRadioItem>
                                        ))}
                                    </DropdownMenuRadioGroup>
                                </DropdownMenuSubContent>
                            </DropdownMenuSub>
                        )}
                    </>
                )}
                {canRemoveMember && <DropdownMenuSeparator />}
                {canRemoveMember && (
                    <>
                        <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Danger Zone
                        </DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => setRemoveMemberConfirm(true)} disabled={isPending} className="cursor-pointer">
                            <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                            Remove Member
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
        <ConfirmMemberDeleteModal open={removeMemberConfirm} onOpenChange={setRemoveMemberConfirm} userId={userId} organizationId={organizationId} memberName={memberName} />
        <ConfirmAssignOwnerModal open={assignOwnerConfirm} onOpenChange={setAssignOwnerConfirm} userId={userId} organizationId={organizationId} memberName={memberName} />
    </>
    )

}
