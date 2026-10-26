"use client";

import { Button } from "@/components/ui/button";

interface SuggestionsProps {
  items: string[];
  /** Puts the suggestion in the box rather than sending it, so it can be edited first. */
  onPick: (text: string) => void;
}

/** Starting points for an assistant panel, as chips. */
export function Suggestions({ items, onPick }: SuggestionsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Button
          key={item}
          type="button"
          variant="outline"
          size="xs"
          onClick={() => onPick(item)}
          className="h-auto max-w-full rounded-full px-2.5 py-1 text-left font-normal whitespace-normal"
        >
          {item}
        </Button>
      ))}
    </div>
  );
}
