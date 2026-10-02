import Link from "next/link";
import { CurrentYear } from "@/components/year-date";
import { AppBadges } from "@/components/landing/app-badges";

const footerColumns = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "How it works", href: "#how-it-works" },
      { label: "Pricing", href: "#pricing" },
    ],
  },
  {
    title: "Help",
    links: [
      { label: "Support", href: "/support" },
      { label: "Contact us", href: "mailto:support@aeghin.com" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms & Conditions", href: "/terms" },
    ],
  },
]

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/50">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8 lg:py-20">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 lg:gap-12">
          <div className="col-span-2">
            <Link href="/" className="flex w-fit items-center gap-3 mb-6">
              <img
                src="/aeghin-icon.svg"
                alt=""
                className="h-10 w-10 rounded-xl shadow-lg shadow-primary/25"
              />
              <span className="font-brand text-2xl font-bold tracking-tight">aeghin</span>
            </Link>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              Scheduling, setlists, and team communication for worship teams and the churches they serve.
            </p>
            <AppBadges className="mt-6" />
          </div>

          {footerColumns.map((column) => (
            <div key={column.title}>
              <h4 className="text-sm font-semibold mb-4">{column.title}</h4>
              <ul className="space-y-3">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 pt-8 border-t border-border text-center md:text-left">
          <CurrentYear />
        </div>

        <p className="mt-6 text-xs text-muted-foreground/70 text-center md:text-left">
          Android is a trademark of Google LLC. The Android robot is reproduced or modified from work created and shared by
          Google and used according to terms described in the{" "}
          <a href="https://creativecommons.org/licenses/by/3.0/" className="underline hover:text-foreground">
            Creative Commons 3.0 Attribution License
          </a>
          .
        </p>
      </div>
    </footer>
  )
}
