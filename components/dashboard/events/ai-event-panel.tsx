"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  ArrowUp,
  Check,
  CalendarDays,
  Loader2,
  MapPin,
  Pencil,
  Sparkles,
  Square,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/ai-chat/markdown";
import { cn } from "@/lib/utils";
import { getServiceColors } from "@/lib/config/service-types-config";
import { volunteerRoleConfig } from "@/lib/config/roles";
import type { VolunteerRole } from "@/generated/prisma/enums";
import { createEvent } from "@/lib/actions/event";
import type {
  EventDraft,
  EventDraftAgentUIMessage,
} from "@/lib/agents/event/agent";

const SUGGESTIONS = [
  "Sunday morning service next week, full band",
  "Christmas Eve service, 6pm, rotate in people who haven't served lately",
  "Youth night this Friday — drums, bass, guitar, sound",
];

/** The browser's own calendar day as YYYY-MM-DD. Built by hand rather than via
 *  toLocaleDateString so no locale can change the shape the server expects. */
function localToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * A YYYY-MM-DD draft day as LOCAL midnight. createEventInputSchema requires a
 * real Date for dateRange even though createEvent only reads dayTimes, and
 * parsing as UTC would land on the previous day in negative-offset zones.
 */
function parseLocalDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Draft days are floating wall-clock, so they render in UTC like everywhere else. */
function formatDraftDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatDraftTime(time: string): string {
  return new Date(`1970-01-01T${time}:00Z`).toLocaleTimeString("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

interface AiEventPanelProps {
  orgId: string;
  /** Whether the org has a service type to file an event under. With none the
   *  route 422s, so the panel says so rather than taking a prompt into a dead end. */
  hasServiceTypes: boolean;
  /** Hand the draft to a form for manual editing. Omit where there is no form. */
  onRefine?: (draft: EventDraft) => void;
}

export function AiEventPanel({
  orgId,
  hasServiceTypes,
  onRefine,
}: AiEventPanelProps) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, stop, error } =
    useChat<EventDraftAgentUIMessage>({
      transport: new DefaultChatTransport({
        api: "/api/event-ai",
        // "Next Sunday" is relative to the user's calendar, not the server's.
        // Resolvable, so this re-reads the clock on every send.
        body: () => ({ orgId, today: localToday() }),
      }),
      onFinish: ({ isAbort, isError, finishReason }) => {
        setTimedOut(!isAbort && !isError && finishReason == null);
      },
    });

  const isStreaming = status === "submitted" || status === "streaming";
  const hasMessages = messages.length > 0;

  const lastPart = messages.at(-1)?.parts.at(-1);
  const tailIsLive =
    lastPart?.type === "text"
      ? lastPart.state === "streaming"
      : lastPart?.type === "tool-checkAvailability" ||
          lastPart?.type === "tool-proposeEvent"
        ? lastPart.state === "input-streaming" ||
          lastPart.state === "input-available"
        : false;
  const showBusy = isStreaming && !tailIsLive;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  function submit() {
    const text = input.trim();
    if (!text || isStreaming || !hasServiceTypes) return;
    setTimedOut(false);
    setOpen(true);
    sendMessage({ text });
    setInput("");
  }

  return (
    <div className="mb-2 rounded-2xl border border-border/40 bg-linear-to-br from-card via-card to-primary/5 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Draft with AI</p>
          <p className="text-xs text-muted-foreground">
            Describe the event — it picks the dates and the people, you approve
          </p>
        </div>
      </div>

      {(open || hasMessages) && (
        <div
          ref={scrollRef}
          className="mt-4 max-h-96 space-y-4 overflow-y-auto pr-1"
        >
          {messages.map((m) => (
            <div key={m.id} className="space-y-2">
              {m.parts.map((part, i) => {
                if (part.type === "text") {
                  if (!part.text) return null;
                  return m.role === "user" ? (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-primary px-3 py-1.5 text-xs text-primary-foreground">
                        {part.text}
                      </div>
                    </div>
                  ) : (
                    <div key={i} className="text-xs leading-relaxed text-foreground">
                      <Markdown>{part.text}</Markdown>
                    </div>
                  );
                }

                if (part.type === "tool-checkAvailability") {
                  switch (part.state) {
                    case "input-streaming":
                    case "input-available":
                      return <Busy key={i} label="Checking who's available…" />;
                    case "output-available":
                      return (
                        <p key={i} className="text-xs text-muted-foreground">
                          Checked availability across{" "}
                          {part.output.roles.length} role
                          {part.output.roles.length === 1 ? "" : "s"}
                        </p>
                      );
                    case "output-error":
                      return null;
                  }
                }

                if (part.type === "tool-proposeEvent") {
                  switch (part.state) {
                    case "input-streaming":
                    case "input-available":
                      return <Busy key={i} label="Building the draft…" />;
                    case "output-available":
                      return part.output.ok ? (
                        <DraftCard
                          key={i}
                          draft={part.output.draft}
                          orgId={orgId}
                          onRefine={onRefine}
                        />
                      ) : (
                        <p key={i} className="text-xs text-muted-foreground">
                          Adjusting: {part.output.error}
                        </p>
                      );
                    case "output-error":
                      return (
                        <p key={i} className="text-xs text-destructive">
                          Couldn&apos;t build that draft. Try rephrasing.
                        </p>
                      );
                  }
                }

                return null;
              })}
            </div>
          ))}

          {showBusy && <Busy label="Thinking…" />}
          {timedOut && (
            <p className="text-xs text-destructive">
              That timed out before finishing. Try again, or narrow the request.
            </p>
          )}
          {error && (
            <p className="text-xs text-destructive">
              {/service type/i.test(error.message)
                ? "This organization has no service types yet — add one below and try again."
                : /upgrade/i.test(error.message)
                  ? "This organization's AI plan has lapsed."
                  : "Something went wrong. Please try again."}
            </p>
          )}
        </div>
      )}

      {!hasMessages && !hasServiceTypes && (
        <p className="mt-3 rounded-lg border border-dashed border-border px-2.5 py-2 text-xs text-muted-foreground">
          Every event is filed under a service type, and this organization has
          none yet. Add one in the form below and the drafting starts working.
        </p>
      )}

      {!hasMessages && hasServiceTypes && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setInput(s);
                setOpen(true);
              }}
              className="rounded-lg border border-border bg-card/50 px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Deliberately not a <form> — this panel renders inside the create-event
          form, and nesting forms is invalid HTML. */}
      <div className="relative mt-3 flex items-end gap-2 rounded-xl border border-border bg-card p-1.5 transition-colors focus-within:border-primary/50">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          disabled={!hasServiceTypes}
          placeholder={
            hasServiceTypes
              ? "Describe the event…"
              : "Add a service type to start drafting"
          }
          className="max-h-28 min-h-0 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-xs shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        {isStreaming ? (
          <Button
            type="button"
            size="icon"
            variant="secondary"
            onClick={stop}
            className="size-8 shrink-0 cursor-pointer rounded-lg"
            aria-label="Stop"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            onClick={submit}
            disabled={!input.trim() || !hasServiceTypes}
            className="size-8 shrink-0 cursor-pointer rounded-lg"
            aria-label="Send"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function DraftCard({
  draft,
  orgId,
  onRefine,
}: {
  draft: EventDraft;
  orgId: string;
  onRefine?: (draft: EventDraft) => void;
}) {
  const router = useRouter();
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const [refined, setRefined] = useState(false);
  const [isPending, startTransition] = useTransition();

  const colors = getServiceColors(draft.serviceTypeColor);
  const kept = draft.assignments.filter((a) => !removed.has(a.userId));
  const locked = isPending || created;

  const byRole = draft.rolesNeeded.map((role) => ({
    role,
    people: kept.filter((a) => a.role === role),
  }));

  function toggleRemoved(userId: string) {
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  // The approval. Everything below runs through createEvent, which re-checks
  // membership, role qualification and blockouts server-side before writing —
  // the draft is a suggestion right up to this click.
  function create() {
    setError(null);

    startTransition(async () => {
      const roleAssignments = {} as Record<VolunteerRole, string[]>;
      for (const a of kept) {
        roleAssignments[a.role] = [...(roleAssignments[a.role] || []), a.userId];
      }

      // Floating wall-clock, exactly as the form's own submit composes it.
      const dayTimes: Record<string, { startTime: string; endTime: string }> = {};
      for (const d of draft.days) {
        dayTimes[d.date] = {
          startTime: new Date(`${d.date}T${d.startTime}:00Z`).toISOString(),
          endTime: new Date(`${d.date}T${d.endTime}:00Z`).toISOString(),
        };
      }

      const first = draft.days[0];
      const last = draft.days[draft.days.length - 1];

      try {
        const result = await createEvent(
          {
            serviceTypeId: draft.serviceTypeId,
            name: draft.name,
            description: draft.description,
            dateRange: {
              from: parseLocalDate(first.date),
              to: parseLocalDate(last.date),
            },
            dayTimes,
            location: draft.location,
            rolesNeeded: draft.rolesNeeded,
            expiresAt: draft.expiresInDays,
            smartSchedulingEnabled: draft.smartSchedulingEnabled,
            roleAssignments,
          },
          orgId,
        );

        if (!result.success) {
          setError(result.error);
          return;
        }

        setCreated(true);
        router.replace(`/dashboard/organizations/${orgId}`);
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }

  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <div className="mb-3 flex items-start gap-2">
        <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", colors.dot)} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{draft.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {draft.serviceTypeName}
          </p>
        </div>
      </div>

      <div className="mb-3 space-y-1 text-xs text-muted-foreground">
        {draft.days.map((d) => (
          <p key={d.date} className="flex items-center gap-1.5">
            <CalendarDays className="h-3 w-3 shrink-0" />
            {formatDraftDate(d.date)} · {formatDraftTime(d.startTime)} –{" "}
            {formatDraftTime(d.endTime)}
          </p>
        ))}
        <p className="flex items-center gap-1.5">
          <MapPin className="h-3 w-3 shrink-0" />
          {draft.location}
        </p>
      </div>

      <ul className="space-y-2">
        {byRole.map(({ role, people }) => (
          <li key={role} className="flex items-start gap-2 text-xs">
            <span className="w-4 shrink-0 text-center">
              {volunteerRoleConfig[role].icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {volunteerRoleConfig[role].label}
                {people.length === 0 && (
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    — left open
                  </span>
                )}
              </p>
              {people.map((p) => (
                <div key={p.userId} className="flex items-start gap-1.5">
                  <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
                    <span className="text-foreground">{p.name}</span> ·{" "}
                    {p.reason}
                  </p>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => toggleRemoved(p.userId)}
                    aria-label={`Remove ${p.name}`}
                    className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>

      {removed.size > 0 && !created && (
        <button
          type="button"
          disabled={locked}
          onClick={() => setRemoved(new Set())}
          className="mt-2 text-[11px] text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          Undo {removed.size} removal{removed.size === 1 ? "" : "s"}
        </button>
      )}

      {draft.warnings.length > 0 && (
        <div className="mt-3 space-y-1 rounded-lg bg-amber-500/10 p-2">
          {draft.warnings.map((w, i) => (
            <p
              key={i}
              className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-500"
            >
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                {w.name} skipped for {volunteerRoleConfig[w.role].label} —{" "}
                {w.reason}
              </span>
            </p>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-3 text-[11px] text-destructive">{error}</p>
      )}

      <Button
        type="button"
        size="sm"
        disabled={locked}
        onClick={create}
        className="mt-3 w-full cursor-pointer"
      >
        {created ? (
          <>
            <Check className="mr-1.5 h-3.5 w-3.5" />
            Created
          </>
        ) : isPending ? (
          <>
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            Creating…
          </>
        ) : kept.length === 0 ? (
          "Create event"
        ) : (
          `Create & invite ${kept.length} ${kept.length === 1 ? "person" : "people"}`
        )}
      </Button>

      {!created && kept.length > 0 && (
        <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
          Sends {kept.length === 1 ? "an invite" : "invites"} by email
          immediately
        </p>
      )}

      {onRefine && !created && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={locked}
          onClick={() => {
            // Hands over the whole draft, removals included — what you see on
            // this card is what lands in the form.
            onRefine({ ...draft, assignments: kept });
            setRefined(true);
          }}
          className="mt-2 w-full cursor-pointer"
        >
          {refined ? (
            <>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Loaded into the form below
            </>
          ) : (
            <>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit manually first
            </>
          )}
        </Button>
      )}
    </div>
  );
}

function Busy({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Sparkles className="h-3.5 w-3.5 animate-pulse text-primary" />
      {label}
    </div>
  );
}
