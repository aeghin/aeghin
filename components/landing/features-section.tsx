import {
  Activity,
  BellRing,
  CalendarCheck,
  CalendarOff,
  Mail,
  MessageSquare,
  Mic2,
  Music,
  Repeat,
  Smartphone,
  Sparkles,
  Users,
} from "lucide-react"
import { ROLE_ORDER, TEAM_ORDER, teamConfig } from "@/lib/config/roles"

const teamList = new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(
  TEAM_ORDER.map((team) => teamConfig[team].label),
)

const features = [
  {
    icon: Sparkles,
    title: "AI Setlists & Events",
    description:
      "On Premium, describe the service and get an ordered setlist from your own catalog. Pro also drafts whole events, with dates, roles, and volunteers who are actually free.",
  },
  {
    icon: CalendarCheck,
    title: "Smart Scheduling",
    description:
      "On Premium and Pro, turn it on for an event and declined spots refill themselves: the best eligible member for that role is invited, skipping anyone with a conflict or blockout.",
  },
  {
    icon: Users,
    title: "Roles & Teams",
    description: `${ROLE_ORDER.length} roles across ${teamList}, from pianist and BGVs to camera, lighting, and projection. People are only scheduled for the roles they actually serve in.`,
  },
  {
    icon: Repeat,
    title: "Event Templates",
    description:
      "Save your weekly service once — roles, location, time blocks, and rehearsal — then spin up the next one without retyping it.",
  },
  {
    icon: Music,
    title: "Song Library",
    description:
      "Keep your songs with their key, BPM, time signature, and themes. Attach charts and audio, and link straight to Spotify or YouTube.",
  },
  {
    icon: Mic2,
    title: "Key Journal",
    description:
      "Singers save the key they sang each song in, one tap from the event's setlist, so nobody has to work it out again before rehearsal.",
  },
  {
    icon: CalendarOff,
    title: "Blockout Dates",
    description:
      "Members mark the dates they're away. Those dates are blocked everywhere scheduling happens, so nobody gets assigned while on vacation.",
  },
  {
    icon: BellRing,
    title: "Staffing Alerts",
    description:
      "Leads hear when an event is fully staffed, or when someone declines or drops out and leaves a gap. On Premium and Pro, a last call goes out 3 days and 1 day before an event with open roles.",
  },
  {
    icon: MessageSquare,
    title: "Event Chat",
    description:
      "Every event gets its own realtime thread for the volunteers serving on it. Details stay with the event instead of scattered in group texts.",
  },
  {
    icon: Smartphone,
    title: "Mobile App",
    description:
      "Volunteers accept or decline, chat, and open the setlist from their phone, with a push reminder the day before they serve and a nudge before an invite expires.",
  },
  {
    icon: Mail,
    title: "Invites & Group Email",
    description:
      "Invite members by email, and reach your whole organization, or just the people serving on an event, in one send.",
  },
  {
    icon: Activity,
    title: "Activity Log",
    description:
      "See who was invited, who declined, and who Smart Scheduling brought in, so admins always know how a roster got the way it is.",
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="py-28 md:py-36 relative">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-secondary/30 to-transparent" />

      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-20">
          <p className="text-sm font-semibold text-primary mb-4 tracking-wide uppercase">Features</p>
          <h2 className="text-4xl font-bold tracking-tight sm:text-5xl text-balance">Everything your team needs</h2>
          <p className="mt-6 text-lg text-muted-foreground text-pretty">
            Built around how worship teams actually run a service: the roles, the songs, and the people who fill them.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group relative rounded-2xl border border-border bg-card p-6 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary mb-5 group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
