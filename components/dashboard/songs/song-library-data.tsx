import { notFound, redirect } from "next/navigation";
import { SongLibrary } from "@/components/dashboard/songs/song-library";

import { currentUser } from "@/lib/services/user";
import { getOrganizationDetailsById } from "@/lib/services/organization";
import { getOrganizationSongs } from "@/lib/services/songs";
import { getOrgPlan } from "@/lib/billing/entitlements";
import { PLAN_LIMITS } from "@/lib/config/plans";
import { OrgRole } from "@/generated/prisma/enums";


export async function SongLibraryData({ orgId }: { orgId: string }) {

    const user = await currentUser();

    if (!user) redirect("/sign-in");

    const [org, songs, plan] = await Promise.all([
        getOrganizationDetailsById(orgId, user.id),
        getOrganizationSongs(orgId),
        getOrgPlan(orgId),
    ]);

    if (!org) notFound();

    const currentUserRole = org.memberships[0].role;

    const canManage = currentUserRole === OrgRole.OWNER || currentUserRole === OrgRole.ADMIN;

    return (
        <SongLibrary
            songs={songs}
            orgId={orgId}
            orgName={org.name}
            canManage={canManage}
            songLimit={PLAN_LIMITS[plan].songs}
            canUpgrade={currentUserRole === OrgRole.OWNER}
        />
    )
}
