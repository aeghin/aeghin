import { redirect } from "next/navigation";
import { currentUser } from "@/lib/services/user";
import { getUserMembershipCount } from "@/lib/services/organization";

export default async function SetupLayout({ children }: { children: React.ReactNode }) {

    const user = await currentUser();

    // No row yet — user.created is still in flight. Render setup rather than
    // bouncing, so a fresh signup never lands in a redirect loop.
    if (!user) return <>{children}</>;

    const membershipsCount = await getUserMembershipCount(user.id);

    if (membershipsCount > 0) redirect("/dashboard");

    return <>{children}</>;
};
