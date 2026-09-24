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
import { UserPlus, Check, Users, Sparkles } from "lucide-react";
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
import { startAiSetlistCheckout } from "@/lib/actions/billing";
import { PLAN_PRICES } from "@/lib/config/plans";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { OrgInvitationInput, orgInvitationSchema } from "@/lib/validations/invitations";

import { toast } from "sonner";

// What the limit screen says Premium adds. Keep it to what Premium does today.
const PREMIUM_PERKS = [
  "Unlimited members and invites",
  "AI setlist generation from your song library",
  "Billed per organization, cancel anytime",
];

interface InvitePersonModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId?: string
  organizationName?: string
  // Null when the plan has no member cap.
  seatUsage?: { limit: number; left: number; pendingInvites: number } | null
  canUpgrade?: boolean
};

export function InvitePersonModal({
  open,
  onOpenChange,
  organizationId,
  organizationName,
  seatUsage = null,
  canUpgrade = false,
}: InvitePersonModalProps) {

  const [isPending, startTransition] = useTransition();
  const [isSuccess, setIsSuccess] = useState(false);
  const [isUpgrading, startUpgrade] = useTransition();
  // The server's refusal, for when it knew the org was full and this page didn't.
  const [limitMessage, setLimitMessage] = useState<string | null>(null);

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
      } else if (result.code === "MEMBER_LIMIT") {
        setLimitMessage(result.error);
      } else {
        toast.error(result.error, { position: "top-center" });
      };
    });
  };

  const handleUpgrade = () => {
    if (!organizationId) return;

    startUpgrade(async () => {
      const result = await startAiSetlistCheckout(organizationId);

      if (result.success) {
        // Full navigation — Stripe Checkout is an external URL.
        window.location.href = result.url;
      } else {
        toast.error(result.error, { position: "top-center" });
      }
    });
  };

  const handleClose = () => {
  if (!isPending) {
    onOpenChange(false);
    form.reset();
    setIsSuccess(false);
    setLimitMessage(null);
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

  const isFull = limitMessage !== null || seatUsage?.left === 0;

  if (isFull) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-120">
          <div className="flex flex-col items-center pt-4 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <DialogTitle className="mb-2 text-xl">Member limit reached</DialogTitle>
            <DialogDescription className="text-center">
              {seatUsage
                ? `${organizationName ?? "Your organization"} has reached the Free plan's ${seatUsage.limit}-member limit. Pending invites count toward it.`
                : limitMessage}
            </DialogDescription>
          </div>

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="flex items-center gap-1.5 font-semibold">
                <Sparkles className="h-4 w-4 text-primary" />
                Premium
              </p>
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{PLAN_PRICES.premium}</span>/month
              </p>
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {PREMIUM_PERKS.map((perk) => (
                <li key={perk} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {perk}
                </li>
              ))}
            </ul>
          </div>

          {seatUsage && seatUsage.pendingInvites > 0 && (
            <p className="text-center text-xs text-muted-foreground">
              Or cancel a pending invite in the Invitations tab to free a spot.
            </p>
          )}

          {!canUpgrade && (
            <p className="text-center text-sm text-muted-foreground">
              Only an owner can upgrade. Ask an owner of {organizationName ?? "your organization"} to upgrade to Premium.
            </p>
          )}

          <DialogFooter className="gap-2 sm:justify-center">
            <Button variant="outline" onClick={handleClose} className="w-full cursor-pointer sm:w-auto">
              {canUpgrade ? "Not now" : "Close"}
            </Button>
            {canUpgrade && (
              <Button onClick={handleUpgrade} disabled={isUpgrading} className="w-full cursor-pointer sm:w-auto">
                <Sparkles className="mr-2 h-4 w-4" />
                {isUpgrading ? "Redirecting…" : "Upgrade to Premium"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
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
                    <div className="space-y-1 rounded-lg border border-border/50 bg-muted/30 p-2 sm:space-y-2 sm:p-3">
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
            </div>

            {volunteerRoles.length > 0 && (
              <div className="shrink-0 border-t bg-muted/40 px-6 py-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Selected Roles ({volunteerRoles.length}):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {volunteerRoles.map((r) => {
                    const role = volunteerRoleConfig[r];
                    return (
                      <Badge key={r} variant="outline" className="gap-1 bg-background">
                        <span>{role.icon}</span>
                        <span>{role.label}</span>
                      </Badge>
                    )
                  })}
                </div>
              </div>
            )}

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
