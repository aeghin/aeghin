import { z } from "zod/v4";
import { VolunteerRole, VoiceType } from "@/generated/prisma/enums";

export const orgInvitationSchema = z.object({
    email: z.email("Invalid email address").trim().toLowerCase(),
    volunteerRoles: z.array(z.enum(VolunteerRole, "Invalid role selected")).min(1, "Select at least one role"),
    // Optional, and only kept with a role that sings. The phone doesn't send it yet.
    voiceType: z.enum(VoiceType, "Invalid voice type selected").nullable().optional(),
    orgId: z.uuid("Invalid organization ID"),
});

export type OrgInvitationInput = z.infer<typeof orgInvitationSchema>;