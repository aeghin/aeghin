import "server-only";

import prisma from "@/lib/prisma";
import { InvitationStatus } from "@/generated/prisma/enums";
import { cacheLife, cacheTag } from "next/cache";
import { getOrganizationTimeZone } from "@/lib/services/organization";
import { inZone } from "@/lib/time-zone";

import type {
  MemberProfileData,
  RangeStats,
  MemberSong,
} from "@/components/dashboard/member-profile/member-profile";

export const getMemberProfile = async (
  userId: string,
  organizationId: string,
): Promise<MemberProfileData | null> => {
  "use cache";

  cacheLife("hours");
  cacheTag(`user-${userId}-org-${organizationId}-role`);

  const membership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId,
      },
    },
    select: {
      role: true,
      volunteerRoles: true,
      createdAt: true,
      organization: { select: { name: true } },
      user: {
        select: {
          firstName: true,
          lastName: true,
          userImageUrl: true,
        },
      },
    },
  });

  return membership;
};


export const getMemberAcceptance = async (
  userId: string,
  organizationId: string,
  year?: number,
): Promise<RangeStats> => {
  "use cache";

  cacheLife("minutes");
  cacheTag(`org-${organizationId}-acceptance-stats`);

  // A year starts at midnight on Jan 1 at the church, not in UTC: `createdAt`
  // is a real moment, and UTC's new year begins at 6pm on Dec 31 in Chicago.
  let since: Date | undefined;

  if (year !== undefined) {
    cacheTag(`org-${organizationId}-details`);
    since = inZone(
      new Date(Date.UTC(year, 0, 1)),
      await getOrganizationTimeZone(organizationId),
    );
  }

  const grouped = await prisma.eventAssignment.groupBy({
    by: ["status"],
    where: {
      userId,
      organizationId,
      status: { in: [InvitationStatus.ACCEPTED, InvitationStatus.DECLINED] },
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    _count: { _all: true },
  });

  const countFor = (status: InvitationStatus) =>
    grouped.find((row) => row.status === status)?._count._all ?? 0;

  const accepted = countFor(InvitationStatus.ACCEPTED);
  const declined = countFor(InvitationStatus.DECLINED);

  return { invited: accepted + declined, accepted, declined };
};

// Top 5 songs this member has performed in the org, ranked by number of setlist
// assignments. Slow-moving, so cached for hours and busted when the member is
// (un)assigned to a setlist song. findMany + an in-memory tally is fine here —
// the fetch is amortized behind the cache.
export const getMemberTopSongs = async (
  userId: string,
  organizationId: string,
): Promise<MemberSong[]> => {
  "use cache";

  cacheLife("hours");
  cacheTag(`user-${userId}-songs-${organizationId}`);

  const assignments = await prisma.setlistSongAssignment.findMany({
    where: {
      userId,
      setlistSong: { event: { organizationId } },
    },
    select: {
      setlistSong: {
        select: {
          song: {
            select: { id: true, title: true, artist: true },
          },
        },
      },
    },
  });

  const tally = new Map<string, MemberSong>();
  for (const { setlistSong } of assignments) {
    const { id, title, artist } = setlistSong.song;
    const entry = tally.get(id) ?? { title, artist, count: 0 };
    entry.count += 1;
    tally.set(id, entry);
  }

  return [...tally.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
};
