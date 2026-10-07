"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Ably from "ably";
import {
  sendMessage,
  fetchOlderMessages,
  fetchLatestMessages,
} from "@/lib/actions/chat";
import { channelName } from "@/lib/realtime/channels";
import type {
  ChatMessage,
  ConnectionStatus,
  PresenceMember,
  UseEventChatOptions,
  UseEventChatReturn,
} from "./types";

const isSending = (m: ChatMessage) => m.id.startsWith("temp-");

/** Oldest first, as the server orders them; the id breaks a same-millisecond tie. */
function byPosted(a: ChatMessage, b: ChatMessage): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/** The newest message the server has saved, skipping any still sending. */
function newestSavedId(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (!isSending(messages[i])) return messages[i].id;
  }
  return null;
}

/**
 * Folds the server's newest page (oldest first) into what the chat holds after
 * being away. A union by id, so live messages that landed during the fetch stay
 * and the overlap dedupes. On a restart — the page doesn't reach back to what
 * was held — held messages older than the page are dropped rather than left
 * across a hole; "Load earlier messages" brings them back. Messages still
 * sending stay last.
 */
function foldLatestPage(
  held: ChatMessage[],
  page: ChatMessage[],
  restart: boolean,
): ChatMessage[] {
  const saved = new Map<string, ChatMessage>();
  for (const m of page) saved.set(m.id, m);
  for (const m of held) if (!isSending(m)) saved.set(m.id, m);

  const oldest = page[0];
  const kept = [...saved.values()].filter(
    (m) => !restart || !oldest || byPosted(m, oldest) >= 0,
  );

  return [...kept.sort(byPosted), ...held.filter(isSending)];
}

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

  // What the chat holds as of the last commit, for the catch-up below to read
  // without re-subscribing on every message.
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Next keeps a visited page mounted but hidden (Activity), which tears the
  // subscription below down — so connecting a second time means this chat was
  // away and missed whatever was posted meanwhile.
  const connectedBefore = useRef(false);

  // Append with id-dedupe (covers our own echoed publish vs. optimistic temp).
  const upsert = useCallback((incoming: ChatMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === incoming.id)) return prev;
      return [...prev, incoming];
    });
  }, []);

  useEffect(() => {
    // Read before re-subscribing, so no live message can stand in for one that
    // was missed.
    const returning = connectedBefore.current;
    const anchorId = newestSavedId(messagesRef.current);
    connectedBefore.current = true;
    let active = true;

    // Best-effort: if it fails, the chat stays exactly as it was.
    const catchUp = async () => {
      try {
        const res = await fetchLatestMessages(eventId);
        if (!active || !res.success) return;

        const page = [...res.messages].reverse();
        // The page covers everything missed only if it reaches back to the
        // newest message held before.
        const restart =
          anchorId === null || !page.some((m) => m.id === anchorId);

        setMessages((prev) => foldLatestPage(prev, page, restart));
        if (restart) {
          setCursor(res.nextCursor);
          setHasMore(Boolean(res.nextCursor));
        }
      } catch {
        // Network or server error — leave the chat as it is.
      }
    };

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

    const enterPresence = () =>
      channel.presence.enter({
        firstName: me.firstName,
        lastName: me.lastName,
        userImageUrl: me.userImageUrl,
      });

    // Present means looking. The server skips phone pushes for anyone present,
    // so a tab left open in the background mustn't count.
    let away = document.hidden;
    const onVisibility = () => {
      if (!canPost || document.hidden === away) return;
      away = document.hidden;
      if (away) channel.presence.leave().catch(() => {});
      else channel.attach().then(enterPresence).catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Enter presence only after WE attach the channel. enter() on an unattached
    // channel makes Ably fire an internal, un-catchable channel.attach()
    // (_enterOrUpdateClient) whose promise is discarded and rejects with
    // "Connection closed" on teardown mid-connect (StrictMode double-mount).
    // Gating on our own attach() — which we can catch — sidesteps it: once
    // attached, enter() goes straight to sendPresence.
    channel
      .attach()
      .then(async () => {
        // After attach, so anything posted from here on arrives live and the
        // union in foldLatestPage absorbs the overlap. Not awaited: presence
        // shouldn't wait on it.
        if (returning) void catchUp();
        if (canPost && !away) await enterPresence();
        // Viewers hold a subscribe-only token and never enter, so no presence
        // event of their own fires — seed the roster once on attach or their
        // "N online" sits at 0 until someone else joins or leaves.
        await syncPresence();
      })
      .catch(() => {});

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibility);
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
