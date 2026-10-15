import { cn } from "@/lib/utils";
import { PITCH_LABELS } from "@/lib/constants/key";
import type { KeyQuality, Pitch } from "@/generated/prisma/enums";

/**
 * Your key, set the way an event card sets its date: a tinted tile leading
 * the row, because it is the answer the list is opened for. As on the phone.
 */
export function KeyTile({
  pitch,
  quality,
  className,
}: {
  pitch: Pitch;
  quality: KeyQuality;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex size-13 shrink-0 flex-col items-center justify-center rounded-xl border border-primary/25 bg-primary/8 shadow-[0_1px_0_rgb(0_0_0/0.05)] dark:border-primary/40 dark:bg-primary/15",
        className,
      )}
    >
      <span className="text-[19px] leading-[22px] font-bold tracking-tight text-primary">
        {PITCH_LABELS[pitch]}
      </span>
      <span className="text-[9.5px] leading-3 font-bold tracking-wider text-muted-foreground uppercase">
        {quality === "MINOR" ? "minor" : "major"}
      </span>
    </div>
  );
}
