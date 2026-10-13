import { statusStyles } from "@/lib/config/status";
import type { RoleMeter } from "@/lib/staffing";

/**
 * One role's pill: the size they had when rosters were short. A bigger roster
 * runs the bar longer rather than squeezing every pill into a dot — the card
 * has the room.
 */
const SEGMENT_WIDTH = 11;

/** The meter read aloud and on hover, since it carries no words of its own. */
function describeMeter({ roles, filled, awaiting, needsAttention }: RoleMeter) {
  return [
    `${filled} of ${roles} ${roles === 1 ? "role" : "roles"} filled`,
    awaiting > 0 ? `${awaiting} pending` : null,
    needsAttention > 0 ? `${needsAttention} need${needsAttention === 1 ? "s" : ""} attention` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Where each role on an event stands — the All Events tab only, matching the
 * phone's meter.
 *
 * One segment per role, however many spots it has, in the roster's own status
 * colours: green when every spot accepted, amber while somebody's deciding,
 * red when a decline, cancel or expiry left a spot open, grey nobody asked.
 * Always in that order, so position still reads where red and green look
 * alike. The event page keeps the per-person count.
 */
export function StaffingMeter({ meter }: { meter: RoleMeter }) {
  const { roles, filled, awaiting, needsAttention } = meter;
  const label = describeMeter(meter);

  return (
    <div
      role="img"
      aria-label={label}
      title={label}
      className="flex gap-[3px]"
    >
      {Array.from({ length: roles }, (_, index) => (
        <div
          key={index}
          style={{ width: SEGMENT_WIDTH }}
          className={`h-1.5 shrink-0 rounded-full ${
            index < filled
              ? statusStyles.ACCEPTED.dot
              : index < filled + awaiting
                ? statusStyles.PENDING.dot
                : index < filled + awaiting + needsAttention
                  ? statusStyles.DECLINED.dot
                  : "bg-border"
          }`}
        />
      ))}
    </div>
  );
}
