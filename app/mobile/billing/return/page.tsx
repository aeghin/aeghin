import Link from "next/link";

import { MobileReturnRedirect } from "./redirect";

type Status = "success" | "cancel" | "portal";

const COPY: Record<Status, { title: string; body: string }> = {
  success: {
    title: "You're all set",
    body: "Your AI plan is active. Head back to the app to start building setlists.",
  },
  cancel: {
    title: "Checkout canceled",
    body: "Nothing was charged. You can pick a plan again from the app whenever you like.",
  },
  portal: {
    title: "Billing updated",
    body: "Any changes you made will show in the app in a moment.",
  },
};

/**
 * Where Stripe sends the phone after Checkout or the Customer Portal.
 *
 * The app opens Stripe in an auth session that closes the moment the page
 * navigates to the app's own scheme, so this page's only job is to do that
 * navigation — and to leave a button behind for a browser that blocked it.
 */
export default async function MobileBillingReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: raw } = await searchParams;
  const status: Status = raw === "cancel" || raw === "portal" ? raw : "success";
  const copy = COPY[status];
  const appUrl = `aeghin://settings/billing?checkout=${status}`;

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <MobileReturnRedirect href={appUrl} />
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 text-center">
        <h1 className="mb-2 text-2xl font-bold tracking-tight">{copy.title}</h1>
        <p className="mb-6 text-muted-foreground">{copy.body}</p>
        <Link
          href={appUrl}
          className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Back to aeghin
        </Link>
      </div>
    </main>
  );
}
