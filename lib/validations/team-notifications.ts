import { z } from "zod/v4";
import { RoleCategory } from "@/generated/prisma/enums";

/** Who leads one team on one service type. Null clears it. */
export const teamLeadSchema = z.object({
  organizationId: z.uuid(),
  serviceTypeId: z.uuid(),
  team: z.enum(RoleCategory),
  userId: z.uuid().nullable(),
});

/** One person on or off one team's "Also notify", for one service type. */
export const teamWatcherSchema = z.object({
  organizationId: z.uuid(),
  serviceTypeId: z.uuid(),
  team: z.enum(RoleCategory),
  userId: z.uuid(),
  watching: z.boolean(),
});

export type TeamLeadInput = z.infer<typeof teamLeadSchema>;
export type TeamWatcherInput = z.infer<typeof teamWatcherSchema>;
