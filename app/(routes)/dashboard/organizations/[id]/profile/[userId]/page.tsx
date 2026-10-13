import { notFound } from "next/navigation";
import { Suspense } from "react";

import MemberProfile from "@/components/dashboard/member-profile/member-profile";
import { MemberProfileSkeleton } from "@/components/dashboard/member-profile/member-profile-skeleton";

import {
  getMemberProfile,
  getMemberAcceptance,
  getMemberTopSongs,
} from "@/lib/services/member";
import { getOrganizationTimeZone } from "@/lib/services/organization";
import { floatingNow } from "@/lib/time-zone";

const MemberProfilePage = ({ params }: { params: Promise<{ id: string; userId: string }> }) => {
  return (
    <Suspense fallback={<MemberProfileSkeleton />}>
      <MemberProfileContent params={params} />
    </Suspense>
  );
};

const MemberProfileContent = async ({
  params,
}: {
  params: Promise<{ id: string; userId: string }>;
}) => {
  const { id: orgId, userId } = await params;

  const [membership, timeZone] = await Promise.all([
    getMemberProfile(userId, orgId),
    getOrganizationTimeZone(orgId),
  ]);

  if (!membership) notFound();

  // This year at the church: on New Year's Eve evening, UTC is already next year.
  const currentYear = floatingNow(timeZone).getUTCFullYear();
  const [all, year, songs] = await Promise.all([
    getMemberAcceptance(userId, orgId),
    getMemberAcceptance(userId, orgId, currentYear),
    getMemberTopSongs(userId, orgId),
  ]);

  return (
    <MemberProfile
      membership={membership}
      stats={{ all, year }}
      songs={songs}
      timeZone={timeZone}
    />
  );
};

export default MemberProfilePage;
