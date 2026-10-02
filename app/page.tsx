
import type { Metadata } from "next"
import { LandingNavbar } from "@/components/landing/landing-navbar"
import { HeroSection } from "@/components/landing/hero-section"
import { FeaturesSection } from "@/components/landing/features-section"
import { HowItWorksSection } from "@/components/landing/how-it-works-section"
import { PricingSection } from "@/components/landing/pricing-section"
import { CTASection } from "@/components/landing/cta-section"
import { Footer } from "@/components/landing/footer"

const title = "Aeghin: worship team scheduling, setlists, and volunteers"
const description =
  "Schedule volunteers by the roles they actually play, build setlists from your own song library, and remind everyone on their phone the day before they serve. Free to start."

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, url: "/", siteName: "Aeghin", type: "website" },
  twitter: { card: "summary_large_image", title, description },
}

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <main>
        <HeroSection />
        <FeaturesSection />
        <HowItWorksSection />
        <PricingSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}
