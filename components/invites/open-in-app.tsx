"use client";

import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Hands a phone off to the app.
 *
 * The invitation email links to this page, so on a phone the invitee lands in
 * a browser even though the app is installed. Universal links would open the
 * app directly, but those need an associated-domains entitlement; the custom
 * scheme needs nothing and works on a tap.
 *
 * Rendered only where it can do something. Checked after mount rather than
 * from a server-read header so the markup stays the same for every visitor.
 */
export function OpenInApp({ token }: { token: string }) {
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    setIsPhone(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);

  if (!isPhone) return null;

  return (
    <a href={`aeghin://invite/${token}`} className="mt-4 block">
      <Button variant="outline" className="w-full cursor-pointer">
        <Smartphone className="mr-2 h-4 w-4" />
        Open in the aeghin app
      </Button>
    </a>
  );
}
