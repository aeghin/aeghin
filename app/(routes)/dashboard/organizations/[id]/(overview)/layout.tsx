import { Suspense } from "react";
import { AnimatedSection } from "@/components/dashboard/animate-section";
import {
  OrgHeaderSection,
  OrgHeaderSkeleton,
} from "@/components/dashboard/org-shell/org-header-section";

// The org's overview sections — Events (the home, at the org's root URL),
// Members, Blockouts, My keys, Invitations, Templates, Activity, Settings —
// each its own route under this group, sharing the org header above them.
// Songs, event pages and member profiles sit outside the group, so they keep
// their own full-page layouts without the header.
export default function OrganizationOverviewLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  return (
    <main className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="space-y-6 sm:space-y-8">
        <AnimatedSection delay={0.05}>
          <Suspense fallback={<OrgHeaderSkeleton />}>
            <OrgHeaderSection params={params} />
          </Suspense>
        </AnimatedSection>

        <AnimatedSection delay={0.15}>{children}</AnimatedSection>
      </div>
    </main>
  );
}
