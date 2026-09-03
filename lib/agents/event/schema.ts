import { z } from "zod";
import { VolunteerRole } from "@/generated/prisma/enums";

/**
 * Event times are stored as floating wall-clock — the create-event form builds
 * `new Date(`${date}T${startTime}:00Z`)` and everything downstream renders with
 * timeZone: "UTC". So the model hands back calendar dates and clock times, never
 * an instant and never an offset. The route does the one composition to UTC.
 */
const dayShape = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
    .describe("Calendar date, YYYY-MM-DD. No timezone, no offset."),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:mm.")
    .describe('Local clock start, 24-hour HH:mm — e.g. "09:00".'),
  endTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:mm.")
    .describe('Local clock end, 24-hour HH:mm — e.g. "11:00".'),
});

export const checkAvailabilityInputSchema = z.object({
  days: z
    .array(dayShape)
    .min(1)
    .max(14)
    .describe("The candidate day(s) for the event."),
  roles: z
    .array(z.enum(VolunteerRole))
    .min(1)
    .describe("Which volunteer roles to pull candidates for."),
});

export type CheckAvailabilityInput = z.infer<typeof checkAvailabilityInputSchema>;

export const proposeEventInputSchema = z.object({
  serviceTypeId: z
    .string()
    .describe("Exact id of a service type from the list in your instructions."),
  name: z
    .string()
    .trim()
    .min(1)
    .max(25)
    .describe("Event name. Hard limit: 25 characters."),
  description: z.string().trim().max(500).default(""),
  location: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .describe("Where it happens. Hard limit: 20 characters."),
  days: z
    .array(dayShape)
    .min(1)
    .max(14)
    .describe(
      "One entry per event day. Days must be consecutive calendar dates.",
    ),
  rolesNeeded: z
    .array(z.enum(VolunteerRole))
    .min(1)
    .describe("Every role this event calls for, filled or not."),
  assignments: z
    .array(
      z.object({
        userId: z
          .string()
          .describe("Exact userId from the roster. Never a name."),
        role: z.enum(VolunteerRole),
        reason: z
          .string()
          .describe("One short sentence: why this person for this slot."),
      }),
    )
    .default([])
    .describe(
      "Who fills what. A person may appear at most once — one role each.",
    ),
  expiresInDays: z
    .union([z.literal(3), z.literal(5), z.literal(7)])
    .describe("Invitation deadline. Only 3, 5, or 7 are accepted."),
  smartSchedulingEnabled: z
    .boolean()
    .describe("Auto-invite the next best member when someone declines."),
  summary: z
    .string()
    .describe("Two or three sentences on the plan and any gaps you left."),
});

export type ProposeEventInput = z.infer<typeof proposeEventInputSchema>;
