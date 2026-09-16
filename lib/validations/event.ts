import { z } from "zod/v4";
import { VolunteerRole } from "@/generated/prisma/enums";

/**
 * The optional rehearsal block: a day plus wall-clock times, all three filled
 * or all three blank. Loose strings on purpose — the same round trip dayTimes
 * makes, where the form holds "YYYY-MM-DD" and "HH:mm" and the submit handler
 * swaps in composed ISO strings before the action sees them.
 */
export const rehearsalSchema = z.object({
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
});

export type RehearsalFormValue = z.infer<typeof rehearsalSchema>;

export const EMPTY_REHEARSAL: RehearsalFormValue = {
  date: "",
  startTime: "",
  endTime: "",
};

/**
 * All three blank is how "no rehearsal" arrives from the form, so it passes.
 * Anything half-filled is flagged on the field that is actually missing.
 */
const refineRehearsal = (
  rehearsal: RehearsalFormValue | undefined,
  ctx: z.RefinementCtx,
) => {
  if (!rehearsal) return;

  const { date, startTime, endTime } = rehearsal;

  if (!date && !startTime && !endTime) return;

  if (!date) {
    ctx.addIssue({
      code: "custom",
      path: ["rehearsal", "date"],
      message: "Rehearsal date is required",
    });
  }

  if (!startTime) {
    ctx.addIssue({
      code: "custom",
      path: ["rehearsal", "startTime"],
      message: "Rehearsal start time is required",
    });
  }

  if (!endTime) {
    ctx.addIssue({
      code: "custom",
      path: ["rehearsal", "endTime"],
      message: "Rehearsal end time is required",
    });
  }

  if (startTime && endTime && endTime <= startTime) {
    ctx.addIssue({
      code: "custom",
      path: ["rehearsal", "endTime"],
      message: "End time must be after the start time",
    });
  }
};

// Split out from createEventSchema so the refined form schema and the refined
// action schema can both derive from it — .extend() is only on the plain object.
const createEventBaseSchema = z.object({
  serviceTypeId: z.string().min(1, "Service type is required"),
  name: z.string().trim().min(1, "Event name is required").max(25, "Event name must be 25 characters or less"),
  description: z.string().trim().optional(),
  dateRange: z.object({
    from: z.date({ message: "Start date is required" }),
    to: z.date().optional(),
  }),
  dayTimes: z.record(
    z.string(),
    z.object({
      startTime: z.string().min(1, "Start time is required"),
      endTime: z.string().min(1, "End time is required"),
    })
  ),
  location: z.string().trim().min(1, "Location is required").max(20, "Location must be 20 characters or less"),
  rolesNeeded: z.array(z.enum(VolunteerRole)).min(1, "Select at least one role"),
  expiresAt: z.number().refine((v) => [3, 5, 7].includes(v)),
  smartSchedulingEnabled: z.boolean(),
  rehearsal: rehearsalSchema.optional(),
});

export const createEventSchema = createEventBaseSchema.superRefine((data, ctx) =>
  refineRehearsal(data.rehearsal, ctx),
);

export type CreateEventFormData = z.infer<typeof createEventSchema>


export const createEventInputSchema = createEventBaseSchema
  .extend({
    roleAssignments: z.record(z.enum(VolunteerRole), z.array(z.string()).default([])),
  })
  .superRefine((data, ctx) => refineRehearsal(data.rehearsal, ctx));

export type CreateEventInput = z.infer<typeof createEventInputSchema>;


export const addEventRolesSchema = z.object({
  roles: z.array(z.enum(VolunteerRole)).min(1, "Select at least one role"),
});

export type AddEventRolesInput = z.infer<typeof addEventRolesSchema>;


export const removeEventRoleSchema = z.object({
  role: z.enum(VolunteerRole),
});

export type RemoveEventRoleInput = z.infer<typeof removeEventRoleSchema>;


export const inviteToEventSchema = z.object({
  role: z.enum(VolunteerRole),
  userIds: z.array(z.string()).min(1, "Select at least one member"),
  expiresAt: z.number().refine((v) => [3, 5, 7].includes(v)),
});

export type InviteToEventInput = z.infer<typeof inviteToEventSchema>;


export const editEventDetailsSchema = z.object({
  eventId: z.uuid(),
  organizationId: z.uuid(),
  name: z.string().trim().min(1, "Event name is required").max(25, "Event name must be 25 characters or less"),
  description: z.string().trim().optional(),
  dateRange: z.object({
    from: z.date({ message: "Start date is required" }),
    to: z.date().optional(),
  }),
  dayTimes: z.record(
    z.string(),
    z.object({
      startTime: z.string().min(1, "Start time is required"),
      endTime: z.string().min(1, "End time is required"),
    })
  ),
  location: z.string().trim().min(1, "Location is required").max(20, "Location must be 20 characters or less"),
  rehearsal: rehearsalSchema.optional(),
}).superRefine((data, ctx) => {
  refineRehearsal(data.rehearsal, ctx);

  for (const [day, times] of Object.entries(data.dayTimes)) {
    if (!times.startTime || !times.endTime) continue;

    if (times.endTime <= times.startTime) {
      ctx.addIssue({
        code: "custom",
        path: ["dayTimes", day, "endTime"],
        message: "End time must be after the start time",
      });
    }
  }
});

export type EditEventDetailsInput = z.infer<typeof editEventDetailsSchema>;