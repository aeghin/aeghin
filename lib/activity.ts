import "server-only";

import prisma from "@/lib/prisma";
import { ActivityType, OrgRole } from "@/generated/prisma/enums";

export const orgRoleLabels: Record<OrgRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
};

type LogActivityInput = {
  organizationId: string;
  type: ActivityType;
  eventId?: string;
  // Pass this whenever eventId is passed — eventId is nulled when the event is
  // deleted, so the snapshot is what keeps the row readable afterwards.
  eventName?: string;
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
