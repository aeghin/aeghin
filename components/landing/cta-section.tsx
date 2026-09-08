import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"

export function CTASection() {
  return (
    <section className="py-28 md:py-36">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="relative rounded-3xl overflow-hidden">
          {/* Background */}
          <div className="absolute inset-0 bg-linear-to-br from-primary/20 via-primary/10 to-transparent" />
          <div className="absolute inset-0 bg-card/80 backdrop-blur-sm" />
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-primary/5 rounded-full blur-2xl" />

          <div className="relative px-8 py-20 md:px-16 md:py-28 border border-border rounded-3xl">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-4xl font-bold tracking-tight sm:text-5xl text-balance">
                Ready to transform how your team coordinates?
              </h2>
              <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
                Set up your organization, invite your team, and schedule your first service in minutes.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/sign-up">
                  <Button size="lg" className="gap-2 px-8 h-14 text-base shadow-xl shadow-primary/25">
                    Get started for free
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
                <Link href="#pricing">
                  <Button variant="outline" size="lg" className="h-14 text-base bg-background/50">
                    View pricing
                  </Button>
                </Link>
              </div>
              <p className="mt-6 text-sm text-muted-foreground">
                No credit card required. Free to get started.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
