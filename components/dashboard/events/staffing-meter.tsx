import { statusStyles } from "@/lib/config/status";
import type { Staffing } from "@/lib/staffing";

/** Eight spots' worth of bar. A longer roster gets thinner segments instead. */
export const METER_MAX_WIDTH = 109;

/** The meter read aloud and on hover, since it carries no words of its own. */
function describeStaffing({ needed, filled, awaiting, declined }: Staffing) {
  return [
    `${filled} of ${needed} ${needed === 1 ? "spot" : "spots"} filled`,
    awaiting > 0 ? `${awaiting} pending` : null,
    declined > 0 ? `${declined} declined` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * How close an event is to being fully staffed — the All Events tab only,
 * matching the phone's meter.
 *
 * One segment per spot — three BGVs are three — in the roster's own status
 * colours: green filled, amber invited, red declined with nobody in their
 * place, grey nobody asked. Always in that order, so position still reads where
 * red and green look alike.
 */
export function StaffingMeter({ staffing }: { staffing: Staffing }) {
  const { needed, filled, awaiting, declined } = staffing;
  const label = describeStaffing(staffing);

  return (
    <div
      role="img"
      aria-label={label}
      title={label}
      className="flex gap-[3px]"
      style={{ width: Math.min(needed * 14 - 3, METER_MAX_WIDTH) }}
    >
      {Array.from({ length: needed }, (_, index) => (
        <div
          key={index}
          className={`h-1.5 flex-1 rounded-full ${
            index < filled
              ? statusStyles.ACCEPTED.dot
              : index < filled + awaiting
                ? statusStyles.PENDING.dot
                : index < filled + awaiting + declined
                  ? statusStyles.DECLINED.dot
                  : "bg-border"
          }`}
        />
      ))}
    </div>
  );
}
