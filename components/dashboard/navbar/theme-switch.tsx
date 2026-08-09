"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

export const ThemeSwitch = ({ className }: { className?: string }) => {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // The stored theme is only readable on the client. The visual state is
  // CSS-driven so it's already right at first paint — this is for aria only.
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Toggle dark mode"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full",
        "border border-border/60 bg-muted/50 transition-colors hover:bg-muted",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "focus-visible:ring-offset-background focus-visible:outline-none",
        className,
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute left-1 flex h-6 w-6 items-center justify-center",
          "rounded-full bg-background shadow-md ring-1 ring-border/50",
          "transition-transform duration-300 ease-out dark:translate-x-6",
        )}
      >
        <Sun className="h-3.5 w-3.5 rotate-0 scale-100 text-amber-500 transition-all duration-300 dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-3.5 w-3.5 rotate-90 scale-0 text-primary transition-all duration-300 dark:rotate-0 dark:scale-100" />
      </span>
    </button>
  );
};
