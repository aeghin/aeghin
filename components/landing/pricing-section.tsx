import { Button, buttonVariants } from "@/components/ui/button"
import { Check, Sparkles } from "lucide-react"
import Link from "next/link"
import { LARGER_PLAN_MAILTO, PLAN_LIMITS, PLAN_PRICES, formatStorage, type OrgPlan } from "@/lib/config/plans"

const unlimited = (limit: number | null) => (limit === null ? "Unlimited" : String(limit))

// The same rows in the same order on every card, so the plans compare at a glance.
const limitRows: { label: string; value: (plan: OrgPlan) => string }[] = [
  { label: "Members", value: (plan) => String(PLAN_LIMITS[plan].members) },
  { label: "Songs", value: (plan) => unlimited(PLAN_LIMITS[plan].songs) },
  { label: "Service types", value: (plan) => unlimited(PLAN_LIMITS[plan].serviceTypes) },
  { label: "Storage", value: (plan) => formatStorage(PLAN_LIMITS[plan].storage) },
  { label: "Group emails a month", value: (plan) => String(PLAN_LIMITS[plan].bulkEmails) },
]

// What each plan adds beyond its numbers. `includes` names the plan it builds on.
const plans: {
  plan: OrgPlan
  name: string
  price: string
  description: string
  includes?: string
  features: string[]
  popular: boolean
}[] = [
  {
    plan: "free",
    name: "Free",
    price: "$0",
    description: "Core scheduling for your team",
    features: [
      "Scheduling, setlists and event chat",
      "Mobile app with day-before reminders",
      "Staffing alerts when a spot opens or fills",
    ],
    popular: false,
  },
  {
    plan: "starter",
    name: "Starter",
    price: PLAN_PRICES.starter,
    description: "Room to grow past the Free limits",
    includes: "Everything in Free",
    features: [],
    popular: false,
  },
  {
    plan: "premium",
    name: "Premium",
    price: PLAN_PRICES.premium,
    description: "Bigger teams, plus Smart Scheduling and AI setlists",
    includes: "Everything in Starter, plus",
    features: [
      "Smart Scheduling refills declined spots",
      "Last calls before an event that isn't staffed",
      `AI setlists from your song library, ${PLAN_LIMITS.premium.aiRuns} a month`,
    ],
    popular: true,
  },
  {
    plan: "pro",
    name: "Pro",
    price: PLAN_PRICES.pro,
    description: "Drafts whole events, and researches beyond your library",
    includes: "Everything in Premium, plus",
    features: [
      "AI drafts whole events and picks who's available",
      "A smarter AI that can search the web for songs",
    ],
    popular: false,
  },
]

export function PricingSection() {
  return (
    <section id="pricing" className="pt-28 pb-12 md:pt-36 md:pb-16">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-20">
          <p className="text-sm font-semibold text-primary mb-4 tracking-wide uppercase">Pricing</p>
          <h2 className="text-4xl font-bold tracking-tight sm:text-5xl text-balance">Simple, transparent pricing</h2>
          <p className="mt-6 text-lg text-muted-foreground">
            Start free. Starter raises the limits, Premium adds Smart Scheduling and AI
            setlists for bigger teams, and Pro adds AI event drafting on top.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 md:auto-rows-fr xl:grid-cols-4 gap-8 max-w-6xl xl:max-w-7xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl border bg-card p-8 flex flex-col ${
                plan.popular ? "border-primary shadow-xl shadow-primary/10" : "border-border"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow-lg">
                    <Sparkles className="h-3.5 w-3.5" />
                    Recommended
                  </span>
                </div>
              )}

              <div>
                <h3 className="text-xl font-semibold mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground md:min-h-10">{plan.description}</p>
              </div>

              <Link href="/sign-up" className="mt-6">
                <Button
                  className={`w-full h-12 ${plan.popular ? "shadow-lg shadow-primary/25" : ""}`}
                  variant={plan.popular ? "default" : "outline"}
                >
                  Get started free
                </Button>
              </Link>

              <dl className="my-6 divide-y divide-border border-y border-border text-sm">
                {limitRows.map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-3 py-2.5">
                    <dt className="text-muted-foreground">{row.label}</dt>
                    <dd className="font-semibold tabular-nums">{row.value(plan.plan)}</dd>
                  </div>
                ))}
              </dl>

              <div>
                {plan.includes && <p className="text-sm font-medium">{plan.includes}</p>}
                {plan.features.length > 0 && (
                  <ul className={`space-y-3 ${plan.includes ? "mt-3" : ""}`}>
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3 text-sm">
                        <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 max-w-6xl xl:max-w-7xl mx-auto flex flex-col gap-4 rounded-2xl border border-border bg-card p-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold">
              More than {PLAN_LIMITS.pro.members} people, or several campuses?
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Email us about your church, and we&apos;ll set up a plan with the room you need.
            </p>
          </div>
          <a href={LARGER_PLAN_MAILTO} className={buttonVariants({ variant: "outline", className: "h-12 px-6 shrink-0" })}>
            Email us
          </a>
        </div>

        <p className="mx-auto mt-10 max-w-3xl text-center text-sm text-muted-foreground text-balance">
          Sign up free, then upgrade from your organization&apos;s dashboard. Paid plans are per organization and can be
          started by an owner. Use one organization for your whole church.{" "}
          <Link href="/support#billing" className="whitespace-nowrap font-medium text-foreground underline underline-offset-4">
            How limits work
          </Link>
        </p>
      </div>
    </section>
  )
}
