import { z } from "zod/v4";
import { RoleCategory } from "@/generated/prisma/enums";

/** Who leads one team. Null clears it. */
export const teamLeadSchema = z.object({
  organizationId: z.uuid(),
  team: z.enum(RoleCategory),
  userId: z.uuid().nullable(),
});

/** One person on or off one team's "Also notify". */
export const teamWatcherSchema = z.object({
  organizationId: z.uuid(),
  team: z.enum(RoleCategory),
  userId: z.uuid(),
  watching: z.boolean(),
});

/** The caller watching one event, or not. */
export const eventWatchSchema = z.object({
  organizationId: z.uuid(),
  eventId: z.uuid(),
  watching: z.boolean(),
});

export type TeamLeadInput = z.infer<typeof teamLeadSchema>;
export type TeamWatcherInput = z.infer<typeof teamWatcherSchema>;
export type EventWatchInput = z.infer<typeof eventWatchSchema>;
