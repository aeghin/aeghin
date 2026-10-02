"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Music } from "lucide-react";
import { cn } from "@/lib/utils";

export function NavLinks() {
  const pathname = usePathname();

  // Derive the current org id from the URL so "Songs" targets the right org.
  // Anchored match stops at the next slash, so it still works on /songs itself.
  const orgId = pathname.match(/^\/dashboard\/organizations\/([^/]+)/)?.[1];

  if (!orgId) return null;

  const songsHref = `/dashboard/organizations/${orgId}/songs`;
  const active = pathname.startsWith(songsHref);

  return (
    <nav className="flex items-center gap-1 sm:mr-2">
      <Link
        href={songsHref}
        className={cn(
          "relative whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200",
          active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
        )}
      >
        <Music className="mr-1.5 inline h-3.5 w-3.5 max-[375px]:mr-0" />
        {/* Under 375px (most Android phones) the bar can't fit the label next
            to the plan badge and switches, so it goes icon-only there. */}
        <span className="max-[375px]:sr-only">Songs</span>
        {active && (
          <span className="absolute inset-x-3 -bottom-3.25 h-0.5 rounded-full bg-primary" />
        )}
      </Link>
    </nav>
  );
}
