import { SongKeyManager } from "@/components/dashboard/song-keys/song-key-manager";
import { getUserSongKeys } from "@/lib/services/song-keys";
import { getOrganizationSongs } from "@/lib/services/songs";

interface SongKeysTabContentProps {
  organizationId: string;
  userId: string;
}

export const SongKeysTabContent = async ({
  organizationId,
  userId,
}: SongKeysTabContentProps) => {
  const [entries, catalog] = await Promise.all([
    getUserSongKeys(userId, organizationId),
    getOrganizationSongs(organizationId),
  ]);

  return (
    <SongKeyManager
      organizationId={organizationId}
      entries={entries}
      catalog={catalog}
    />
  );
};
