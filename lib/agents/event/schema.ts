import { z } from "zod";
import { RoleCategory, VolunteerRole } from "@/generated/prisma/enums";

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
    .describe(
      "The candidate day(s) for the EVENT ITSELF. Never include a rehearsal here: a rehearsal makes nobody unavailable, and passing one would wrongly exclude people who are free for the event.",
    ),
  roles: z
    .array(z.enum(VolunteerRole))
    .min(1)
    .describe("Which volunteer roles to check."),
});

export type CheckAvailabilityInput = z.infer<typeof checkAvailabilityInputSchema>;

export const proposeEventInputSchema = z.object({
  serviceType: z
    .string()
    .describe("Ref of a service type from the list in your instructions."),
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
  roleSpots: z
    .partialRecord(z.enum(VolunteerRole), z.number().int().min(2).max(20))
    .optional()
    .describe(
      'How many people a role needs, only for roles needing more than one: {"BGVS": 3}. A role left out needs one.',
    ),
  assignments: z
    .array(
      z.object({
        person: z
          .string()
          .describe("Ref of a member from the member list. Never a name."),
        role: z.enum(VolunteerRole),
        reason: z
          .string()
          .describe("One short sentence from their numbers: why this person, here."),
      }),
    )
    .default([])
    .describe(
      "Who fills what, on every team except one they asked to leave to its lead. A person may appear at most once — one role each.",
    ),
  covers: z
    .array(
      z.object({
        team: z.enum(RoleCategory),
        person: z.string().describe("Ref of an admin or owner from the member list."),
      }),
    )
    .max(Object.values(RoleCategory).length)
    .default([])
    .describe(
      "Teams handed to somebody for this event only — the person drafting, or another admin or owner. Leave empty unless they asked.",
    ),
  expiresInDays: z
    .union([z.literal(3), z.literal(5), z.literal(7)])
    .describe("Invitation deadline. Only 3, 5, or 7 are accepted."),
  smartSchedulingEnabled: z
    .boolean()
    .describe("Auto-invite the next best member when someone declines."),
  rehearsal: dayShape
    .nullish()
    .describe(
      "Optional single rehearsal block. Omit it unless they asked for one or a template you used carries one. On or before the event's last day, never in the past. Informational only — it does not affect anyone's availability.",
    ),
  summary: z
    .string()
    .describe(
      "One or two short sentences at the top of the card, or empty. Only what the card can't show: why a spot is still open, something they asked for that the draft couldn't do, or a service type that may not fit. Never mention dates, days, times, the place, the rehearsal, settings, who's in charge of a team or who's told, or why you picked someone: the card shows all of that.",
    ),
});

export type ProposeEventInput = z.infer<typeof proposeEventInputSchema>;
