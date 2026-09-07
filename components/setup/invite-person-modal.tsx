"use client"

import { useState, useTransition } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { UserPlus, Check } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { VolunteerRole } from "@/generated/prisma/enums";
import { volunteerRoleConfig } from "@/lib/config/roles";

import { inviteMember } from "@/lib/actions/invitation";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { OrgInvitationInput, orgInvitationSchema } from "@/lib/validations/invitations";

import { toast } from "sonner";

interface InvitePersonModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId?: string
  organizationName?: string
};

export function InvitePersonModal({
  open,
  onOpenChange,
  organizationId,
  organizationName,
}: InvitePersonModalProps) {

  const [isPending, startTransition] = useTransition();
  const [isSuccess, setIsSuccess] = useState(false);

  const form = useForm<OrgInvitationInput>({
    resolver: zodResolver(orgInvitationSchema),
    defaultValues: {
      email: "",
      phoneNumber: "",
      volunteerRoles: [],
      orgId: organizationId,
    },
  });

  const { isValid } = form.formState;

  const volunteerRoles = form.watch("volunteerRoles");
  const volunteerRoleSet = new Set(volunteerRoles);

  const toggleRole = (role: VolunteerRole) => {
    const current = form.getValues("volunteerRoles");
    const updated = current.includes(role)
      ? current.filter((r) => r !== role)
      : [...current, role];
    form.setValue("volunteerRoles", updated, { shouldValidate: true });
  };



  const handleSubmit = async (values: OrgInvitationInput) => {
    startTransition(async () => {
      const result = await inviteMember(values);

      if (result.success) {
        setIsSuccess(true);
      } else {
        toast.error(result.error, { position: "top-center" });
      };
    });
  };

  const handleClose = () => {
  if (!isPending) {
    onOpenChange(false);
    form.reset();
    setIsSuccess(false);
  }
};

  if (isSuccess) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-120">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Check className="h-8 w-8 text-primary" />
            </div>
            <DialogTitle className="mb-2 text-xl">Invitation Sent!</DialogTitle>
            <DialogDescription className="text-center">
              An invitation has been sent to {form.getValues("email")}
              {organizationName && ` to join ${organizationName}`}.
            </DialogDescription>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[92svh] flex-col gap-0 overflow-hidden p-0 sm:max-h-[90vh] sm:max-w-120">
        <DialogHeader className="shrink-0 px-6 pt-6">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 sm:mb-4">
            <UserPlus className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl">Invite Person</DialogTitle>
          <DialogDescription className="text-center">
            {organizationName
              ? `Send an invitation to join ${organizationName}`
              : "Send an invitation to join your organization"}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="volunteer@example.com"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="tel"
                        placeholder="1234567890"
                        disabled={isPending}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      They'll receive an invitation link to join your organization.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="volunteerRoles"
                render={() => (
                  <FormItem>
                    <FormLabel>Volunteer Roles</FormLabel>
                    <div className="max-h-none space-y-1 overflow-visible rounded-lg border border-border/50 bg-muted/30 p-2 sm:max-h-60 sm:space-y-2 sm:overflow-y-auto sm:p-3">
                      {Object.values(VolunteerRole).map((role) => {
                        const config = volunteerRoleConfig[role];
                        return (
                          <label
                            key={role}
                            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-2.5 hover:bg-muted/75 active:bg-muted"
                          >
                            <Checkbox
                              checked={volunteerRoleSet.has(role)}
                              onCheckedChange={() => toggleRole(role)}
                              disabled={isPending}
                            />
                            <span className="text-lg">{config.icon}</span>
                            <span className="text-sm font-medium">{config.label}</span>
                          </label>
                        )
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Select one or more volunteer roles for this person.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {volunteerRoles.length > 0 && (
                <div className="rounded-lg border border-border/50 bg-muted/50 p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Selected Roles ({volunteerRoles.length}):
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {volunteerRoles.map((r) => {
                      const role = volunteerRoleConfig[r];
                      return (
                        <Badge key={r} variant="outline" className="gap-1">
                          <span>{role.icon}</span>
                          <span>{role.label}</span>
                        </Badge>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="shrink-0 gap-2 border-t bg-background px-6 py-4">
              <Button type="button" variant="outline" onClick={handleClose} disabled={isPending} className="w-full cursor-pointer sm:w-auto">
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || !isValid} className="w-full cursor-pointer sm:w-auto">
                {isPending ? (
                  <>
                    <Spinner data-icon="inline-start" />
                    Sending...
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Send Invitation
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
