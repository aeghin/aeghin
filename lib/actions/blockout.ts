"use server";

import prisma from "@/lib/prisma";
import { revalidatePath, updateTag } from "next/cache";

import { currentUser } from "@/lib/services/user";
import {
  CreateBlockoutInput,
  createBlockoutSchema,
} from "@/lib/validations/blockout";

/**
 * How a caller expires cache tags. `updateTag` throws inside a Route Handler,
 * so the mobile routes pass `revalidateTag`; every web call site keeps the
 * default. Not exported: a "use server" module may only export async functions.
 */
type TagInvalidator = (tag: string) => void;


type ActionResponse = { success: true } | { success: false; error: string };

export const createBlockoutDate = async (
  input: CreateBlockoutInput,
  touch: TagInvalidator = updateTag,
): Promise<ActionResponse> => {
  try {
    const user = await currentUser();

    if (!user) return { success: false, error: "Unauthorized" };

    const parsed = createBlockoutSchema.safeParse(input);

    if (!parsed.success) {
      return { success: false, error: "Invalid blockout dates" };
    }

    const { organizationId, startDate, endDate } = parsed.data;

    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId,
        },
      },
      select: { id: true },
    });

    if (!membership) {
      return { success: false, error: "Unable to locate membership" };
    }

    await prisma.blockoutDate.create({
      data: {
        userId: user.id,
        organizationId,
        startDate: new Date(`${startDate}T00:00:00Z`),
        endDate: new Date(`${endDate}T00:00:00Z`),
      },
    });

    touch(`user-${user.id}-blockouts-${organizationId}`);
    revalidatePath(`/dashboard/organizations/${organizationId}`);

    return { success: true };
  } catch {
    return { success: false, error: "Unable to add blockout. Try again." };
  }
};

export const deleteBlockoutDate = async (
  blockoutId: string,
  organizationId: string,
  touch: TagInvalidator = updateTag,
): Promise<ActionResponse> => {
  try {
    const user = await currentUser();

    if (!user) return { success: false, error: "Unauthorized" };

    if (!blockoutId || !organizationId) {
      return { success: false, error: "No data provided" };
    }

    const deleted = await prisma.blockoutDate.deleteMany({
      where: {
        id: blockoutId,
        userId: user.id,
        organizationId,
      },
    });

    if (deleted.count === 0) {
      return { success: false, error: "Unable to locate blockout" };
    }

    touch(`user-${user.id}-blockouts-${organizationId}`);
    revalidatePath(`/dashboard/organizations/${organizationId}`);

    return { success: true };
  } catch {
    return { success: false, error: "Unable to remove blockout. Try again." };
  }
};
