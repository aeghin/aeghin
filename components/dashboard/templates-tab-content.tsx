import { LayoutTemplate } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TemplateModal } from "@/components/dashboard/templates/template-modal";
import { TemplateList } from "@/components/dashboard/templates/template-list";
import { getOrgEventTemplates } from "@/lib/services/event-templates";
import { getOrgServiceTypes } from "@/lib/services/service-types";
import { getOrgPlan } from "@/lib/billing/entitlements";
import { PLAN_LIMITS } from "@/lib/config/plans";

interface TemplatesTabContentProps {
  organizationId: string;
}

export const TemplatesTabContent = async ({
  organizationId,
}: TemplatesTabContentProps) => {

  const [templates, serviceTypes, plan] = await Promise.all([
    getOrgEventTemplates(organizationId),
    getOrgServiceTypes(organizationId),
    getOrgPlan(organizationId),
  ]);

  const smartSchedulingAvailable = PLAN_LIMITS[plan].smartScheduling;

  return (
    <Card className="overflow-hidden rounded-xl border-border/40 bg-linear-to-br from-card to-card/80 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 bg-secondary/20 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <LayoutTemplate className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg font-semibold">
              Event Templates
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {templates.length}{" "}
              {templates.length === 1 ? "template" : "templates"}
            </p>
          </div>
        </div>
        <TemplateModal
          organizationId={organizationId}
          serviceTypes={serviceTypes}
          smartSchedulingAvailable={smartSchedulingAvailable}
        />
      </CardHeader>
      <CardContent className="p-6">
        {templates.length > 0 ? (
          <TemplateList
            templates={templates}
            serviceTypes={serviceTypes}
            organizationId={organizationId}
            smartSchedulingAvailable={smartSchedulingAvailable}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/50">
              <LayoutTemplate className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="mt-4 font-medium">No templates yet</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Save a recurring event as a template and spin up next week&apos;s
              event in seconds.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
