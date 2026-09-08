import { Button } from "@/components/ui/button"
import { Check, Sparkles } from "lucide-react"
import Link from "next/link"

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "/month",
    description: "Core scheduling for your team",
    features: [
      "Create organizations, invite members, schedule events",
      "Event templates & service types",
      "Blockout dates & smart scheduling",
      "Song library with charts and audio",
      "Setlists & per-song assignments",
      "Event chat and email notifications",
    ],
    cta: "Get started free",
    popular: false,
  },
  {
    name: "AI Setlist Premium",
    price: "$39.99",
    period: "/month",
    description: "Let AI build the setlist from your catalog",
    features: [
      "Everything in Free",
      "AI setlist generation",
      "Matches themes, keys, and tempo arc",
      "Works strictly from your song catalog",
      "Apply proposals straight into the editor",
      "Billed per organization",
    ],
    cta: "Get started free",
    popular: true,
  },
  {
    name: "AI Setlist Pro",
    price: "$49.99",
    period: "/month",
    description: "Drafts whole events, and researches beyond your catalog",
    features: [
      "Everything in Premium",
      "AI event drafting with volunteer picks",
      "Upgraded, more capable AI model",
      "Web search for songs and artists",
      "Suggests songs you don't own yet",
      "Deeper music-theory reasoning",
      "Billed per organization",
    ],
    cta: "Get started free",
    popular: false,
  },
]

export function PricingSection() {
  return (
    <section id="pricing" className="py-28 md:py-36">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-20">
          <p className="text-sm font-semibold text-primary mb-4 tracking-wide uppercase">Pricing</p>
          <h2 className="text-4xl font-bold tracking-tight sm:text-5xl text-balance">Simple, transparent pricing</h2>
          <p className="mt-6 text-lg text-muted-foreground">
            Start free. The AI plans add setlist generation and event drafting
            on top.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl border bg-card p-8 flex flex-col ${
                plan.popular ? "border-primary shadow-xl shadow-primary/10 scale-105 lg:scale-110" : "border-border"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow-lg">
                    <Sparkles className="h-3.5 w-3.5" />
                    Most popular
                  </span>
                </div>
              )}

              <div className="mb-8">
                <h3 className="text-xl font-semibold mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-bold">{plan.price}</span>
                  {plan.period && <span className="text-muted-foreground">{plan.period}</span>}
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{plan.description}</p>
              </div>

              <ul className="space-y-4 mb-8 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm">
                    <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link href="/sign-up">
                <Button
                  className={`w-full h-12 ${plan.popular ? "shadow-lg shadow-primary/25" : ""}`}
                  variant={plan.popular ? "default" : "outline"}
                >
                  {plan.cta}
                </Button>
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-muted-foreground">
          Sign up free, then upgrade from your organization&apos;s dashboard. AI plans are per organization and can be
          started by an owner. AI usage is subject to plan limits.
        </p>
      </div>
    </section>
  )
}
