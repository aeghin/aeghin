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
import { Textarea } from "@/components/ui/textarea";
import { Mail, Check, Send } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { emailAcceptedVolunteers } from "@/lib/actions/event";
import { PlanLimitReached } from "@/components/dashboard/plan-limit-reached";
import type { EmailAllowance } from "@/lib/billing/limits";

import { cn } from "@/lib/utils";
import { colorClasses } from "@/lib/config/service-types-config";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { EventEmailInput, eventEmailSchema } from "@/lib/validations/event-email";

import { toast } from "sonner";

interface EmailTeamDialogProps {
  organizationId: string;
  organizationName: string;
  eventId: string;
  eventName: string;
  recipientCount: number;
  serviceColor: string;
  // This month's group emails against the plan's allowance.
  allowance: EmailAllowance;
  canUpgrade: boolean;
}

export function EmailTeamDialog({
  organizationId,
  organizationName,
  eventId,
  eventName,
  recipientCount,
  serviceColor,
  allowance,
  canUpgrade,
}: EmailTeamDialogProps) {

  const serviceColors = colorClasses[serviceColor];
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [sentCount, setSentCount] = useState<number | null>(null);
  // The server's refusal, for when it knew the allowance was used up and this page didn't.
  const [limitMessage, setLimitMessage] = useState<string | null>(null);

  const limitReached = allowance.sent >= allowance.limit || limitMessage !== null;

  const form = useForm<EventEmailInput>({
    resolver: zodResolver(eventEmailSchema),
    defaultValues: {
      subject: "",
      body: "",
    },
  });

  const { isValid } = form.formState;

  const handleSubmit = async (values: EventEmailInput) => {
    startTransition(async () => {
      const result = await emailAcceptedVolunteers(organizationId, eventId, values);

      if (result.success) {
        setSentCount(result.sentCount);
      } else if (result.code === "EMAIL_LIMIT") {
        setLimitMessage(result.error);
      } else {
        toast.error(result.error, { position: "top-center" });
      };
    });
  };

  const handleClose = () => {
    if (!isPending) {
      setOpen(false);
      form.reset();
      setSentCount(null);
      setLimitMessage(null);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 px-2.5 text-xs cursor-pointer"
        onClick={() => setOpen(true)}
      >
        <Mail className="h-3.5 w-3.5" />
        Email Team
      </Button>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-120">
          {sentCount !== null ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div
                className={cn(
                  "mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full",
                  serviceColors.badge,
                )}
              >
                <Check className={cn("h-8 w-8", serviceColors.badgeText)} />
              </div>
              <DialogTitle className="mb-2 text-xl">Message Sent!</DialogTitle>
              <DialogDescription className="text-center">
                Your message was emailed to {sentCount} volunteer
                {sentCount === 1 ? "" : "s"} on {eventName}.
              </DialogDescription>
            </div>
          ) : limitReached ? (
            <PlanLimitReached
              icon={Mail}
              title="Monthly email limit reached"
              description={
                limitMessage ??
                `${organizationName} has sent all ${allowance.limit} of this month's group emails. The count starts over on ${allowance.resetsOn}.`
              }
              organizationId={organizationId}
              organizationName={organizationName}
              canUpgrade={canUpgrade}
              upgradeTo={allowance.upgradeTo}
              onClose={handleClose}
            />
          ) : (
            <>
              <DialogHeader>
                <div
                  className={cn(
                    "mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full",
                    serviceColors.badge,
                  )}
                >
                  <Mail className={cn("h-6 w-6", serviceColors.badgeText)} />
                </div>
                <DialogTitle className="text-center text-xl">Email Team</DialogTitle>
                <DialogDescription className="text-center">
                  Send an email to the {recipientCount} volunteer
                  {recipientCount === 1 ? "" : "s"} who accepted {eventName}.
                </DialogDescription>
                <p className="text-center text-xs text-muted-foreground">
                  {allowance.sent} of {allowance.limit} group emails sent this month
                </p>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4">
                  <FormField
                    control={form.control}
                    name="subject"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Subject</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Practice time has changed"
                            disabled={isPending}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="body"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Message</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="Hey team, ..."
                            className="min-h-32"
                            disabled={isPending}
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          Replies will go straight to your email address.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <DialogFooter className="pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleClose}
                      disabled={isPending}
                      className="cursor-pointer"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={isPending || !isValid}
                      className={cn(
                        "cursor-pointer",
                        serviceColors.solid,
                        serviceColors.solidHover,
                      )}
                    >
                      {isPending ? (
                        <>
                          <Spinner data-icon="inline-start" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="mr-2 h-4 w-4" />
                          Send Email
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
