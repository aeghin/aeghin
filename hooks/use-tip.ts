import { useEffect, useSyncExternalStore } from "react";

/** The one-time hints, each named for what it teaches. */
export type TipName =
  | "getStarted"
  | "pendingInvite"
  | "orderServices"
  | "removeRole"
  | "saveKey";

/**
 * Which goes first when two are due on one page. The next waits for the first
 * one's "Got it", so a page never carries more than one.
 */
const ORDER: TipName[] = [
  "getStarted",
  "pendingInvite",
  "orderServices",
  "removeRole",
  "saveKey",
];

/**
 * Raise it to show every hint again, to everyone: each "Got it" is saved under
 * the round it was given in, and an earlier round's are never read. The phone
 * counts its own.
 */
const ROUND = 2;

const keyFor = (tip: TipName, userId: string) => `tip.${ROUND}.${tip}.${userId}`;

/** The due hints on the page, whichever's turn it is. */
const onPage = new Set<TipName>();
/** This visit's "Got it"s, for a browser that won't store them. */
const dismissed = new Set<string>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  // A "Got it" in another tab arrives as a storage event.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function changed() {
  for (const listener of listeners) listener();
}

function isSeen(key: string) {
  if (dismissed.has(key)) return true;
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

const firstOnPage = () => ORDER.find((tip) => onPage.has(tip)) ?? null;

/**
 * A hint shown until its "Got it" is clicked, then never again for this
 * account in this browser, like the phone's. Best effort: a browser that won't
 * store it only brings the hint back on the next visit.
 *
 * The server has no browser storage to read, so it renders every hint as seen
 * and the browser shows the ones still due once the page hydrates.
 *
 * `when` says whether the page has the thing the hint points at. Even then it
 * waits its turn behind any hint before it in `ORDER`.
 */
export function useTip(tip: TipName, userId: string, when = true) {
  const key = keyFor(tip, userId);
  const seen = useSyncExternalStore(subscribe, () => isSeen(key), () => true);
  const turn = useSyncExternalStore(subscribe, firstOnPage, () => null);

  const due = when && !seen;

  // A page kept in the background drops its effects, so its hints stop
  // holding up the one in front of you.
  useEffect(() => {
    if (!due) return;
    onPage.add(tip);
    changed();
    return () => {
      onPage.delete(tip);
      changed();
    };
  }, [due, tip]);

  const dismiss = () => {
    dismissed.add(key);
    try {
      localStorage.setItem(key, "1");
    } catch {
      // Remembered for this visit only.
    }
    changed();
  };

  return { show: due && turn === tip, dismiss };
}
