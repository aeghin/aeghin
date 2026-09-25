import "server-only";

import { ablyAdapter } from "./ably-adapter";
import type { RealtimeAdapter } from "./types";

// Swap transports here (or by env): pusherAdapter / partykitAdapter later.
// Callers only ever import from this module, never from an adapter.
const adapter: RealtimeAdapter = ablyAdapter;

export const publishMessage = adapter.publishMessage;
export const presentUserIds = adapter.presentUserIds;
