import type { ReactNode } from "react";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";

type AgentStepProps = {
  icon: LucideIcon;
  title: string;
  /** Muted, after the title: a count. */
  description?: string;
  status?: "running" | "error";
  /** What opens under the step. Without it the step is a plain line. */
  children?: ReactNode;
};

/**
 * One thing an assistant is doing or did, as a Trace line. A running step's
 * title shimmers. Kept at the chat's text-xs so a step never outsizes the
 * reply it leads to.
 */
export function AgentStep({ icon: Icon, title, description, status, children }: AgentStepProps) {
  const line = (
    <TraceLine status={status} className="text-xs">
      <TraceIcon>
        <Icon />
      </TraceIcon>
      <TraceTitle>{title}</TraceTitle>
      {description && <TraceDescription>{description}</TraceDescription>}
    </TraceLine>
  );

  return (
    <Trace>
      {children ? (
        <TraceCollapsible>
          <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
          <TraceCollapsibleContent className="text-xs">{children}</TraceCollapsibleContent>
        </TraceCollapsible>
      ) : (
        line
      )}
    </Trace>
  );
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** A search's results as link rows, for under its step. */
export function AgentSources({ sources }: { sources: { url: string; title: string | null }[] }) {
  return (
    <Trace>
      {sources.map((source) => (
        <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
          <TraceLine className="text-xs">
            <TraceTitle>
              {source.title || hostOf(source.url)}
              <span className="sr-only"> (opens in a new tab)</span>
            </TraceTitle>
            <TraceIcon>
              <ArrowUpRight />
            </TraceIcon>
          </TraceLine>
        </a>
      ))}
    </Trace>
  );
}
