import { Suspense } from "react";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { OrganizationsGrid } from "@/components/dashboard/organizations-grid";
import { OrganizationsGridSkeleton } from "@/components/dashboard/skeletons";

import { currentUser } from "@/lib/services/user";
import { redirect } from "next/navigation";

export default async function DashboardPage() {

  const user = await currentUser();

  if (!user) redirect("/sign-in");

  const { id, firstName } = user;

  return (
      <main className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="space-y-8">
          
          <DashboardHeader firstName={firstName} />

          <Suspense fallback={<OrganizationsGridSkeleton />}>
            <OrganizationsGrid userId={id} />
          </Suspense>

        </div>
      </main>
  )
}
