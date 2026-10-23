/** A song's or an arrangement's Spotify and YouTube links. */
export type VersionLinks = {
  spotifyUrl: string | null
  youtubeUrl: string | null
}

/** An arrangement's own links, and whether it shows the song's instead. */
export type ArrangementLinks = VersionLinks & {
  useSongLinks: boolean
}

/**
 * The links a setlist shows for the version it plays. The Original, and an
 * arrangement set to use the song's links, show the song's: read each time, so
 * changing them changes every setlist. Any other arrangement shows only its
 * own, which may be none, leaving just its files. Never a mix.
 */
export const versionLinks = (song: VersionLinks, arrangement: ArrangementLinks | null): VersionLinks =>
  arrangement && !arrangement.useSongLinks
    ? { spotifyUrl: arrangement.spotifyUrl, youtubeUrl: arrangement.youtubeUrl }
    : { spotifyUrl: song.spotifyUrl, youtubeUrl: song.youtubeUrl };
