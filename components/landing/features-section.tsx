import { Calendar, Users, Music, Mail, CalendarOff, Sparkles, MessageSquare, Repeat } from "lucide-react"

const features = [
  {
    icon: Sparkles,
    title: "AI Setlists & Events",
    description:
      "Describe the service and get an ordered setlist from your own catalog — or a whole event drafted, with dates, roles, and volunteers who are actually free.",
  },
  {
    icon: Music,
    title: "Song Library",
    description:
      "Keep your songs with their key, BPM, time signature, and themes. Attach charts and audio, and link straight to Spotify or YouTube.",
  },
  {
    icon: Repeat,
    title: "Event Templates",
    description:
      "Save your weekly service once — roles, location, and multi-day time blocks — then spin up the next one without retyping it.",
  },
  {
    icon: CalendarOff,
    title: "Blockout Dates",
    description:
      "Members mark the dates they're away. Those dates are blocked everywhere scheduling happens, so nobody gets assigned while on vacation.",
  },
  {
    icon: Calendar,
    title: "Smart Scheduling",
    description:
      "When someone declines, the best eligible member for that role is found automatically — skipping anyone with a conflict or blockout.",
  },
  {
    icon: MessageSquare,
    title: "Event Chat",
    description:
      "Every event gets its own realtime thread for the volunteers serving on it. Details stay with the event instead of scattered in group texts.",
  },
  {
    icon: Users,
    title: "Volunteer Roles",
    description:
      "Guitarist, pianist, aux keys, drummer, lead vocalist, BGVs, bassist, sound tech, usher, and greeter — assign people to what they actually play.",
  },
  {
    icon: Mail,
    title: "Email Invites & Updates",
    description:
      "Invite members by email, notify them when they're scheduled, and reach your whole organization in one send.",
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
            Powerful tools designed specifically for worship teams, churches, and community organizations.
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
