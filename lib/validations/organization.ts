import { z } from "zod/v4";

export const organizationSchema = z.object({
  name: z.string().min(3, "Organization name must be at least 3 characters long").max(20, "Organization name must be at most 20 characters long").trim(),
  description: z.string().max(100, "Description must be at most 100 characters long").trim(),
  // An IANA zone, checked by the actions against the server's own Intl rather
  // than here: on create one nobody chose is ignored, never a failed form; on
  // edit an unknown one is refused with a message. Optional so a phone app from
  // before zones still creates and edits.
  timeZone: z.string().optional(),
});

export type OrganizationInput = z.infer<typeof organizationSchema>;

export const organizationLogoSchema = z.object({
  url: z.url("Logo URL required"),
  key: z.string().min(1, "File key required"),
});

export type OrganizationLogoInput = z.infer<typeof organizationLogoSchema>;

