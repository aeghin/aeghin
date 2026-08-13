export interface ChatMessage {
  id: string;
  body: string;
  createdAt: string; // ISO string (serializable across the wire + RSC boundary)
  author: {
    id: string;
    firstName: string;
    lastName: string;
    userImageUrl: string | null;
  };
}

export interface PresenceMember {
  clientId: string;
  firstName?: string;
  lastName?: string;
  userImageUrl?: string | null;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

/** Server-side fan-out contract. Each transport implements this. */
export interface RealtimeAdapter {
  publishMessage(eventId: string, message: ChatMessage): Promise<void>;
}

export interface UseEventChatOptions {
  initial: ChatMessage[];
  /** Accepted assignees write; ADMIN/OWNER previews are read-only. */
  canPost: boolean;
  me: {
    id: string;
    firstName: string;
    lastName: string;
    userImageUrl: string | null;
  };
}

export interface UseEventChatReturn {
  messages: ChatMessage[];
  presence: PresenceMember[];
  status: ConnectionStatus;
  sendOptimistic: (body: string) => Promise<void>;
  loadOlder: () => Promise<void>;
  hasMore: boolean;
}
