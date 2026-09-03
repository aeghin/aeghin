import type {
  InvitationStatus,
  KeyQuality,
  Pitch,
  VolunteerRole,
} from "@/generated/prisma/enums";

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
}

export type EventDetailsSetlistSong = {
  id: string
  eventId: string
  songId: string
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
    attachments: SongAttachment[]
  }
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
}

export type SongAttachment = {
  id: string
  name: string
  url: string
  key: string
  type: string
  size: number
  songId: string
  createdAt: Date
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
  expiresInDays: number
  smartSchedulingEnabled: boolean
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
