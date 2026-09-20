import { InvitationStatus } from "@/generated/prisma/enums";


export const statusStyles: Record<
  InvitationStatus,
  {
    label: string
    pill: string
    dot: string
    text: string
    ring: string
    badgeBg: string
    border: string
    bgSoft: string
  }
> = {
  ACCEPTED: {
    label: "Accepted",
    pill: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-500",
    dot: "bg-emerald-500",
    text: "text-emerald-500",
    ring: "ring-emerald-500/70",
    badgeBg: "bg-emerald-500",
    border: "border-emerald-500/40",
    bgSoft: "bg-emerald-500/2",
  },
  PENDING: {
    label: "Pending",
    pill: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-500",
    dot: "bg-amber-500",
    text: "text-amber-500",
    ring: "ring-amber-500/70",
    badgeBg: "bg-amber-500",
    border: "border-amber-500/40",
    bgSoft: "bg-amber-500/2",
  },
  DECLINED: {
    label: "Declined",
    pill: "bg-red-500/10 text-red-700 border-red-500/20 dark:text-red-500",
    dot: "bg-red-500",
    text: "text-red-500",
    ring: "ring-red-500/60",
    badgeBg: "bg-red-500",
    border: "border-red-500/40",
    bgSoft: "bg-red-500/2",
  },
  CANCELED: {
    label: "Canceled",
    pill: "bg-red-500/10 text-red-700 border-red-500/20 dark:text-red-500",
    dot: "bg-red-500",
    text: "text-red-500",
    ring: "ring-red-500/60",
    badgeBg: "bg-red-500",
    border: "border-red-500/40",
    bgSoft: "bg-red-500/2",
  },
  EXPIRED: {
    label: "Expired",
    pill: "bg-slate-500/10 text-slate-600 border-slate-500/20 dark:text-slate-400",
    dot: "bg-slate-500",
    text: "text-slate-500",
    ring: "ring-slate-500/50",
    badgeBg: "bg-slate-500",
    border: "border-slate-500/40",
    bgSoft: "bg-slate-500/2",
  },
}