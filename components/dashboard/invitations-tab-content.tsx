import { Mail, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnimatedInvitationRow } from "@/components/dashboard/animated-invitation-row";
import { InvitationActionsMenu } from "@/components/dashboard/invitation-actions-menu";
import { cn } from "@/lib/utils";
import { organizationInvitations } from "@/lib/services/invitation";
import { InvitationStatus } from "@/generated/prisma/enums";

const getStatusConfig = (status: InvitationStatus) => {
  switch (status) {
    case InvitationStatus.ACCEPTED:
      return {
        icon: CheckCircle2,
        label: "Accepted",
        className:
          "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
      };
    case InvitationStatus.DECLINED:
      return {
        icon: XCircle,
        label: "Declined",
        className:
          "bg-destructive/10 text-destructive border-destructive/20",
      };
    case InvitationStatus.CANCELED:
      return {
        icon: Clock,
        label: "Canceled",
        className: "bg-muted text-muted-foreground border-border",
      };
    case InvitationStatus.PENDING:
      return {
        icon: Clock,
        label: "Pending",
        className:
          "bg-amber-500/10 text-amber-600 border-amber-500/20",
      };
  }
};

interface InvitationsTabContentProps {
  organizationId: string;
}

export const InvitationsTabContent = async ({
  organizationId,
}: InvitationsTabContentProps) => {
  

  const invitations = await organizationInvitations(organizationId);

  const pendingCount = invitations.filter(
    (inv) => inv.status === InvitationStatus.PENDING
  ).length;


  return (
    <Card className="overflow-hidden rounded-xl border-border/40 bg-linear-to-br from-card to-card/80 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 bg-secondary/20 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg font-semibold">
              Invitations
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {pendingCount} pending
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {invitations.length === 0 ? (
          <div className="flex h-50 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Mail className="h-10 w-10 opacity-20" />
            <p className="text-sm">No invitations found</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {invitations.map((invitation, i) => {
              const statusConfig = getStatusConfig(invitation.status);
              const StatusIcon = statusConfig.icon;

              const statusDate = new Date(invitation.updatedAt).toLocaleDateString(
                "en-US",
                { month: "short", day: "numeric", year: "numeric" },
              );

              return (
                <AnimatedInvitationRow key={invitation.id} index={i}>
                  <div className="flex min-w-0 items-start gap-4 sm:items-center">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-secondary to-secondary/50 text-sm font-semibold text-secondary-foreground">
                      {invitation.email.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 truncate font-medium">
                          {invitation.email}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0 text-[10px] font-medium capitalize",
                            statusConfig.className
                          )}
                        >
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {statusConfig.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Invited{" "}
                        {new Date(invitation.createdAt).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric"
                          }
                        )}
                        {` By ${invitation.invitedBy.firstName} ${invitation.invitedBy.lastName}`}
                      </p>
                      <p className="text-xs text-muted-foreground sm:hidden">
                        {`${statusConfig.label} on ${statusDate}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="hidden text-xs text-muted-foreground sm:inline-block">
                      {`${statusConfig.label} on ${statusDate}`}
                    </span>
                    <InvitationActionsMenu
                      organizationId={organizationId}
                      email={invitation.email}
                      status={invitation.status}
                    />
                  </div>
                </AnimatedInvitationRow>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};