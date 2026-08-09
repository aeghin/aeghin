import { Eye, Settings } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrganizationSettings } from "@/lib/services/organization";
import { EditSettingsDialog } from "./edit-settings-dialog";
import { DeleteOrgDialog } from "./delete-org-dialog";
import { LeaveOrgDialog } from "./leave-org-dialog";
import { ManageSubscriptionButton } from "./manage-subscription-button";
import { ServiceTypesSettings } from "./service-types-settings";
import { OrgLogoUploader } from "./org-logo-uploader";
import { AppearanceToggle } from "./appearance-toggle";

interface SettingsTabContentProps {
  organizationId: string;
  canManage: boolean;
  isOwner: boolean;
};

export const SettingsTabContent = async ({
  organizationId,
  canManage,
  isOwner,
}: SettingsTabContentProps) => {
  

  const org = await getOrganizationSettings(organizationId);

  return (
  <Card className="overflow-hidden rounded-xl border-border/40 bg-linear-to-br from-card to-card/80 shadow-sm">
    <CardHeader className="border-b border-border/40 bg-secondary/20 px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          {canManage
            ? <Settings className="h-5 w-5 text-primary" />
            : <Eye className="h-5 w-5 text-primary" />}
        </div>
        <div>
          <CardTitle className="text-lg font-semibold">
            Organization Settings
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {canManage
              ? "Manage your organization details"
              : "View your organization details"}
          </p>
        </div>
      </div>
    </CardHeader>

    <CardContent className="space-y-8 p-6">
      <div className="overflow-hidden rounded-xl border border-border/40 bg-secondary/10">
        <div className="space-y-3 p-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Organization Name
            </label>
            <div className="text-sm font-medium">{org?.name}</div>
          </div>

          <div className="h-px bg-border/40" />

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Description
            </label>
            <div className="text-sm text-foreground/90">
              {org?.description || (
                <span className="italic text-muted-foreground">
                  No description added yet
                </span>
              )}
            </div>
          </div>
        </div>

        {canManage && (
          <div className="flex justify-start border-t border-border/40 bg-secondary/20 px-3 py-2">
            <EditSettingsDialog
              organizationId={organizationId}
              name={org?.name ?? ""}
              description={org?.description ?? ""}
            />
          </div>
        )}
      </div>
      <OrgLogoUploader
        organizationId={organizationId}
        logoUrl={org?.logoUrl ?? null}
        isOwner={isOwner}
      />
      {canManage && (
        <ServiceTypesSettings organizationId={organizationId} serviceTypes={org?.serviceTypes ?? []} />
      )}
      <AppearanceToggle />
      {isOwner && (
        <section className="rounded-xl border border-border/40 bg-secondary/10 p-5">
          <h3 className="text-sm font-semibold">Billing</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Manage your subscription, update payment details, view invoices, or
            cancel.
          </p>
          <div className="mt-3">
            <ManageSubscriptionButton orgId={organizationId} />
          </div>
        </section>
      )}
      <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
        <h3 className="text-sm font-semibold text-destructive">Danger Zone</h3>

        <p className="mt-1 text-xs text-muted-foreground">
          {isOwner
            ? "Permanently delete this organization and all its data, or leave the organization. Deletion can't be undone."
            : "Leave the organization. You'll lose access to its events and assignments until you're invited back."}
        </p>

        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
          {isOwner && (
            <DeleteOrgDialog organizationId={organizationId} name={org?.name ?? ""} />
          )}
          <LeaveOrgDialog organizationId={organizationId} name={org?.name ?? ""} isOwner={isOwner} />
        </div>
      </section>
    </CardContent>
  </Card>
);
};