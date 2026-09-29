import { BellRing } from "lucide-react";

import { teamLabel } from "@/lib/config/roles";
import { colorClasses } from "@/lib/config/service-types-config";
import { cn } from "@/lib/utils";
import type {
  TeamNotificationSettings,
  TeamPerson,
} from "@/lib/services/team-notifications";

interface TeamNotificationsOverviewProps {
  settings: TeamNotificationSettings;
  /** The signed-in user, named "you". */
  viewerId: string;
}

const fullName = (person: TeamPerson) => `${person.firstName} ${person.lastName}`;

/**
 * Staffing alerts as admins see them: who leads each team on every service
 * type, and who else gets a heads-up, all on one page with nothing to change.
 * Owners set it in `TeamNotificationsSettings`; an admin's lever is the event
 * forms, which can hand a team to someone else for that event only.
 */
export const TeamNotificationsOverview = ({
  settings,
  viewerId,
}: TeamNotificationsOverviewProps) => {
  const nameOf = (person: TeamPerson) =>
    person.userId === viewerId ? "You" : fullName(person);

  return (
    <section className="rounded-xl border border-border/40 bg-secondary/10 p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-2">
          <BellRing className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Staffing Alerts</h3>
        </div>
        <span className="text-xs text-muted-foreground">
          Only owners can change this
        </span>
      </div>

      {settings.serviceTypes.length === 0 ? (
        <p className="mt-3 text-sm italic text-muted-foreground">
          No service types yet.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {settings.serviceTypes.map((serviceType) => (
            <div key={serviceType.serviceTypeId}>
              <p className="flex items-center gap-1.5 text-xs font-semibold">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    colorClasses[serviceType.color]?.dot,
                  )}
                />
                {serviceType.name}
              </p>

              <dl className="mt-1.5 divide-y divide-border/40 overflow-hidden rounded-xl border border-border/40 bg-background/50">
                {serviceType.teams.map(({ team, lead, watchers }) => (
                  <div
                    key={team}
                    className="grid grid-cols-[6.5rem_1fr] gap-x-3 px-4 py-2 text-sm"
                  >
                    <dt className="font-medium">{teamLabel(team)}</dt>
                    <dd className="min-w-0">
                      <p className={cn(!lead && "text-muted-foreground")}>
                        {lead ? nameOf(lead) : "No lead · the event's creator"}
                      </p>
                      {watchers.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Also notify: {watchers.map(nameOf).join(", ")}
                        </p>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        You can hand a team to someone else for one event when you create or
        edit it.
      </p>
    </section>
  );
};
