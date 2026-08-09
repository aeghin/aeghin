import "server-only";

import prisma from "@/lib/prisma";
import { ActivityType, OrgRole, VolunteerRole } from "@/generated/prisma/enums";

export const volunteerRoleLabels: Record<VolunteerRole, string> = {
  GUITARIST: "Guitarist",
  PIANIST: "Pianist",
  AUX_KEYS: "Aux Keys",
  DRUMMER: "Drummer",
  LEAD_VOCALIST: "Lead Vocalist",
  BGVS: "BGVs",
  BASSIST: "Bassist",
  SOUND_TECH: "Sound Tech",
  STREAM_TECH: "Stream Tech",
  PROJECTION_TECH: "Projection",
  USHER: "Usher",
  GREETER: "Greeter",
};

export const orgRoleLabels: Record<OrgRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
};

type LogActivityInput = {
  organizationId: string;
  type: ActivityType;
  eventId?: string;
  actorName?: string;
  targetName?: string;
  detail?: string;
};

// Best-effort: the feed is a byproduct of a mutation that already succeeded,
// so a logging failure must never surface as an error to the caller.
export const logActivity = async (input: LogActivityInput) => {
  try {
    await prisma.activityLog.create({ data: input });
  } catch (err) {
    console.error("Failed to record activity", err);
  }
};
