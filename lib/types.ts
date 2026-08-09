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
