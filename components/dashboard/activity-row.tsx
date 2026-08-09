import type { ReactNode } from "react";
import Link from "next/link";
import {
  CalendarClock,
  CalendarPlus,
  CalendarX,
  ChevronRight,
  Mail,
  MailX,
  TriangleAlert,
  UserCheck,
  UserCog,
  UserMinus,
  UserSearch,
  UserX,
  XCircle,
  Zap,
  ZapOff,
  type LucideIcon,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { AnimatedInvitationRow } from "@/components/dashboard/animated-invitation-row";
import { cn } from "@/lib/utils";
import { ActivityType } from "@/generated/prisma/enums";
import type { ActivityItem } from "@/lib/services/activity";

const activityConfig: Record<ActivityType, { icon: LucideIcon; className: string }> = {
  EVENT_CREATED: { icon: CalendarPlus, className: "bg-emerald-500/10 text-emerald-600" },
  EVENT_DELETED: { icon: CalendarX, className: "bg-destructive/10 text-destructive" },
  INVITE_SENT: { icon: Mail, className: "bg-sky-500/10 text-sky-600" },
  INVITE_ACCEPTED: { icon: UserCheck, className: "bg-emerald-500/10 text-emerald-600" },
  INVITE_DECLINED: { icon: XCircle, className: "bg-destructive/10 text-destructive" },
  INVITE_CANCELED: { icon: MailX, className: "bg-muted text-muted-foreground" },
  AUTO_INVITE_SENT: { icon: Zap, className: "bg-amber-500/10 text-amber-600" },
  MEMBER_REMOVED: { icon: UserX, className: "bg-destructive/10 text-destructive" },
  MEMBER_LEFT: { icon: UserMinus, className: "bg-muted text-muted-foreground" },
  ROLE_CHANGED: { icon: UserCog, className: "bg-violet-500/10 text-violet-600" },
  SMART_FILL_SKIPPED: { icon: ZapOff, className: "bg-muted text-muted-foreground" },
  SMART_FILL_NO_CANDIDATES: {
    icon: UserSearch,
    className: "bg-amber-500/10 text-amber-600",
  },
  SMART_FILL_ALL_UNAVAILABLE: {
    icon: CalendarClock,
    className: "bg-amber-500/10 text-amber-600",
  },
  SMART_FILL_FAILED: {
    icon: TriangleAlert,
    className: "bg-destructive/10 text-destructive",
  },
  SMART_SCHEDULING_ENABLED: {
    icon: Zap,
    className: "bg-emerald-500/10 text-emerald-600",
  },
  SMART_SCHEDULING_DISABLED: {
    icon: ZapOff,
    className: "bg-muted text-muted-foreground",
  },
};

const EventContext = ({ eventName }: { eventName: string | null }) =>
  eventName ? (
    <>
      {" "}
      on <span className="font-medium text-foreground">{eventName}</span>
    </>
  ) : null;

const Name = ({ children }: { children: ReactNode }) => (
  <span className="font-medium text-foreground">{children}</span>
);

const describeActivity = (item: ActivityItem): ReactNode => {
  switch (item.type) {
    case ActivityType.EVENT_CREATED:
      return (
        <>
          <Name>{item.actorName}</Name> created the event{" "}
          <Name>{item.eventName ?? item.targetName}</Name>
        </>
      );
    case ActivityType.EVENT_DELETED:
      return (
        <>
          <Name>{item.actorName}</Name> deleted the event <Name>{item.targetName}</Name>
        </>
      );
    case ActivityType.INVITE_SENT:
      return item.eventId ? (
        <>
          <Name>{item.actorName}</Name> sent invites for{" "}
          <Name>{item.eventName ?? item.targetName}</Name>
        </>
      ) : (
        <>
          <Name>{item.actorName}</Name> invited <Name>{item.targetName}</Name> to the
          organization
        </>
      );
    case ActivityType.INVITE_ACCEPTED:
      return (
        <>
          <Name>{item.actorName}</Name> accepted their invitation and joined
        </>
      );
    case ActivityType.INVITE_DECLINED:
      return (
        <>
          <Name>{item.actorName}</Name> declined their invitation
        </>
      );
    case ActivityType.INVITE_CANCELED:
      return (
        <>
          <Name>{item.actorName}</Name> canceled the invitation to{" "}
          <Name>{item.targetName}</Name>
        </>
      );
    case ActivityType.AUTO_INVITE_SENT:
      return item.actorName ? (
        <>
          Smart Scheduling invited <Name>{item.targetName}</Name> after{" "}
          <Name>{item.actorName}</Name> declined
          <EventContext eventName={item.eventName} />
        </>
      ) : (
        <>
          Smart Scheduling auto-invited <Name>{item.targetName}</Name>
        </>
      );
    case ActivityType.SMART_FILL_SKIPPED:
      return (
        <>
          <Name>{item.actorName}</Name> declined <Name>{item.targetName}</Name>
          <EventContext eventName={item.eventName} /> — auto-fill is off, so the slot
          is still open
        </>
      );
    case ActivityType.SMART_FILL_NO_CANDIDATES:
      return (
        <>
          Smart Scheduling couldn&apos;t fill <Name>{item.targetName}</Name>
          <EventContext eventName={item.eventName} /> — nobody in this organization
          has that role
        </>
      );
    case ActivityType.SMART_FILL_ALL_UNAVAILABLE:
      return (
        <>
          Smart Scheduling couldn&apos;t fill <Name>{item.targetName}</Name>
          <EventContext eventName={item.eventName} /> — everyone qualified is
          unavailable
        </>
      );
    case ActivityType.SMART_FILL_FAILED:
      return (
        <>
          Smart Scheduling hit an error filling <Name>{item.targetName}</Name>
          <EventContext eventName={item.eventName} /> after <Name>{item.actorName}</Name>{" "}
          declined
        </>
      );
    case ActivityType.SMART_SCHEDULING_ENABLED:
      return (
        <>
          <Name>{item.actorName}</Name> turned auto-fill on
          <EventContext eventName={item.eventName} />
        </>
      );
    case ActivityType.SMART_SCHEDULING_DISABLED:
      return (
        <>
          <Name>{item.actorName}</Name> turned auto-fill off
          <EventContext eventName={item.eventName} />
        </>
      );
    case ActivityType.MEMBER_REMOVED:
      return (
        <>
          <Name>{item.actorName}</Name> removed <Name>{item.targetName}</Name> from the
          organization
        </>
      );
    case ActivityType.MEMBER_LEFT:
      return (
        <>
          <Name>{item.actorName}</Name> left the organization
        </>
      );
    case ActivityType.ROLE_CHANGED:
      return item.actorName ? (
        <>
          <Name>{item.actorName}</Name> changed <Name>{item.targetName}</Name>&apos;s role
          to <Name>{item.detail}</Name>
        </>
      ) : (
        <>
          <Name>{item.targetName}</Name> was automatically promoted to{" "}
          <Name>{item.detail}</Name>
        </>
      );
  }
};

// Recent entries read best as relative ("3 hours ago"); older ones are clearer
// as an absolute date. The exact timestamp is always available on hover.
const formatActivityTime = (date: Date) => {
  const diffDays = (Date.now() - date.getTime()) / 86_400_000;
  return diffDays < 7
    ? formatDistanceToNow(date, { addSuffix: true })
    : format(date, "MMM d, yyyy");
};

interface ActivityRowProps {
  item: ActivityItem;
  index: number;
  organizationId: string;
}

export const ActivityRow = ({ item, index, organizationId }: ActivityRowProps) => {
  const config = activityConfig[item.type];
  const Icon = config.icon;

  // ROLE_CHANGED works its detail into the sentence itself.
  const supplementalDetail =
    item.type === ActivityType.ROLE_CHANGED ? null : item.detail;

  const body = (
    <>
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
          config.className
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 space-y-1">
        <p className="text-sm text-muted-foreground">{describeActivity(item)}</p>
        <p
          className="text-xs text-muted-foreground"
          title={format(item.createdAt, "PPpp")}
        >
          {formatActivityTime(item.createdAt)}
          {supplementalDetail && ` · ${supplementalDetail}`}
        </p>
      </div>
    </>
  );

  return (
    <AnimatedInvitationRow index={index}>
      {item.eventId ? (
        <Link
          href={`/dashboard/organizations/${organizationId}/events/${item.eventId}`}
          className="flex min-w-0 flex-1 items-start gap-4"
        >
          {body}
        </Link>
      ) : (
        <div className="flex min-w-0 items-start gap-4">{body}</div>
      )}
      {item.eventId && (
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </AnimatedInvitationRow>
  );
};
