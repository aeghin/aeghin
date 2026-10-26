import { z } from "zod";
import { VolunteerRole } from "@/generated/prisma/enums";

export const proposeInvitesInputSchema = z.object({
  picks: z
    .array(
      z.object({
        person: z
          .string()
          .describe("Ref of somebody in WHO'S FREE for that role. Never a name."),
        role: z.enum(VolunteerRole),
        reason: z
          .string()
          .describe("One short sentence from their numbers: why this person, here."),
      }),
    )
    .min(1)
    .describe(
      "Who to invite into which open spot. One role per person, and no more people for a role than it has open spots.",
    ),
  note: z
    .string()
    .describe(
      "One short sentence at the top of the card, two at most, or empty. Only what the card can't show: why a spot is still open, a request you couldn't do, or whose team they're backing up. Never repeat who you picked or why: each pick's reason is on the card.",
    ),
});

export type ProposeInvitesInput = z.infer<typeof proposeInvitesInputSchema>;
