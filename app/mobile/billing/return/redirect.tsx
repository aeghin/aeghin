"use client";

import { useEffect } from "react";

/** Hands the browser back to the app as soon as the page mounts. */
export function MobileReturnRedirect({ href }: { href: string }) {
  useEffect(() => {
    window.location.replace(href);
  }, [href]);

  return null;
}
