import { cn } from "@/lib/utils";

interface OrgMarkProps {
  name: string;
  logoUrl: string | null;
  className?: string;
}

/** "Riverbend Church" → "RC". */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

/** The organization's logo, or its initials on an ink tile when it has none. */
export function OrgMark({ name, logoUrl, className }: OrgMarkProps) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-foreground text-xs font-semibold tracking-tight text-background",
        className,
      )}
    >
      {logoUrl ? (
        <img src={logoUrl} alt="" className="size-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}
