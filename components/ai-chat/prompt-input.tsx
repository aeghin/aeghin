"use client";

import { ArrowUp, Square } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  /** A reply is streaming: the send button becomes Stop. */
  busy: boolean;
  disabled?: boolean;
  placeholder: string;
  /** The send button's colours, for panels themed by their service type. */
  sendClassName?: string;
}

/**
 * The box every assistant panel takes a message in. Enter sends and
 * Shift+Enter starts a new line; it grows with the text up to a few lines.
 *
 * Deliberately not a <form>: the draft panel sits inside the create-event
 * form, and forms can't nest.
 */
export function PromptInput({
  value,
  onChange,
  onSubmit,
  onStop,
  busy,
  disabled = false,
  placeholder,
  sendClassName,
}: PromptInputProps) {
  return (
    <InputGroup className="items-end bg-card">
      <InputGroupTextarea
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        rows={1}
        disabled={disabled}
        placeholder={placeholder}
        className="max-h-28 min-h-0 py-2.5 text-xs md:text-xs"
      />
      <InputGroupAddon align="inline-end" className="pb-1.5">
        {busy ? (
          <InputGroupButton
            size="icon-sm"
            variant="secondary"
            onClick={onStop}
            aria-label="Stop"
          >
            <Square className="fill-current" />
          </InputGroupButton>
        ) : (
          <InputGroupButton
            size="icon-sm"
            variant="default"
            onClick={onSubmit}
            disabled={disabled || !value.trim()}
            aria-label="Send"
            className={cn(sendClassName)}
          >
            <ArrowUp />
          </InputGroupButton>
        )}
      </InputGroupAddon>
    </InputGroup>
  );
}
