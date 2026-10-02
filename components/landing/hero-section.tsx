import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { ArrowRight, Sparkles } from "lucide-react"
import { AppBadges } from "@/components/landing/app-badges"
import eventPage from "@/public/landing/event-page.png"

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
        <div className="mx-auto max-w-5xl text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-5 py-2 mb-8">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Now with AI event and setlist drafting</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl text-balance leading-[1.1]">
            Your worship team, scheduled.
            <span className="block bg-gradient-to-r from-primary via-primary to-primary/70 bg-clip-text text-transparent">
              Without the group texts.
            </span>
          </h1>

          {/* Subheadline */}
          <p className="mt-8 text-xl text-muted-foreground max-w-2xl mx-auto text-pretty leading-relaxed">
            Aeghin schedules volunteers by the roles they actually play, builds setlists from your own song library,
            and reminds everyone on their phone the day before they serve.
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
            Free to get started. No credit card required.
          </p>

          <AppBadges className="mt-8 justify-center" />
        </div>

        {/* Product screenshot */}
        <div className="relative mx-auto mt-20 max-w-5xl md:mt-24">
          <div className="absolute -inset-x-6 -top-6 bottom-1/3 -z-10 rounded-[2.5rem] bg-primary/10 blur-3xl" />
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-primary/10 [mask-image:linear-gradient(to_bottom,black_70%,transparent)] md:rounded-2xl">
            <Image
              src={eventPage}
              alt="An Aeghin event page for Communion Sunday, showing the date, rehearsal, Smart Scheduling auto-fill, and the band roster"
              placeholder="blur"
              sizes="(min-width: 1024px) 1024px, 100vw"
              className="h-auto w-full"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
