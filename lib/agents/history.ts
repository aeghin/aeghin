import type { UIMessage } from "ai";

/** How many messages of a chat go back to the model with each new one. */
const KEEP = 16;

/**
 * The part of a chat the model reads again. A short chat goes back whole, so
 * the cached prefix keeps holding. A long one keeps its latest messages from
 * a user turn on, with the reasoning dropped from what's left: a thinking
 * block belongs to the exact conversation that produced it, and a cut one no
 * longer is. Anything that isn't a list becomes an empty chat.
 */
export function trimHistory(messages: unknown): UIMessage[] {
  if (!Array.isArray(messages)) return [];

  const list = messages as UIMessage[];

  if (list.length <= KEEP) return list;

  let start = list.length - KEEP;

  while (start < list.length - 1 && list[start]?.role !== "user") start += 1;

  return list.slice(start).map((message) =>
    message.role === "assistant"
      ? { ...message, parts: message.parts.filter((part) => part.type !== "reasoning") }
      : message,
  );
}
