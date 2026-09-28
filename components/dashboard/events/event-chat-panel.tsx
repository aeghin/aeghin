"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { MessagesSquare, SendHorizontal } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { colorClasses } from "@/lib/config/service-types-config";
import { useEventChat } from "@/lib/realtime/use-event-chat";
import type { ChatMessage } from "@/lib/realtime/types";

/** One person's messages this close together read as a single run. */
const RUN_MINUTES = 5;
/** A pause this long, or a new day, earns a time divider. */
const DIVIDER_MINUTES = 15;

const TIME: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

function minutesApart(a: string, b: string): number {
  return Math.abs(Date.parse(b) - Date.parse(a)) / 60_000;
}

function startOfDay(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

/**
 * `"Today 3:42 PM"`, `"Yesterday 9:10 AM"`, `"Saturday 3:42 PM"` within the
 * week, then `"Sat, Sep 20 · 3:42 PM"`. The viewer's time zone.
 */
function formatDivider(value: string, now = new Date()): string {
  const date = new Date(value);
  const time = date.toLocaleTimeString("en-US", TIME);
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  if (days > 1 && days < 7) {
    return `${date.toLocaleDateString("en-US", { weekday: "long" })} ${time}`;
  }

  const day = date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });

  return `${day} · ${time}`;
}

/**
 * Where a message falls on a calendar depends on the viewer's time zone, which
 * the server rendering this panel doesn't know. Until hydration is over, the
 * day rule sits out and dividers hold their line without a label.
 */
function needsDivider(
  before: ChatMessage | undefined,
  message: ChatMessage,
  hydrated: boolean,
): boolean {
  return (
    !before ||
    minutesApart(before.createdAt, message.createdAt) >= DIVIDER_MINUTES ||
    (hydrated &&
      startOfDay(new Date(before.createdAt)) !==
        startOfDay(new Date(message.createdAt)))
  );
}

function startsRun(
  before: ChatMessage | undefined,
  message: ChatMessage,
  hydrated: boolean,
): boolean {
  return (
    !before ||
    needsDivider(before, message, hydrated) ||
    before.author.id !== message.author.id ||
    minutesApart(before.createdAt, message.createdAt) >= RUN_MINUTES
  );
}

/**
 * Where a message sits among its neighbours: `first` heads a run of one
 * person's messages and carries their name, `last` ends it and carries their
 * avatar, and `divider` puts a time above it.
 */
function placeMessage(
  before: ChatMessage | undefined,
  message: ChatMessage,
  after: ChatMessage | undefined,
  hydrated: boolean,
) {
  return {
    first: startsRun(before, message, hydrated),
    last: !after || startsRun(message, after, hydrated),
    divider: needsDivider(before, message, hydrated),
  };
}

const noSubscription = () => () => {};

/** False while server-rendering and hydrating, true once in the browser. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

interface EventChatPanelProps {
  eventId: string;
  currentUserId: string;
  canPost: boolean;
  me: { firstName: string; lastName: string; userImageUrl: string | null };
  initialMessages: ChatMessage[];
  serviceColor: string;
}

export function EventChatPanel({
  eventId,
  currentUserId,
  canPost,
  me,
  initialMessages,
  serviceColor,
}: EventChatPanelProps) {
  const serviceColors = colorClasses[serviceColor];
  const hydrated = useHydrated();

  const { messages, presence, status, sendOptimistic, loadOlder, hasMore } =
    useEventChat(eventId, {
      initial: initialMessages,
      canPost,
      me: { id: currentUserId, ...me },
    });

  const bottomRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend() {
    const el = draftRef.current;
    const body = el?.value.trim();
    if (!el || !body) return;
    el.value = "";
    try {
      await sendOptimistic(body);
    } catch {
      toast.error("Couldn't send your message. Try again.");
    }
  }

  return (
    <Card className="flex h-112 flex-col overflow-hidden">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <MessagesSquare className="h-4 w-4 text-muted-foreground" />
          Event Chat
        </CardTitle>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              status === "connected"
                ? "bg-emerald-500"
                : "bg-muted-foreground/40",
            )}
          />
          {presence.length} online
        </span>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pb-3">
        <ScrollArea className="min-h-0 flex-1 pr-3">
          {hasMore && (
            <button
              type="button"
              onClick={loadOlder}
              className="mx-auto mb-2 block text-xs text-muted-foreground hover:text-foreground"
            >
              Load earlier messages
            </button>
          )}

          {/* Laid out the way messaging apps group them: a run of one
              person's messages carries their name above the first bubble and
              their avatar beside the last, and times live in dividers between
              pauses rather than on every message. Hovering shows a bubble's
              own time. The viewer's own sit right in the service colour with
              no name or avatar — the side and the colour say whose they are. */}
          <div>
            {messages.map((m, i) => {
              const isMe = m.author.id === currentUserId;
              const pending = m.id.startsWith("temp-");
              const place = placeMessage(
                messages[i - 1],
                m,
                messages[i + 1],
                hydrated,
              );

              return (
                <div
                  key={m.id}
                  className={place.first ? "mt-3 first:mt-0" : "mt-0.5"}
                >
                  {place.divider && (
                    <p className="mt-2 mb-3 text-center text-[11px] font-medium text-muted-foreground">
                      {hydrated ? formatDivider(m.createdAt) : "\u00a0"}
                    </p>
                  )}

                  {!isMe && place.first && (
                    <p className="mb-1 ml-12 truncate text-xs font-medium text-muted-foreground">
                      {m.author.firstName} {m.author.lastName}
                    </p>
                  )}

                  <div
                    className={cn(
                      "flex items-end gap-2",
                      isMe && "justify-end",
                    )}
                  >
                    {!isMe &&
                      (place.last ? (
                        <Avatar className="h-7 w-7 shrink-0">
                          <AvatarImage
                            src={m.author.userImageUrl ?? undefined}
                            alt={`${m.author.firstName} ${m.author.lastName}`}
                          />
                          <AvatarFallback className="text-[10px] font-medium">
                            {m.author.firstName.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                      ) : (
                        <div className="w-7 shrink-0" />
                      ))}

                    <div
                      title={
                        hydrated && !pending
                          ? new Date(m.createdAt).toLocaleString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              ...TIME,
                            })
                          : undefined
                      }
                      className={cn(
                        "max-w-[75%] rounded-2xl px-3 py-1.5 text-sm whitespace-pre-wrap break-words",
                        // Square where bubbles in a run meet on the sender's
                        // side; the foot stays squared as the tail.
                        isMe
                          ? cn(
                              "rounded-br-md",
                              !place.first && "rounded-tr-md",
                              serviceColors.solid,
                              "text-primary-foreground",
                            )
                          : cn(
                              "rounded-bl-md",
                              !place.first && "rounded-tl-md",
                              "bg-border text-foreground",
                            ),
                        pending && "opacity-60",
                      )}
                    >
                      {m.body}
                    </div>
                  </div>

                  {pending && place.last && (
                    <p
                      className={cn(
                        "mt-1 text-[11px] text-muted-foreground",
                        isMe ? "mr-1 text-right" : "ml-12",
                      )}
                    >
                      Sending…
                    </p>
                  )}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {canPost ? (
          <div className="flex items-end gap-2">
            <Textarea
              ref={draftRef}
              rows={1}
              placeholder="Message the team…"
              className="max-h-28 min-h-9 resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button
              size="icon"
              className={cn(serviceColors.solid, serviceColors.solidHover)}
              onClick={handleSend}
              aria-label="Send"
            >
              <SendHorizontal className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <p className="rounded-md bg-muted/50 px-3 py-2 text-center text-xs text-muted-foreground">
            You&apos;re previewing this chat as an organizer. Only assigned
            volunteers can reply.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
