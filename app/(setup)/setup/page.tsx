"use client"

import { useState } from "react"
import { Building2, Users, ArrowRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { CreateOrganizationModal } from "@/components/setup/create-organization-modal"
import { JoinOrganizationModal } from "@/components/setup/join-organization-modal"

import { useRouter } from "next/navigation";

import { UserButton } from "@clerk/nextjs"


import Link from "next/link"

export default function SetupPage() {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);

  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <img
              src="/aeghin-icon.svg"
              alt=""
              className="h-8 w-8 rounded-lg shadow-lg shadow-primary/25"
            />
            <span className="font-brand text-lg font-semibold">aeghin</span>
          </Link>
          <UserButton />
        </div>
      </header>

     
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl">
          <div className="mb-10 text-center">
            <h1 className="mb-3 text-3xl font-bold tracking-tight">Welcome to Aeghin</h1>
            <p className="text-lg text-muted-foreground">
              Get started by creating a new organization or joining an existing one.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <Card
              className="group relative cursor-pointer overflow-hidden border-2 transition-all hover:border-primary hover:shadow-lg"
              onClick={() => setCreateModalOpen(true)}
            >
              <CardContent className="p-8">
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform group-hover:scale-110">
                  <Building2 className="h-7 w-7" />
                </div>
                <h2 className="mb-2 text-xl font-semibold">Create Organization</h2>
                <p className="mb-6 text-muted-foreground">
                  Start fresh and invite members to join your new organization.
                </p>
                <div className="flex items-center text-sm font-medium text-primary">
                  Get Started
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </CardContent>
            </Card>

            <Card
              className="group relative cursor-pointer overflow-hidden border-2 transition-all hover:border-primary hover:shadow-lg"
              onClick={() => setJoinModalOpen(true)}
            >
              <CardContent className="p-8">
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform group-hover:scale-110">
                  <Users className="h-7 w-7" />
                </div>
                <h2 className="mb-2 text-xl font-semibold">Join Organization</h2>
                <p className="mb-6 text-muted-foreground">Search for an existing organization or use an invite code.</p>
                <div className="flex items-center text-sm font-medium text-primary">
                  Find Organization
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </CardContent>
            </Card>
          </div>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            Need help getting started?{" "}
            <Link href="#" className="font-medium text-primary hover:underline">
              View our guide
            </Link>
          </p>
        </div>
      </main>

      <CreateOrganizationModal open={createModalOpen} onOpenChange={setCreateModalOpen} onSuccess={() => router.push('/dashboard')}/>
      <JoinOrganizationModal open={joinModalOpen} onOpenChange={setJoinModalOpen} />
    </div>
  )
}
