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

import { MoreVertical, Shield, Users, Trash2, Settings2, Crown } from "lucide-react";

import { OrgRole, VolunteerRole } from "@/generated/prisma/enums";
import { volunteerRoleConfig } from "@/lib/config/roles";

import { useOptimistic, useState, useTransition } from "react";

import { updateUserRole } from "@/lib/actions/roles";
import { toast } from "sonner";
import { ConfirmMemberDeleteModal } from "@/components/dashboard/confirm-member-delete-modal";
import { ConfirmAssignOwnerModal } from "@/components/dashboard/confirm-assign-owner-modal";
import { updateVolunteerRoles } from "@/lib/actions/roles";


interface RoleAssignButtonsProps {
    userId: string;
    organizationId: string;
    currentRole: OrgRole;
    memberName: string;
    currentVolunteerRoles: VolunteerRole[];
    canManageMember: boolean;
    canManageVolunteerRoles: boolean;
    canAssignOwner: boolean;
}

export const RoleAssignButtons = ({ currentRole, userId, organizationId, memberName, currentVolunteerRoles, canManageMember, canManageVolunteerRoles, canAssignOwner }: RoleAssignButtonsProps) => {


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
                                {Object.values(VolunteerRole).map((role) => {
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
                    </>
                )}
                {canManageMember && <DropdownMenuSeparator />}
                {canManageMember && (
                    <>
                        <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Danger Zone
                        </DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => setRemoveMemberConfirm(true)} disabled={isPending} className="cursor-pointer text-destructive focus:text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" />
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
