"use client";

import { useOptimistic, useTransition } from "react";
import { Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { colorClasses } from "@/lib/config/service-types-config";
import { volunteerRoleConfig } from "@/lib/config/roles";
import {
  assignSongVocalist,
  unassignSongVocalist,
} from "@/lib/actions/song-setlist";
import type { VolunteerRole } from "@/generated/prisma/enums";

export type VocalistCandidate = {
  userId: string;
  firstName: string;
  lastName: string;
  userImageUrl: string | null;
  role: VolunteerRole; // one that sings
};

export type AssignedVocalist = {
  userId: string;
  firstName: string;
  lastName: string;
  userImageUrl: string | null;
};

interface SongVocalistAssignProps {
  setlistSongId: string;
  /** Vocalists currently assigned to this song. */
  assigned: AssignedVocalist[];
  /** Accepted singers for the event — the pickable pool. */
  candidates: VocalistCandidate[];
  /** Only managers get the ⊕ trigger; everyone sees the avatar stack. */
  canManage: boolean;
  serviceColor: string;
}

export function SongVocalistAssign({
  setlistSongId,
  assigned,
  candidates,
  canManage,
  serviceColor,
}: SongVocalistAssignProps) {
  const serviceColors = colorClasses[serviceColor];
  const [isPending, startTransition] = useTransition();

  // Base = server truth; optimistic changes apply only while an action is in
  // flight, then React reconciles back to the revalidated `assigned` prop.
  const [optimisticIds, setOptimistic] = useOptimistic(
    new Set(assigned.map((a) => a.userId)),
    (current, change: { userId: string; assign: boolean }) => {
      const next = new Set(current);
      if (change.assign) next.add(change.userId);
      else next.delete(change.userId);
      return next;
    },
  );

  // Lookup for the stack — assigned users plus candidates, so we can still show
  // an avatar for someone assigned who is no longer an accepted candidate
  // (e.g. they declined the event after being assigned).
  const displayById = new Map<string, AssignedVocalist>();
  for (const a of assigned) displayById.set(a.userId, a);
  for (const c of candidates) if (!displayById.has(c.userId)) displayById.set(c.userId, c);

  const stack = [...optimisticIds]
    .map((id) => displayById.get(id))
    .filter((v): v is AssignedVocalist => Boolean(v));

  const toggle = (userId: string) => {
    const isAssigned = optimisticIds.has(userId);

    startTransition(async () => {
      // Optimistic flip (must run inside the transition). On failure we just
      // toast — the base prop is unchanged, so the optimistic value is dropped
      // and the UI reverts automatically when the transition settles.
      setOptimistic({ userId, assign: !isAssigned });

      const result = isAssigned
        ? await unassignSongVocalist(setlistSongId, userId)
        : await assignSongVocalist(setlistSongId, userId);

      if (!result.success) {
        toast.error(result.error, { position: "top-center" });
      }
    });
  };

  return (
    <div className="flex shrink-0 items-center">
      {stack.length > 0 && (
        <div className="flex -space-x-2">
          {stack.map((v) => (
            <Avatar
              key={v.userId}
              className="h-6 w-6 ring-2 ring-background"
              title={`${v.firstName} ${v.lastName}`}
            >
              <AvatarImage
                src={v.userImageUrl ?? undefined}
                alt={`${v.firstName} ${v.lastName}`}
              />
              <AvatarFallback className="text-[9px] font-medium">
                {v.firstName.charAt(0)}
              </AvatarFallback>
            </Avatar>
          ))}
        </div>
      )}

      {canManage && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Assign vocalists"
              className={cn(
                "h-6 w-6 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground",
                stack.length > 0 && "ml-1.5",
              )}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-60 p-0">
            <div className="border-b px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Assign vocalists
              </p>
            </div>
            {candidates.length > 0 ? (
              <ScrollArea className="max-h-64">
                <div className="p-1">
                  {candidates.map((c) => {
                    const isAssigned = optimisticIds.has(c.userId);
                    return (
                      <button
                        key={c.userId}
                        type="button"
                        disabled={isPending}
                        onClick={() => toggle(c.userId)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/60 disabled:opacity-60"
                      >
                        <Avatar className="h-7 w-7">
                          <AvatarImage
                            src={c.userImageUrl ?? undefined}
                            alt={`${c.firstName} ${c.lastName}`}
                          />
                          <AvatarFallback className="text-[10px] font-medium">
                            {c.firstName.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium leading-tight">
                            {c.firstName} {c.lastName}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {volunteerRoleConfig[c.role].label}
                          </p>
                        </div>
                        <span
                          aria-hidden
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                            isAssigned
                              ? cn(
                                  serviceColors.borderSolid,
                                  serviceColors.solid,
                                  "text-primary-foreground",
                                )
                              : "border-border",
                          )}
                        >
                          {isAssigned && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            ) : (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                No accepted vocalists to assign yet.
              </p>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
