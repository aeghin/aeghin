import type {
  InvitationStatus,
  KeyQuality,
  NotificationCategory,
  Pitch,
  RoleCategory,
  VolunteerRole,
} from "@/generated/prisma/enums";
import type { PaidPlan } from "@/lib/config/plans";
import type { RoleSpots } from "@/lib/role-spots";

export type EventDetailsAssignment = {
  id: string
  eventId: string
  userId: string
  assignedById: string | null
  organizationId: string
  role: VolunteerRole
  status: InvitationStatus
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
  user: {
    firstName: string
    lastName: string
    userImageUrl: string | null
  }
  /** Who sent the invitation. Null once they have left the organization. */
  assignedBy: {
    firstName: string
    lastName: string
  } | null
}

export type EventDetailsSetlistSong = {
  id: string
  eventId: string
  songId: string
  /** The arrangement this event plays. Null is the Original. */
  arrangementId: string | null
  position: number
  pitch: Pitch
  keyQuality: KeyQuality
  bpm: number
  timeSignature: string
  createdAt: Date
  updatedAt: Date
  song: {
    id: string
    title: string
    artist: string
    youtubeUrl: string | null
    spotifyUrl: string | null
    /** Every arrangement's files as well as the Original's. A row shows only its own. */
    attachments: SongAttachment[]
  }
  /** The picked arrangement's name and links. Null for the Original. */
  arrangement: {
    name: string
    useSongLinks: boolean
    spotifyUrl: string | null
    youtubeUrl: string | null
  } | null
  setlistSongAssignment: {
    userId: string
    user: {
      firstName: string
      lastName: string
      userImageUrl: string | null
    }
  }[]
}

export type SetlistSong = {
  id: string
  songId: string
  /**
   * The arrangement this event plays, or null for the Original. Absent keeps
   * the saved one, which is what phone builds from before arrangements send.
   */
  arrangementId?: string | null
  /** Its name, for the row's label. Null for the Original. */
  arrangementName?: string | null
  position: number
  pitch: Pitch
  keyQuality: KeyQuality
  bpm: number
  timeSignature: string
  title: string
  artist: string
  youtubeUrl: string | null
  spotifyUrl: string | null
  attachments?: SongAttachment[]
}

export type EventDetails = {
  id: string
  name: string
  description: string
  location: string
  rolesNeeded: VolunteerRole[]
  /** How many each role needs, for the roles needing more than one. */
  roleSpots: RoleSpots
  smartSchedulingEnabled: boolean
  createdAt: Date
  updatedAt: Date
  createdById: string | null
  serviceTypeId: string
  organizationId: string
  organization: {
    name: string
  }
  dates: {
    id: string
    eventId: string
    startTime: Date
    endTime: Date
  }[]
  serviceType: {
    id: string
    name: string
    color: string
    organizationId: string
    createdAt: Date
    updatedAt: Date
  }
  assignments: EventDetailsAssignment[]
  /** Who handles a team on this event only, in place of the service type's lead. */
  teamLeads: {
    category: RoleCategory
    userId: string
  }[]
  setlistSongs: EventDetailsSetlistSong[]
}

export type LibrarySong = {
  id: string
  title: string
  artist: string
  bpm: number
  timeSignature: string
  defaultPitch: Pitch
  defaultKeyQuality: KeyQuality
  spotifyUrl: string | null
  youtubeUrl: string | null
  themes: string[]
  attachments: SongAttachment[]
  /** Its other versions, oldest first. The Original isn't one of them. */
  arrangements: SongArrangement[]
}

/** A named version of a library song, picked per event on a setlist. */
export type SongArrangement = {
  id: string
  name: string
  /** On: a setlist shows the song's links. Off: the two below, if any. */
  useSongLinks: boolean
  spotifyUrl: string | null
  youtubeUrl: string | null
}

export type SongAttachment = {
  id: string
  name: string
  url: string
  key: string
  type: string
  size: number
  songId: string
  /** The arrangement it belongs to. Null is the Original's. */
  arrangementId: string | null
  createdAt: Date
}

/** A library's storage for charts and audio, as the song screens show it. */
export type StorageUsage = {
  used: number
  limit: number
  /** The plan with more room, or null on Pro. */
  nextPlan: PaidPlan | null
  canUpgrade: boolean
}

export type EventTemplateDay = {
  dayOffset: number
  startTime: string
  endTime: string
}

export type EventTemplateWithServiceType = {
  id: string
  name: string
  description: string
  location: string
  dayOfWeek: number
  days: EventTemplateDay[]
  rolesNeeded: VolunteerRole[]
  roleSpots: RoleSpots
  expiresInDays: number
  smartSchedulingEnabled: boolean
  /** Offset from the first day: 0 same day, negative before. Null = no rehearsal. */
  rehearsalDayOffset: number | null
  rehearsalStartTime: string | null
  rehearsalEndTime: string | null
  serviceTypeId: string
  serviceType: {
    id: string
    name: string
    color: string
  }
}


/**
 * Per-role scheduling picture for a set of candidate event days. Produced by
 * `getEligibilityByRole` and handed to the event-draft agent as tool output, so
 * this lives here rather than in the service — the agent module must stay free
 * of `server-only` imports.
 */
export type RoleCandidate = {
  userId: string
  name: string
  /** Laplace-smoothed acceptance rate, 0–1. No-history members sit at 0.5. */
  reliability: number
  /** Accepted + declined invitations this member has actually answered. */
  responded: number
  /** Accepted assignments whose event fell inside the recent window. */
  recentServes: number
  /** Date-only (YYYY-MM-DD) of their most recent served event, or null. */
  lastServedOn: string | null
}

export type RoleExclusion = {
  userId: string
  name: string
  reason: "conflict" | "blockout"
  /** Human-readable cause: the clashing event's name, or the blockout range. */
  detail: string
}

export type RoleEligibility = {
  role: VolunteerRole
  /** Ranked best-first, capped. `totalQualified` reports the untruncated size. */
  eligible: RoleCandidate[]
  excluded: RoleExclusion[]
  totalQualified: number
}

export type SongKeyEntry = {
  id: string
  organizationId: string
  /** Null when the song isn't in the library, or its row was hard-deleted. */
  songId: string | null
  /** Snapshot. Prefer `song.title` for display while the link is live. */
  title: string
  artist: string
  pitch: Pitch
  keyQuality: KeyQuality
  notes: string | null
  updatedAt: Date
  song: {
    title: string
    artist: string
    defaultPitch: Pitch
    defaultKeyQuality: KeyQuality
    spotifyUrl: string | null
    youtubeUrl: string | null
    /** The library song's themes, for My keys' search and Theme filter. */
    themes: string[]
  } | null
}

/**
 * One bell row. Carries a count and nothing else on purpose — no role labels,
 * no names, no "who declined". The app is one tap away and always right; a
 * notification that repeats detail is a notification that can contradict it.
 */
export type NotificationItem = {
  id: string
  category: NotificationCategory
  count: number
  unread: boolean
  eventId: string
  eventName: string
  organizationId: string
  organizationName: string
  updatedAt: Date
}

export type NotificationFeed = {
  items: NotificationItem[]
  unreadCount: number
}

/**
 * An invitation to join an organization, in the invitee's bell. Not a
 * `Notification` row: the invitation itself is the record, so it leaves the
 * bell the moment it is answered, withdrawn or lapses.
 */
export type InvitationNotice = {
  id: string
  token: string
  organizationName: string
  invitedByName: string
  unread: boolean
  createdAt: Date
}
