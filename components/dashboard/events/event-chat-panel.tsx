"use client";

import { useEffect, useRef } from "react";
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

          <div className="space-y-3">
            {messages.map((m) => {
              const isMe = m.author.id === currentUserId;
              return (
                <div
                  key={m.id}
                  className={cn(
                    "flex items-end gap-2.5",
                    isMe && "flex-row-reverse",
                  )}
                >
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarImage
                      src={m.author.userImageUrl ?? undefined}
                      alt={`${m.author.firstName} ${m.author.lastName}`}
                    />
                    <AvatarFallback className="text-[10px] font-medium">
                      {m.author.firstName.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className={cn("max-w-[75%]", isMe && "text-right")}>
                    <p className="text-[11px] text-muted-foreground">
                      {isMe
                        ? "You"
                        : `${m.author.firstName} ${m.author.lastName}`}
                    </p>
                    <div
                      className={cn(
                        "mt-0.5 inline-block rounded-2xl px-3 py-1.5 text-sm",
                        isMe
                          ? cn(serviceColors.solid, "text-primary-foreground")
                          : "bg-muted text-foreground",
                        m.id.startsWith("temp-") && "opacity-60",
                      )}
                    >
                      {m.body}
                    </div>
                  </div>
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
