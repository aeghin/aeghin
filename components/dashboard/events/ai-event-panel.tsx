"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  Check,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  CalendarX2,
  History,
  MapPin,
  Pencil,
  RotateCcw,
  Sparkles,
  TriangleAlert,
  UserSearch,
  X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
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
import { AgentStep } from "@/components/ai-chat/agent-steps";
import { Markdown } from "@/components/ai-chat/markdown";
import { PromptInput } from "@/components/ai-chat/prompt-input";
import { Suggestions } from "@/components/ai-chat/suggestions";
import { cn } from "@/lib/utils";
import { getServiceColors } from "@/lib/config/service-types-config";
import {
  teamLabel,
  teamOfRole,
  teamsOfRoles,
  volunteerRoleConfig,
} from "@/lib/config/roles";
import type { VolunteerRole } from "@/generated/prisma/enums";
import { createEvent } from "@/lib/actions/event";
import type {
  CheckAvailabilityOutput,
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

/** "2026-10-31 to 2026-11-02" as "Oct 31 – Nov 2"; blockout days are UTC midnights. */
function formatBlockout(detail: string): string {
  const [from, to] = detail.split(" to ");
  if (!from || !to) return detail;

  const day = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
    });

  return from === to ? day(from) : `${day(from)} – ${day(to)}`;
}

/** "Marcus Lee" as "ML", for an avatar with no photo. */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

/** "Leo Check and Mia Check", for who's told when the event is created. */
const names = new Intl.ListFormat("en", { type: "conjunction" });

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

  // Only the newest draft can be created or edited; earlier ones fold away so
  // nobody presses Create on a version they've already moved past.
  let latestDraftId: string | undefined;
  for (const message of messages) {
    for (const part of message.parts) {
      if (
        part.type === "tool-proposeEvent" &&
        part.state === "output-available" &&
        part.output.ok
      ) {
        latestDraftId = part.toolCallId;
      }
    }
  }

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
                      return isStreaming ? (
                        <AgentStep
                          key={i}
                          icon={UserSearch}
                          title="Checking who's available"
                          status="running"
                        />
                      ) : (
                        <AgentStep
                          key={i}
                          icon={UserSearch}
                          title="Stopped while checking who's available"
                          status="error"
                        />
                      );
                    case "output-available":
                      return (
                        <AgentStep
                          key={i}
                          icon={UserSearch}
                          title="Checked who's available"
                          description={`${part.output.roles.length} ${
                            part.output.roles.length === 1 ? "role" : "roles"
                          }`}
                        >
                          <AvailabilityTrace roles={part.output.roles} />
                        </AgentStep>
                      );
                    case "output-error":
                      return (
                        <AgentStep
                          key={i}
                          icon={UserSearch}
                          title="Couldn't check who's available"
                          status="error"
                        />
                      );
                  }
                }

                if (part.type === "tool-proposeEvent") {
                  switch (part.state) {
                    case "input-streaming":
                    case "input-available":
                      return isStreaming ? (
                        <AgentStep
                          key={i}
                          icon={CalendarDays}
                          title="Building the draft"
                          status="running"
                        />
                      ) : (
                        <AgentStep
                          key={i}
                          icon={CalendarDays}
                          title="Stopped before the draft was built"
                          status="error"
                        />
                      );
                    case "output-available":
                      return part.output.ok ? (
                        <DraftCard
                          key={i}
                          draft={part.output.draft}
                          orgId={orgId}
                          onRefine={onRefine}
                          latest={part.toolCallId === latestDraftId}
                        />
                      ) : (
                        // The server turned the draft down; the agent fixes it
                        // and proposes again, so this is a step, not a failure.
                        <AgentStep key={i} icon={RotateCcw} title="Adjusting the draft">
                          {part.output.error}
                        </AgentStep>
                      );
                    case "output-error":
                      return (
                        <AgentStep
                          key={i}
                          icon={CalendarDays}
                          title="Couldn't build that draft. Try rephrasing."
                          status="error"
                        />
                      );
                  }
                }

                return null;
              })}
            </div>
          ))}

          {showBusy && <AgentStep icon={Sparkles} title="Thinking" status="running" />}
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
                  ? "This organization's plan no longer includes AI event drafting."
                  : /AI requests/.test(error.message)
                    ? error.message
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
        <div className="mt-3">
          <Suggestions
            items={SUGGESTIONS}
            onPick={(s) => {
              setInput(s);
              setOpen(true);
            }}
          />
        </div>
      )}

      <div className="mt-3">
        <PromptInput
          value={input}
          onChange={setInput}
          onSubmit={submit}
          onStop={stop}
          busy={isStreaming}
          disabled={!hasServiceTypes}
          placeholder={
            hasServiceTypes
              ? "Describe the event…"
              : "Add a service type to start drafting"
          }
        />
      </div>
    </div>
  );
}

function DraftCard({
  draft,
  orgId,
  onRefine,
  latest,
}: {
  draft: EventDraft;
  orgId: string;
  onRefine?: (draft: EventDraft) => void;
  /** The newest draft in the chat: the only one that can be created or edited. */
  latest: boolean;
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
    // Drafts from before counts carry none, which is one each.
    spots: draft.roleSpots?.[role] ?? 1,
  }));

  // Roles by team, each with whoever's in charge of it. Drafts from before
  // teams carry none, which makes every team the drafter's.
  const groups = (
    draft.teams?.length
      ? draft.teams
      : teamsOfRoles(draft.rolesNeeded).map((team) => ({
          team,
          name: "",
          you: true,
          cover: false,
        }))
  )
    .map((team) => ({
      ...team,
      roles: byRole.filter(({ role }) => teamOfRole(role) === team.team),
    }))
    .filter((team) => team.roles.length > 0);

  // Whoever's in charge of a team the drafter isn't hears about it on Create.
  const told = [...new Set(groups.filter((team) => !team.you).map((team) => team.name))];

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
            roleSpots: draft.roleSpots,
            expiresAt: draft.expiresInDays,
            smartSchedulingEnabled: draft.smartSchedulingEnabled,
            rehearsal: draft.rehearsal
              ? {
                  date: draft.rehearsal.date,
                  startTime: new Date(
                    `${draft.rehearsal.date}T${draft.rehearsal.startTime}:00Z`,
                  ).toISOString(),
                  endTime: new Date(
                    `${draft.rehearsal.date}T${draft.rehearsal.endTime}:00Z`,
                  ).toISOString(),
                }
              : undefined,
            roleAssignments,
            // Teams the draft handed to somebody for this event only.
            teamLeads: (draft.covers ?? []).map(({ team, userId }) => ({ team, userId })),
            // Anybody booked elsewhere since the draft was built is refused.
            refuseConflicts: true,
          },
          orgId,
        );

        if (!result.success) {
          setError(result.error);
          return;
        }

        setCreated(true);
        // Straight to the new event, where its leads' teams are filled.
        router.replace(`/dashboard/organizations/${orgId}/events/${result.eventId}`);
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }

  // An earlier version in the same chat: one line, nothing to press.
  if (!latest) {
    return (
      <AgentStep
        icon={History}
        title={`Earlier draft: ${draft.name}`}
        description={formatDraftDate(draft.days[0].date)}
      />
    );
  }

  return (
    <Card className="gap-4 py-4">
      <CardHeader className="gap-1 px-4">
        <CardTitle className="flex min-w-0 items-center gap-2 text-sm">
          <span className={cn("size-2 shrink-0 rounded-full", colors.dot)} />
          <span className="truncate">{draft.name}</span>
        </CardTitle>
        {draft.serviceTypeName.toLowerCase() !== draft.name.toLowerCase() && (
          <CardDescription className="text-xs">{draft.serviceTypeName}</CardDescription>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-4 px-4">
        {/* The model's explanation rides on the card: it stops at the draft. */}
        {draft.summary && (
          <p className="text-xs leading-relaxed text-muted-foreground">{draft.summary}</p>
        )}

        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          {draft.days.map((d) => (
            <p key={d.date} className="flex items-center gap-1.5">
              <CalendarDays className="size-3 shrink-0" />
              {formatDraftDate(d.date)} · {formatDraftTime(d.startTime)} –{" "}
              {formatDraftTime(d.endTime)}
            </p>
          ))}
          {draft.rehearsal && (
            <p className="flex items-center gap-1.5">
              <CalendarClock className="size-3 shrink-0" />
              Rehearsal {formatDraftDate(draft.rehearsal.date)} ·{" "}
              {formatDraftTime(draft.rehearsal.startTime)} –{" "}
              {formatDraftTime(draft.rehearsal.endTime)}
            </p>
          )}
          <p className="flex items-center gap-1.5">
            <MapPin className="size-3 shrink-0" />
            {draft.location}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {groups.map(({ team, name, you, cover, roles }) => (
            <div key={team} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  {teamLabel(team)}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {you
                    ? cover
                      ? "You, covering"
                      : "You"
                    : cover
                      ? `${name}, covering`
                      : `${name} leads`}
                </span>
              </div>

              {roles.map(({ role, people, spots }) => (
                <div key={role} className="flex flex-col">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <span aria-hidden>{volunteerRoleConfig[role].icon}</span>
                    {volunteerRoleConfig[role].label}
                    {spots > 1 && (
                      <span className="font-normal text-muted-foreground">×{spots}</span>
                    )}
                    {people.length < spots && (
                      <Badge variant="secondary" className="ml-auto">
                        {spots - people.length} open
                      </Badge>
                    )}
                  </div>
                  {people.map((p) => (
                    <Item key={p.userId} size="sm" className="gap-2.5 px-0 py-1.5">
                      <ItemMedia>
                        <Avatar size="sm">
                          <AvatarFallback>{initials(p.name)}</AvatarFallback>
                        </Avatar>
                      </ItemMedia>
                      <ItemContent className="min-w-0 gap-0.5">
                        <ItemTitle className="text-xs">{p.name}</ItemTitle>
                        <ItemDescription className="text-[11px]">{p.reason}</ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={locked}
                          onClick={() => toggleRemoved(p.userId)}
                          aria-label={`Remove ${p.name}`}
                        >
                          <X />
                        </Button>
                      </ItemActions>
                    </Item>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>

        {removed.size > 0 && !created && (
          <Button
            type="button"
            variant="link"
            size="xs"
            disabled={locked}
            onClick={() => setRemoved(new Set())}
            className="self-start px-0"
          >
            Undo {removed.size} removal{removed.size === 1 ? "" : "s"}
          </Button>
        )}

        {draft.warnings.length > 0 && (
          <Alert className="px-3 py-2">
            <TriangleAlert />
            <AlertTitle className="text-xs">Not picked</AlertTitle>
            <AlertDescription className="text-[11px]">
              <ul className="flex flex-col gap-0.5">
                {draft.warnings.map((w, i) => (
                  <li key={i}>
                    {w.name} for {volunteerRoleConfig[w.role].label}: {w.reason}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {error && <p className="text-[11px] text-destructive">{error}</p>}
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-2 px-4">
        <Button type="button" size="sm" disabled={locked} onClick={create}>
          {created ? (
            <>
              <Check data-icon="inline-start" />
              Created
            </>
          ) : isPending ? (
            <>
              <Spinner data-icon="inline-start" />
              Creating…
            </>
          ) : kept.length === 0 ? (
            "Create event"
          ) : (
            `Create & invite ${kept.length} ${kept.length === 1 ? "person" : "people"}`
          )}
        </Button>

        {!created && (kept.length > 0 || told.length > 0) && (
          <p className="text-center text-[11px] text-muted-foreground">
            {kept.length > 0
              ? `Sends ${kept.length === 1 ? "an invite" : "invites"} by email immediately${
                  told.length > 0 ? ` and lets ${names.format(told)} know` : ""
                }`
              : `Lets ${names.format(told)} know`}
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
          >
            {refined ? (
              <>
                <Check data-icon="inline-start" />
                Loaded into the form below
              </>
            ) : (
              <>
                <Pencil data-icon="inline-start" />
                Edit manually first
              </>
            )}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

/**
 * Who's free for each role, and — opened — who can't serve and why. The
 * count is the people free, not everyone holding the role.
 */
function AvailabilityTrace({ roles }: { roles: CheckAvailabilityOutput["roles"] }) {
  return (
    <Trace>
      {roles.map((r) => {
        const line = (
          <TraceLine className="text-xs">
            <TraceTitle>{volunteerRoleConfig[r.role].label}</TraceTitle>
            <TraceDescription>
              {`${r.eligible.length} free${r.excluded.length > 0 ? ` · ${r.excluded.length} can't` : ""}`}
            </TraceDescription>
          </TraceLine>
        );

        if (r.excluded.length === 0) return <div key={r.role}>{line}</div>;

        return (
          <TraceCollapsible key={r.role}>
            <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
            <TraceCollapsibleContent className="text-xs">
              <Trace>
                {r.excluded.map((x) => (
                  <TraceLine key={x.name} className="text-xs">
                    <TraceIcon>{x.reason === "blockout" ? <CalendarOff /> : <CalendarX2 />}</TraceIcon>
                    <TraceTitle>{x.name}</TraceTitle>
                    <TraceDescription>
                      {x.reason === "blockout"
                        ? `blocked out ${formatBlockout(x.detail)}`
                        : `serving ${x.detail}`}
                    </TraceDescription>
                  </TraceLine>
                ))}
              </Trace>
            </TraceCollapsibleContent>
          </TraceCollapsible>
        );
      })}
    </Trace>
  );
}
