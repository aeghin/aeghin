import { redirect } from "next/navigation";
import { currentUser } from "@/lib/services/user";
import { getUserMembershipCount } from "@/lib/services/organization";

// The global navbar lives on the /dashboard page itself; inside an
// organization the org layout's sidebar and top bar take its place.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {

    const user = await currentUser();

    if (!user) redirect("/sign-in");

    const membershipsCount = await getUserMembershipCount(user.id);

    if (membershipsCount < 1) redirect("/setup");

    return (
        <div className="min-h-screen bg-background">
            {children}
        </div>
    )
};
