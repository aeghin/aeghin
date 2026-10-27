"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Check, Globe, ListMusic, Music, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PromptInput } from "@/components/ai-chat/prompt-input";
import { AgentSources, AgentStep } from "@/components/ai-chat/agent-steps";
import { Markdown } from "@/components/ai-chat/markdown";
import { cn } from "@/lib/utils";
import { colorClasses } from "@/lib/config/service-types-config";
import { formatKey } from "@/lib/constants/key";
import type { SetlistSong } from "@/lib/types";
import type {
  ProposedSetlistSong,
  SetlistAgentUIMessage,
} from "@/lib/agents/setlist/agent";

const SUGGESTIONS = [
  "Build a 5-song Sunday morning set",
  "Songs about grace, building toward communion",
  "Upbeat opener, then slower worship",
];

interface AiSetlistPanelProps {
  eventId: string;
  orgId: string;
  onApply: (songs: SetlistSong[]) => void;
  serviceColor: string;
}

export function AiSetlistPanel({
  eventId,
  orgId,
  onApply,
  serviceColor,
}: AiSetlistPanelProps) {
  const serviceColors = colorClasses[serviceColor];
  const [input, setInput] = useState("");
  const [timedOut, setTimedOut] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, stop, error } =
    useChat<SetlistAgentUIMessage>({
      transport: new DefaultChatTransport({
        api: "/api/setlist-ai",
        body: { eventId, orgId },
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
      : lastPart?.type === "tool-web_search" ||
          lastPart?.type === "tool-proposeSetlist"
        ? lastPart.state === "input-streaming" ||
          lastPart.state === "input-available"
        : false;
  const showBusy = isStreaming && !tailIsLive;

  // Keep the latest message in view as tokens stream in.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  function submit() {
    const text = input.trim();
    if (!text || isStreaming) return;
    setTimedOut(false);
    sendMessage({ text });
    setInput("");
  }

  // Map the server-validated proposal into draft songs (fresh ids + order).
  // Fresh rows are the Original; the editor carries a kept song's pick across.
  function applyProposal(songs: ProposedSetlistSong[]) {
    onApply(
      songs.map((s, idx) => ({
        id: crypto.randomUUID(),
        songId: s.songId,
        arrangementId: null,
        arrangementName: null,
        position: idx,
        pitch: s.pitch,
        keyQuality: s.keyQuality,
        bpm: s.bpm,
        timeSignature: s.timeSignature,
        title: s.title,
        artist: s.artist,
        youtubeUrl: s.youtubeUrl,
        spotifyUrl: s.spotifyUrl,
      })),
    );
  }

  return (
    <Card>
      <CardContent className="flex h-120 flex-col gap-3 p-3">
        <div
          ref={scrollRef}
          className="flex-1 space-y-4 overflow-y-auto pr-1"
        >
          {!hasMessages ? (
            <EmptyState onPick={setInput} serviceColors={serviceColors} />
          ) : (
            messages.map((m) => (
              <div key={m.id} className="space-y-2">
                {m.parts.map((part, i) => {
                  if (part.type === "text") {
                    if (!part.text) return null;
                    return m.role === "user" ? (
                      <UserBubble key={i} text={part.text} solid={serviceColors.solid} />
                    ) : (
                      <div
                        key={i}
                        className="text-xs leading-relaxed text-foreground"
                      >
                        <Markdown>{part.text}</Markdown>
                      </div>
                    );
                  }

                  if (part.type === "tool-proposeSetlist") {
                    switch (part.state) {
                      case "input-streaming":
                      case "input-available":
                        return isStreaming ? (
                          <AgentStep
                            key={i}
                            icon={ListMusic}
                            title="Building the setlist"
                            status="running"
                          />
                        ) : (
                          <AgentStep
                            key={i}
                            icon={ListMusic}
                            title="Stopped before the setlist was built"
                            status="error"
                          />
                        );
                      case "output-available":
                        return (
                          <ProposalCard
                            key={i}
                            output={part.output}
                            onApply={applyProposal}
                            serviceColors={serviceColors}
                          />
                        );
                      case "output-error":
                        return (
                          <AgentStep
                            key={i}
                            icon={ListMusic}
                            title="Couldn't build that setlist. Try rephrasing."
                            status="error"
                          />
                        );
                    }
                  }

                  if (part.type === "tool-web_search") {
                    const query =
                      typeof part.input?.query === "string"
                        ? ` for “${part.input.query}”`
                        : "";

                    switch (part.state) {
                      case "input-streaming":
                      case "input-available":
                        return isStreaming ? (
                          <AgentStep
                            key={i}
                            icon={Globe}
                            title={`Searching the web${query}`}
                            status="running"
                          />
                        ) : (
                          <AgentStep
                            key={i}
                            icon={Globe}
                            title="Search stopped"
                            status="error"
                          />
                        );
                      case "output-available":
                        return part.output.length > 0 ? (
                          <AgentStep
                            key={i}
                            icon={Globe}
                            title={`Searched the web${query}`}
                            description={`${part.output.length} ${
                              part.output.length === 1 ? "result" : "results"
                            }`}
                          >
                            <AgentSources sources={part.output} />
                          </AgentStep>
                        ) : (
                          <AgentStep
                            key={i}
                            icon={Globe}
                            title={`Searched the web${query}`}
                            description="No results"
                          />
                        );
                      case "output-error":
                        return (
                          <AgentStep
                            key={i}
                            icon={Globe}
                            title="Web search failed"
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
              {/AI requests/.test(error.message)
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
          placeholder="Describe the setlist…"
          sendClassName={cn(serviceColors.solid, serviceColors.solidHover)}
        />
      </CardContent>
    </Card>
  );
}

function ProposalCard({
  output,
  onApply,
  serviceColors,
}: {
  output: { title: string; note?: string; songs: ProposedSetlistSong[]; skipped: string[] };
  onApply: (songs: ProposedSetlistSong[]) => void;
  serviceColors: (typeof colorClasses)[string];
}) {
  const [applied, setApplied] = useState(false);

  if (output.songs.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No matching songs found in your library.
      </p>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <Music className={cn("h-3.5 w-3.5", serviceColors.badgeText)} />
        <p className="truncate text-xs font-semibold">{output.title}</p>
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
          {output.songs.length} songs
        </span>
      </div>

      {/* The model's explanation rides on the card: it stops at the proposal. */}
      {output.note && (
        <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">{output.note}</p>
      )}

      <ol className="space-y-1.5">
        {output.songs.map((s, idx) => (
          <li key={s.songId} className="flex items-start gap-2 text-xs">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-bold text-muted-foreground">
              {idx + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {s.title}
                <span className="ml-1 font-mono text-[11px] font-normal text-muted-foreground">
                  · {formatKey(s.pitch, s.keyQuality)} · {s.bpm}bpm
                </span>
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {s.reason}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <Button
        size="sm"
        className={cn(
          "mt-3 w-full cursor-pointer",
          serviceColors.solid,
          serviceColors.solidHover,
        )}
        onClick={() => {
          onApply(output.songs);
          setApplied(true);
        }}
      >
        {applied ? (
          <>
            <Check className="mr-1.5 h-3.5 w-3.5" />
            Applied to draft
          </>
        ) : (
          "Apply to setlist"
        )}
      </Button>

      {output.skipped.length > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {output.skipped.length} suggestion(s) skipped — not in your library.
        </p>
      )}
    </div>
  );
}

function UserBubble({ text, solid }: { text: string; solid: string }) {
  return (
    <div className="flex justify-end">
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-md px-3 py-1.5 text-xs text-primary-foreground",
          solid,
        )}
      >
        {text}
      </div>
    </div>
  );
}

function EmptyState({
  onPick,
  serviceColors,
}: {
  onPick: (text: string) => void;
  serviceColors: (typeof colorClasses)[string];
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-xl",
          serviceColors.badge,
        )}
      >
        <Sparkles className={cn("h-5 w-5", serviceColors.badgeText)} />
      </div>
      <div>
        <p className="text-sm font-medium">Generate a setlist</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Describe the vibe — I&apos;ll build it from your song library.
        </p>
      </div>
      <div className="w-full space-y-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className={cn(
              "w-full rounded-lg border border-border bg-card/50 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground",
              serviceColors.borderHover,
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
