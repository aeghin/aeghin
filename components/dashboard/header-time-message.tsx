"use client"

import { useSyncExternalStore } from "react";

const noSubscription = () => () => {};

/**
 * The hour on the viewer's own clock, or null while server-rendering and
 * hydrating — the server's clock is UTC, and a greeting rendered there would
 * say "Good evening" over a Chicago afternoon.
 */
const useLocalHour = (): number | null =>
  useSyncExternalStore(
    noSubscription,
    () => new Date().getHours(),
    () => null,
  );

export const Greeting = ({ name }: { name: string }) => {

    const hour = useLocalHour();
    const greeting =
      hour === null ? null : hour < 4 ? "It's late-night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // Until the hour is known the line keeps its place, unread, rather than
  // showing a greeting for the wrong time of day.
  return (
    <h1 className="text-2xl font-bold tracking-tight">
        <span className={greeting ? undefined : "invisible"}>
          {`${greeting ?? "Good morning"}, ${name}`}
        </span>
    </h1>
  )
};
