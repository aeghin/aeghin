import { z } from "zod/v4";
import { VolunteerRole } from "@/generated/prisma/enums";

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// Name/location limits match createEventSchema so a prefilled event form
// built from a template always passes event validation.
/**
 * A template's optional rehearsal. `dayOffset` is relative to the template's
 * first day, matching EventTemplateDay: 0 is that same day and negatives run
 * before it, which is the normal case — Thursday rehearsal, Sunday service.
 */
export const templateRehearsalSchema = z.object({
    dayOffset: z.number().int().min(-7, "Pick when the rehearsal happens").max(0, "Pick when the rehearsal happens"),
    startTime: z.string().regex(TIME_HHMM, "Start time is required"),
    endTime: z.string().regex(TIME_HHMM, "End time is required"),
});

export type TemplateRehearsalInput = z.infer<typeof templateRehearsalSchema>;

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
    // null is "this template has no rehearsal". undefined is "don't touch it",
    // which is how the mobile routes' partial bodies reach updateEventTemplate.
    rehearsal: templateRehearsalSchema.nullable().optional(),
}).superRefine((data, ctx) => {
    if (!data.rehearsal) return;

    const { startTime, endTime } = data.rehearsal;

    if (startTime && endTime && endTime <= startTime) {
        ctx.addIssue({
            code: "custom",
            path: ["rehearsal", "endTime"],
            message: "End time must be after the start time",
        });
    }
});

export type EventTemplateInput = z.infer<typeof eventTemplateSchema>;
