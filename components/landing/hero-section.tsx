import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, Sparkles, Users, Calendar, Music } from "lucide-react"

export function HeroSection() {
  return (
    <section className="relative pt-32 pb-24 md:pt-44 md:pb-32 overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-gradient-to-b from-primary/8 via-primary/4 to-transparent rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-1/3 right-10 w-96 h-96 bg-primary/3 rounded-full blur-3xl" />
      </div>

      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-5 py-2 mb-8">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Now with AI event and setlist drafting</span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl text-balance leading-[1.1]">
            Organize your team.
            <span className="block bg-gradient-to-r from-primary via-primary to-primary/70 bg-clip-text text-transparent">
              Amplify your impact.
            </span>
          </h1>

          {/* Subheadline */}
          <p className="mt-8 text-xl text-muted-foreground max-w-2xl mx-auto text-pretty leading-relaxed">
            Aeghin is the modern platform for volunteer coordination. Manage events, assign roles, and keep your entire
            worship team in perfect harmony.
          </p>

          {/* CTAs */}
          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/sign-up">
              <Button
                size="lg"
                className="gap-2 px-8 h-14 text-base shadow-xl shadow-primary/25 hover:shadow-primary/40 transition-shadow"
              >
                Start for free
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <Link href="#how-it-works">
              <Button variant="outline" size="lg" className="gap-2 h-14 text-base bg-background/50 backdrop-blur-sm">
                See how it works
              </Button>
            </Link>
          </div>

          <p className="mt-8 text-sm text-muted-foreground">
            Free to use. No credit card required.
          </p>
        </div>

        {/* Feature preview cards */}
        <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <div className="group relative rounded-2xl border border-border bg-card/50 backdrop-blur-sm p-6 hover:border-primary/50 hover:bg-card transition-all duration-300">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4 group-hover:scale-110 transition-transform">
              <Users className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold mb-1">Team Management</h3>
            <p className="text-sm text-muted-foreground">Invite members and assign the roles they play</p>
          </div>
          <div className="group relative rounded-2xl border border-border bg-card/50 backdrop-blur-sm p-6 hover:border-primary/50 hover:bg-card transition-all duration-300">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4 group-hover:scale-110 transition-transform">
              <Calendar className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold mb-1">Event Scheduling</h3>
            <p className="text-sm text-muted-foreground">Templates, blockout dates, and automatic refills</p>
          </div>
          <div className="group relative rounded-2xl border border-border bg-card/50 backdrop-blur-sm p-6 hover:border-primary/50 hover:bg-card transition-all duration-300">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4 group-hover:scale-110 transition-transform">
              <Music className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold mb-1">Songs & Setlists</h3>
            <p className="text-sm text-muted-foreground">Build setlists from your catalog, or let AI draft them</p>
          </div>
        </div>
      </div>
    </section>
  )
}
