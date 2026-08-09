import { z } from "zod/v4";
import { VolunteerRole } from "@/generated/prisma/enums";

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// Name/location limits match createEventSchema so a prefilled event form
// built from a template always passes event validation.
export const eventTemplateSchema = z.object({
    organizationId: z.uuid(),
    serviceTypeId: z.string().min(1, "Service type is required"),
    name: z.string().trim().min(1, "Template name is required").max(25, "Template name must be 25 characters or less"),
    description: z.string().trim().optional(),
    location: z.string().trim().min(1, "Location is required").max(20, "Location must be 20 characters or less"),
    dayOfWeek: z.number().int().min(0, "Pick a day").max(6, "Pick a day"),
    // Consecutive days starting on dayOfWeek (array index = day offset) —
    // the create-event form only supports contiguous date ranges.
    days: z.array(z.object({
        startTime: z.string().regex(TIME_HHMM, "Start time is required"),
        endTime: z.string().regex(TIME_HHMM, "End time is required"),
    })).min(1, "Add at least one day").max(7, "A template can span at most 7 days"),
    rolesNeeded: z.array(z.enum(VolunteerRole)).min(1, "Select at least one role"),
    expiresInDays: z.number().refine((v) => [3, 5, 7].includes(v)),
    smartSchedulingEnabled: z.boolean(),
});

export type EventTemplateInput = z.infer<typeof eventTemplateSchema>;
