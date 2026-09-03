"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { SignInButton, SignUpButton } from "@clerk/nextjs";

export function LandingNavbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled || mobileMenuOpen
          ? "bg-background/95 backdrop-blur-md border-b border-border"
          : "bg-transparent"
      }`}
    >
      <nav className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex h-20 items-center justify-between">
          <div className="flex items-center gap-10">
            <Link href="/" className="flex items-center gap-3 group">
              <img
                src="/aeghin-icon.svg"
                alt=""
                className="h-10 w-10 rounded-xl shadow-lg shadow-primary/25 group-hover:shadow-primary/40 transition-shadow"
              />
              <span className="font-brand text-2xl font-bold tracking-tight">aeghin</span>
            </Link>

            <div className="hidden lg:flex items-center gap-8">
              <Link
                href="#features"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Features
              </Link>
              <Link
                href="#how-it-works"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                How it works
              </Link>
              <Link
                href="#pricing"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Pricing
              </Link>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-3">
            <SignInButton forceRedirectUrl="/dashboard">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
              >
                Sign in
              </Button>
            </SignInButton>
            <SignUpButton forceRedirectUrl="/setup">
              <Button size="sm" className="shadow-lg shadow-primary/25">
                Get started free
              </Button>
            </SignUpButton>
          </div>

          <button
            type="button"
            className="lg:hidden p-2 -mr-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="lg:hidden py-6 border-t border-border animate-in slide-in-from-top-2 duration-200">
            <div className="flex flex-col gap-4">
              <Link
                href="#features"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-2"
              >
                Features
              </Link>
              <Link
                href="#how-it-works"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-2"
              >
                How it works
              </Link>
              <Link
                href="#pricing"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-2"
              >
                Pricing
              </Link>
              <div className="flex flex-col gap-3 pt-4 border-t border-border">
                <SignInButton forceRedirectUrl="/dashboard">
                  <Button variant="outline" className="w-full bg-transparent">
                    Sign in
                  </Button>
                </SignInButton>
                <SignUpButton forceRedirectUrl="/setup">
                  <Button className="w-full">Get started free</Button>
                </SignUpButton>
              </div>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
