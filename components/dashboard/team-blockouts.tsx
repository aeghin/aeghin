import Link from "next/link";
import { Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBlockoutRange } from "@/lib/blockout-calendar";
import { capitalizeName } from "@/lib/names";
import type { TeamBlockout, TeamBlockoutPerson } from "@/lib/services/blockouts";

interface TeamBlockoutsProps {
  team: TeamBlockout[];
  /** The viewer, who reads as "You" among the names. */
  userId: string;
  organizationId: string;
  /** The church's today, as a day key. */
  today: string;
}

const fullName = (person: TeamBlockoutPerson) =>
  capitalizeName(`${person.firstName} ${person.lastName}`.trim());

/**
 * Who's away in the next 60 days, one row per stretch of days with everybody
 * away for exactly that stretch. Owners only — the page decides.
 * A row's pills are events it leaves with an open spot nobody free can take.
 */
export const TeamBlockouts = ({ team, userId, organizationId, today }: TeamBlockoutsProps) => (
  <Card className="overflow-hidden rounded-xl border-border/40 bg-linear-to-br from-card to-card/80 shadow-sm">
    <CardHeader className="flex flex-row items-center gap-3 border-b border-border/40 bg-secondary/20 px-6 py-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
        <Users className="h-5 w-5 text-primary" />
      </div>
      <div>
        <CardTitle className="text-lg font-semibold">Team blockouts</CardTitle>
        <p className="text-sm text-muted-foreground">
          Who&apos;s away in the next 60 days. Only owners see this.
        </p>
      </div>
    </CardHeader>

    <CardContent className="p-0">
      {team.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-muted-foreground">
          Nobody&apos;s away in the next 60 days.
        </p>
      ) : (
        <div className="divide-y divide-border/40">
          {team.map((group) => {
            // The viewer first, as "You"; everybody else as they appear.
            const people = [...group.people].sort(
              (a, b) => Number(b.userId === userId) - Number(a.userId === userId),
            );
            const names = people
              .map((person) => (person.userId === userId ? "You" : fullName(person)))
              .join(", ");

            return (
              <div
                key={`${group.startDate.getTime()}-${group.endDate.getTime()}`}
                className="flex flex-col gap-2 px-6 py-3.5 lg:flex-row lg:items-center lg:gap-4"
              >
                <p className="shrink-0 text-sm font-medium tabular-nums lg:w-64">
                  {formatBlockoutRange(group.startDate, group.endDate, today)}
                </p>

                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <div className="flex shrink-0">
                    {people.slice(0, 4).map((person, i) => (
                      <Avatar
                        key={person.userId}
                        className={`size-7 ring-2 ring-card ${i > 0 ? "-ml-2" : ""}`}
                      >
                        {person.userImageUrl && (
                          <AvatarImage src={person.userImageUrl} alt="" />
                        )}
                        <AvatarFallback className="bg-secondary text-[11px] font-semibold text-muted-foreground">
                          {person.firstName.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                  <p className="min-w-0 text-sm text-muted-foreground">{names}</p>
                </div>

                {group.gaps.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 lg:justify-end">
                    {group.gaps.map((gap) => (
                      <Link
                        key={gap.text}
                        href={`/dashboard/organizations/${organizationId}/events/${gap.eventId}`}
                        className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
                      >
                        <span aria-hidden className="size-1.5 rounded-full bg-amber-500" />
                        {gap.text}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </CardContent>
  </Card>
);
