"use client"

import { useState } from "react"
import { Building2, Users, ArrowRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { CreateOrganizationModal } from "@/components/setup/create-organization-modal"
import type { InvitationNotice } from "@/lib/types"

import { useRouter } from "next/navigation";

import { UserButton } from "@clerk/nextjs"


import Link from "next/link"

interface SetupOptionsProps {
  invitations: InvitationNotice[]
}

export function SetupOptions({ invitations }: SetupOptionsProps) {
  const [createModalOpen, setCreateModalOpen] = useState(false);

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

            {/* Joining is by invitation only, so this card lists the ones waiting
                on this address rather than offering a search. */}
            <Card className="relative overflow-hidden border-2">
              <CardContent className="p-8">
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Users className="h-7 w-7" />
                </div>
                <h2 className="mb-2 text-xl font-semibold">Join Organization</h2>
                {invitations.length === 0 ? (
                  <p className="text-muted-foreground">
                    Ask an owner or admin to invite you by email. Your invitation will show up here.
                  </p>
                ) : (
                  <>
                    <p className="mb-4 text-muted-foreground">You&apos;ve been invited to join:</p>
                    <div className="space-y-2">
                      {invitations.map((invitation) => (
                        <Link
                          key={invitation.id}
                          href={`/invite/${invitation.token}`}
                          className="group flex items-center gap-3 rounded-xl border border-border/60 p-3 transition-all hover:border-primary"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold">{invitation.organizationName}</p>
                            {invitation.invitedByName && (
                              <p className="truncate text-xs text-muted-foreground">
                                Invited by {invitation.invitedByName}
                              </p>
                            )}
                          </div>
                          <ArrowRight className="h-4 w-4 shrink-0 text-primary transition-transform group-hover:translate-x-1" />
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <CreateOrganizationModal open={createModalOpen} onOpenChange={setCreateModalOpen} onSuccess={() => router.push('/dashboard')}/>
    </div>
  )
}
