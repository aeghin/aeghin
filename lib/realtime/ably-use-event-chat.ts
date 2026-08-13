"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Ably from "ably";
import { sendMessage, fetchOlderMessages } from "@/lib/actions/chat";
import { channelName } from "@/lib/realtime/channels";
import type {
  ChatMessage,
  ConnectionStatus,
  PresenceMember,
  UseEventChatOptions,
  UseEventChatReturn,
} from "./types";

export function useEventChat(
  eventId: string,
  { initial, canPost, me }: UseEventChatOptions,
): UseEventChatReturn {
  // initial is newest-first from the server; render oldest-first.
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    [...initial].reverse(),
  );
  const [presence, setPresence] = useState<PresenceMember[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [cursor, setCursor] = useState<string | null>(
    initial.length ? initial[initial.length - 1].id : null,
  );
  const [hasMore, setHasMore] = useState<boolean>(initial.length >= 30);

  // Append with id-dedupe (covers our own echoed publish vs. optimistic temp).
  const upsert = useCallback((incoming: ChatMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === incoming.id)) return prev;
      return [...prev, incoming];
    });
  }, []);

  useEffect(() => {
    const client = new Ably.Realtime({
      authUrl: `/api/realtime/ably/token?eventId=${eventId}`,
      clientId: me.id,
    });

    client.connection.on("connected", () => setStatus("connected"));
    client.connection.on("disconnected", () => setStatus("disconnected"));
    client.connection.on("suspended", () => setStatus("disconnected"));
    client.connection.on("failed", () => setStatus("disconnected"));

    const channel = client.channels.get(channelName(eventId));

    // .subscribe() implicitly attaches and rejects if teardown interrupts the
    // attach (StrictMode double-mount); the listener still binds synchronously.
    channel
      .subscribe("message", (msg) => upsert(msg.data as ChatMessage))
      .catch(() => {});

    const syncPresence = async () => {
      try {
        const members = await channel.presence.get();
        setPresence(
          members.map((p) => ({
            clientId: p.clientId,
            ...(p.data as Omit<PresenceMember, "clientId">),
          })),
        );
      } catch {
        // channel not attached yet / detached during teardown — ignore
      }
    };
    channel.presence
      .subscribe(["enter", "leave", "present"], syncPresence)
      .catch(() => {});
    // Enter presence only after WE attach the channel. enter() on an unattached
    // channel makes Ably fire an internal, un-catchable channel.attach()
    // (_enterOrUpdateClient) whose promise is discarded and rejects with
    // "Connection closed" on teardown mid-connect (StrictMode double-mount).
    // Gating on our own attach() — which we can catch — sidesteps it: once
    // attached, enter() goes straight to sendPresence.
    channel
      .attach()
      .then(async () => {
        if (canPost) {
          await channel.presence.enter({
            firstName: me.firstName,
            lastName: me.lastName,
            userImageUrl: me.userImageUrl,
          });
        }
        // Viewers hold a subscribe-only token and never enter, so no presence
        // event of their own fires — seed the roster once on attach or their
        // "N online" sits at 0 until someone else joins or leaves.
        await syncPresence();
      })
      .catch(() => {});

    return () => {
      // Remove listeners synchronously so no state updates fire post-unmount.
      channel.unsubscribe();
      channel.presence.unsubscribe();

      // Close in any state: the in-flight attach/enter/leave promises reject
      // with "Connection closed" when we tear down mid-connect (StrictMode's
      // dev double-mount), but each is caught, so closing is safe. The old
      // "defer close until connected" guard left those rejections unhandled and
      // leaked the client whenever it never reached the connected state.
      if (canPost) channel.presence.leave().catch(() => {});
      client.close();
    };
  }, [
    eventId,
    canPost,
    me.id,
    me.firstName,
    me.lastName,
    me.userImageUrl,
    upsert,
  ]);

  const sendOptimistic = useCallback(
    async (body: string) => {
      const tempId = `temp-${crypto.randomUUID()}`;
      const optimistic: ChatMessage = {
        id: tempId,
        body,
        createdAt: new Date().toISOString(),
        author: {
          id: me.id,
          firstName: me.firstName,
          lastName: me.lastName,
          userImageUrl: me.userImageUrl,
        },
      };
      setMessages((prev) => [...prev, optimistic]);

      const res = await sendMessage(eventId, { body });

      setMessages((prev) => {
        if (!res.success) return prev.filter((m) => m.id !== tempId); // roll back
        // Replace temp with persisted; drop dupes if the broadcast already landed.
        const withoutDupe = prev.filter(
          (m) => m.id !== tempId && m.id !== res.message.id,
        );
        return [...withoutDupe, res.message];
      });

      if (!res.success) throw new Error(res.error);
    },
    [eventId, me],
  );

  const loadOlder = useCallback(async () => {
    if (!cursor) return;
    const res = await fetchOlderMessages(eventId, cursor);
    if (!res.success) return;
    // older page is newest-first → reverse and prepend
    setMessages((prev) => [...[...res.messages].reverse(), ...prev]);
    setCursor(res.nextCursor);
    setHasMore(Boolean(res.nextCursor));
  }, [eventId, cursor]);

  return { messages, presence, status, sendOptimistic, loadOlder, hasMore };
}
