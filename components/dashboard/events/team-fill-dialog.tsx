"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { toast } from "sonner";
import {
  Check,
  History,
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
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AgentStep } from "@/components/ai-chat/agent-steps";
import { Markdown } from "@/components/ai-chat/markdown";
import { PromptInput } from "@/components/ai-chat/prompt-input";
import { Suggestions } from "@/components/ai-chat/suggestions";
import { cn } from "@/lib/utils";
import { getServiceColors } from "@/lib/config/service-types-config";
import { ROLE_ORDER, volunteerRoleConfig } from "@/lib/config/roles";
import type { RoleCategory as Team, VolunteerRole } from "@/generated/prisma/enums";
import { inviteMembersToEvent } from "@/lib/actions/event";
import type { TeamFillAgentUIMessage, TeamProposal } from "@/lib/agents/team/agent";

const SUGGESTIONS = [
  "Fill the open spots",
  "Fill the open spots, resting anyone who served last week",
  "Who hasn't served in a while?",
];

/** "Marcus Lee" as "ML", for an avatar with no photo. */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

/** A team the viewer can fill with AI on this event, and its open spots. */
export type FillableTeam = {
  team: Team;
  label: string;
  open: number;
  /** Who leads it, by first name, when the viewer is only its backup. */
  backingUp: string | null;
};

type ServiceColors = ReturnType<typeof getServiceColors>;

const teamList = new Intl.ListFormat("en", { type: "conjunction" });

/** "Band", or "Maria's Vocals" on a team the viewer only backs up. */
const teamName = (t: FillableTeam) => (t.backingUp ? `${t.backingUp}'s ${t.label}` : t.label);

interface TeamFillDialogProps {
  organizationId: string;
  eventId: string;
  eventName: string;
  serviceColor: string;
  /** Every team the viewer can fill here that still has open spots. */
  teams: FillableTeam[];
  className?: string;
}

/**
 * Fill with AI, as one row under the Team card's actions: the AI suggests
 * people for the open spots and nothing is sent until somebody presses
 * Invite. Only on teams the viewer can staff here — theirs, and the ones
 * they back up on Also notify — and the route checks that again.
 */
export function TeamFillDialog({
  organizationId,
  eventId,
  eventName,
  serviceColor,
  teams,
  className,
}: TeamFillDialogProps) {
  const [open, setOpen] = useState(false);
  const serviceColors = getServiceColors(serviceColor);
  // Their own teams to start with; the ones they back up wait for a tap,
  // unless that's all there is.
  const own = teams.filter((t) => t.backingUp === null);
  const start = own.length > 0 ? own : teams;
  const spots = start.reduce((sum, t) => sum + t.open, 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* The row goes once the team's spots are taken, but an open dialog
          stays: its own Invite is what takes them, and the chat carries on. */}
      {spots > 0 && (
        // In the service's colour, so it stands out on the roster and invites a tap.
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "group flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-left shadow-sm transition-all hover:shadow-md",
            serviceColors.tint,
            serviceColors.borderSoft,
            serviceColors.shadow,
            className,
          )}
        >
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white",
              serviceColors.solid,
            )}
          >
            <Sparkles className="h-4 w-4 shimmer-icon" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground">
              {spots === 1 ? "1 open spot" : `${spots} open spots`}
            </span>
            {/* A team somebody else leads is named as theirs: a fact, not a request. */}
            <span className="block truncate text-xs text-muted-foreground">
              {teamList.format(start.map(teamName))}
            </span>
          </span>
          <span
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold text-white transition-colors",
              serviceColors.solid,
              serviceColors.solidHover,
            )}
          >
            Fill with AI
          </span>
        </button>
      )}

      <DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className={cn("size-4", serviceColors.badgeText)} />
            Fill with AI
          </DialogTitle>
          <DialogDescription>
            Picks people for {eventName}&apos;s open spots. Nothing is sent until you press Invite.
          </DialogDescription>
        </DialogHeader>

        {/* Inside the content, so the conversation lasts as long as the dialog is open. */}
        <TeamFillChat
          organizationId={organizationId}
          eventId={eventId}
          teams={teams}
          start={start.map((t) => t.team)}
          serviceColors={serviceColors}
        />
      </DialogContent>
    </Dialog>
  );
}

function TeamFillChat({
  organizationId,
  eventId,
  teams,
  start,
  serviceColors,
}: {
  organizationId: string;
  eventId: string;
  teams: FillableTeam[];
  start: Team[];
  serviceColors: ServiceColors;
}) {
  const [picked, setPicked] = useState<Team[]>(start);
  const [input, setInput] = useState("");
  const [timedOut, setTimedOut] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, stop, error } =
    useChat<TeamFillAgentUIMessage>({
      transport: new DefaultChatTransport({
        api: "/api/team-ai",
        body: { orgId: organizationId, eventId },
      }),
      onFinish: ({ isAbort, isError, finishReason }) => {
        setTimedOut(!isAbort && !isError && finishReason == null);
      },
    });

  const isStreaming = status === "submitted" || status === "streaming";

  // Somebody else's teams the viewer has picked: said under the tabs, so
  // stepping in is something they chose.
  const backups = teams.filter((t) => t.backingUp && picked.includes(t.team));

  const lastPart = messages.at(-1)?.parts.at(-1);
  const tailIsLive =
    lastPart?.type === "text"
      ? lastPart.state === "streaming"
      : lastPart?.type === "tool-proposeInvites"
        ? lastPart.state === "input-streaming" || lastPart.state === "input-available"
        : false;
  const showBusy = isStreaming && !tailIsLive;

  // Only the newest picks can be sent; earlier ones fold away so nobody
  // invites from a version they've already moved past.
  let latestId: string | undefined;
  for (const message of messages) {
    for (const part of message.parts) {
      if (
        part.type === "tool-proposeInvites" &&
        part.state === "output-available" &&
        part.output.ok
      ) {
        latestId = part.toolCallId;
      }
    }
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  function submit() {
    const text = input.trim();
    if (!text || isStreaming) return;
    setTimedOut(false);
    // The teams ride along with each message, so changing them steers the next answer.
    sendMessage({ text }, { body: { teams: picked } });
    setInput("");
  }

  return (
    <>
      {teams.length > 1 && (
        <ToggleGroup
          type="multiple"
          variant="outline"
          size="sm"
          spacing={2}
          value={picked}
          // At least one team stays picked: there's nothing to fill without one.
          onValueChange={(value) => {
            if (value.length > 0) setPicked(value as Team[]);
          }}
          aria-label="Teams to fill"
          className="flex-wrap"
        >
          {teams.map((t) => (
            <ToggleGroupItem
              key={t.team}
              value={t.team}
              className={cn("text-xs transition-all", serviceColors.toggleOn)}
            >
              {teamName(t)}
              <span className="tabular-nums opacity-70">{t.open}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      {backups.length > 0 && (
        <div className="-mt-2 space-y-0.5 text-[11px] text-muted-foreground">
          {backups.map((t) => (
            <p key={t.team}>
              {t.label} is {t.backingUp}&apos;s to fill. You&apos;re the backup, so you can step in.
            </p>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <Suggestions items={SUGGESTIONS} onPick={setInput} />
        ) : (
          messages.map((m) => (
            <div key={m.id} className="space-y-2">
              {m.parts.map((part, i) => {
                if (part.type === "text") {
                  if (!part.text) return null;
                  return m.role === "user" ? (
                    <div key={i} className="flex justify-end">
                      <div
                        className={cn(
                          "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-md px-3 py-1.5 text-xs text-primary-foreground",
                          serviceColors.solid,
                        )}
                      >
                        {part.text}
                      </div>
                    </div>
                  ) : (
                    <div key={i} className="text-xs leading-relaxed text-foreground">
                      <Markdown>{part.text}</Markdown>
                    </div>
                  );
                }

                if (part.type === "tool-proposeInvites") {
                  switch (part.state) {
                    case "input-streaming":
                    case "input-available":
                      return isStreaming ? (
                        <AgentStep key={i} icon={UserSearch} title="Picking people" status="running" />
                      ) : (
                        <AgentStep
                          key={i}
                          icon={UserSearch}
                          title="Stopped before the picks were ready"
                          status="error"
                        />
                      );
                    case "output-available":
                      return part.output.ok ? (
                        <ProposalCard
                          key={i}
                          proposal={part.output.proposal}
                          latest={part.toolCallId === latestId}
                          organizationId={organizationId}
                          eventId={eventId}
                          serviceColors={serviceColors}
                        />
                      ) : (
                        // The server turned the picks down; the agent fixes them
                        // and proposes again, so this is a step, not a failure.
                        <AgentStep key={i} icon={RotateCcw} title="Adjusting the picks">
                          {part.output.error}
                        </AgentStep>
                      );
                    case "output-error":
                      return (
                        <AgentStep
                          key={i}
                          icon={UserSearch}
                          title="Couldn't pick people. Try rephrasing."
                          status="error"
                        />
                      );
                  }
                }

                return null;
              })}
            </div>
          ))
        )}

        {showBusy && <AgentStep icon={Sparkles} title="Thinking" status="running" />}
        {timedOut && (
          <p className="text-xs text-destructive">
            That timed out before finishing. Try again, or narrow the request.
          </p>
        )}
        {error && (
          <p className="text-xs text-destructive">
            {/upgrade/i.test(error.message)
              ? "This organization's plan no longer includes Fill with AI."
              : /event is over/i.test(error.message)
                ? "This event is over."
                : /in charge/i.test(error.message)
                  ? "Only whoever's in charge of a team, or its backup, can fill it with AI."
                  : /AI requests/.test(error.message)
                    ? error.message
                    : "Something went wrong. Please try again."}
          </p>
        )}
      </div>

      <PromptInput
        value={input}
        onChange={setInput}
        onSubmit={submit}
        onStop={stop}
        busy={isStreaming}
        placeholder="Ask for picks, or about anyone…"
        sendClassName={cn(serviceColors.solid, serviceColors.solidHover)}
      />
    </>
  );
}

function ProposalCard({
  proposal,
  latest,
  organizationId,
  eventId,
  serviceColors,
}: {
  proposal: TeamProposal;
  /** The newest picks in the chat: the only ones that can be sent. */
  latest: boolean;
  organizationId: string;
  eventId: string;
  serviceColors: ServiceColors;
}) {
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [expiresAt, setExpiresAt] = useState(3);
  const [invitedCount, setInvitedCount] = useState<number | null>(null);
  const [leftOut, setLeftOut] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const kept = proposal.picks.filter((p) => !removed.has(p.userId));
  const invited = invitedCount !== null;
  const locked = isPending || invited;

  // Every role the picks touch, plus any nobody could be picked for.
  const roles = ROLE_ORDER.filter(
    (role) =>
      proposal.picks.some((p) => p.role === role) ||
      proposal.stillOpen.some((s) => s.role === role),
  ).map((role) => ({
    role,
    people: kept.filter((p) => p.role === role),
    // Still open once these say yes: what nobody was picked for, and anyone taken off.
    open:
      (proposal.stillOpen.find((s) => s.role === role)?.count ?? 0) +
      proposal.picks.filter((p) => p.role === role && removed.has(p.userId)).length,
  }));

  function toggleRemoved(userId: string) {
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  // The approval: one call per role, each only into spots still open when it
  // lands, so a lead and their backup approving at once can't both add a
  // drummer. inviteMembersToEvent checks every pick again before sending.
  function invite() {
    setError(null);

    startTransition(async () => {
      const byRole = new Map<VolunteerRole, string[]>();
      for (const p of kept) byRole.set(p.role, [...(byRole.get(p.role) ?? []), p.userId]);

      let count = 0;
      const missed: string[] = [];

      for (const [role, userIds] of byRole) {
        const label = volunteerRoleConfig[role].label;

        try {
          const result = await inviteMembersToEvent(organizationId, eventId, {
            role,
            userIds,
            expiresAt,
            onlyOpenSpots: true,
            refuseConflicts: true,
          });

          if (!result.success) {
            missed.push(`${label}: ${result.error}`);
            continue;
          }

          count += result.invitedCount;
          missed.push(...result.noSpotNames.map((name) => `${name}: ${label} filled up first`));
          missed.push(...result.skippedNames.map((name) => `${name}: already on this event`));
        } catch {
          missed.push(`${label}: something went wrong`);
        }
      }

      setLeftOut(missed);

      if (count === 0) {
        setError("Nobody was invited.");
        return;
      }

      setInvitedCount(count);
      toast.success(`Invited ${count} ${count === 1 ? "person" : "people"}.`, {
        position: "top-center",
      });
    });
  }

  // An earlier version in the same chat: one line, nothing to press.
  if (!latest) {
    const n = invitedCount ?? proposal.picks.length;
    const people = n === 1 ? "person" : "people";

    return invited ? (
      <AgentStep icon={Check} title={`Invited ${n} ${people}`} />
    ) : (
      <AgentStep icon={History} title={`Earlier picks: ${n} ${people}`} />
    );
  }

  return (
    <Card className="gap-4 py-4">
      <CardContent className="flex flex-col gap-4 px-4">
        {/* The model's explanation rides on the card: it stops at the picks. */}
        {proposal.note && (
          <p className="text-xs leading-relaxed text-muted-foreground">{proposal.note}</p>
        )}

        <div className="flex flex-col gap-3">
          {roles.map(({ role, people, open }) => (
            <div key={role} className="flex flex-col">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <span aria-hidden>{volunteerRoleConfig[role].icon}</span>
                {volunteerRoleConfig[role].label}
                {open > 0 && (
                  <Badge variant="secondary" className="ml-auto">
                    {open} open
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

        {removed.size > 0 && !invited && (
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

        {proposal.warnings.length > 0 && (
          <Alert className="px-3 py-2">
            <TriangleAlert />
            <AlertTitle className="text-xs">Not picked</AlertTitle>
            <AlertDescription className="text-[11px]">
              <ul className="flex flex-col gap-0.5">
                {proposal.warnings.map((w, i) => (
                  <li key={i}>
                    {w.name} for {volunteerRoleConfig[w.role].label}: {w.reason}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Approved but not asked: somebody got there first, or they're on it already. */}
        {leftOut.length > 0 && (
          <Alert className="px-3 py-2">
            <TriangleAlert />
            <AlertTitle className="text-xs">Not invited</AlertTitle>
            <AlertDescription className="text-[11px]">
              <ul className="flex flex-col gap-0.5">
                {leftOut.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {error && <p className="text-[11px] text-destructive">{error}</p>}
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-2 px-4">
        {!invited && (
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="team-fill-expiry" className="text-xs">
              Response deadline
            </Label>
            <Select
              value={String(expiresAt)}
              onValueChange={(value) => setExpiresAt(Number(value))}
              disabled={locked}
            >
              <SelectTrigger id="team-fill-expiry" size="sm" className="w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 days</SelectItem>
                <SelectItem value="5">5 days</SelectItem>
                <SelectItem value="7">7 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <Button
          type="button"
          size="sm"
          disabled={locked || kept.length === 0}
          onClick={invite}
          className={cn(serviceColors.solid, serviceColors.solidHover)}
        >
          {invited ? (
            <>
              <Check data-icon="inline-start" />
              Invited {invitedCount}
            </>
          ) : isPending ? (
            <>
              <Spinner data-icon="inline-start" />
              Inviting…
            </>
          ) : (
            `Invite ${kept.length} ${kept.length === 1 ? "person" : "people"}`
          )}
        </Button>

        {!invited && kept.length > 0 && (
          <p className="text-center text-[11px] text-muted-foreground">
            Sends {kept.length === 1 ? "an invite" : "invites"} by email immediately
          </p>
        )}
      </CardFooter>
    </Card>
  );
}
