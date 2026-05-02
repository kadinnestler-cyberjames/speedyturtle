"use client";

import { useEffect, useState } from "react";

/**
 * Render a timestamp in the visitor's local timezone without triggering
 * a React hydration mismatch. On SSR we emit an ISO-truncated string the
 * client also produces; on first effect the client swaps it for a
 * locale-formatted string. Both passes render the same DOM during
 * hydration, then the locale version replaces it on the next paint.
 */
export function ClientTimestamp({ iso }: { iso: string }) {
  // The default we render on both server and first client paint must be
  // identical to avoid the hydration warning. Truncate the ISO to minutes,
  // swap the T for a space.
  const stable = iso.slice(0, 16).replace("T", " ") + "Z";

  const [pretty, setPretty] = useState<string | null>(null);

  useEffect(() => {
    try {
      setPretty(new Date(iso).toLocaleString());
    } catch {
      // ignore — fall back to the stable string
    }
  }, [iso]);

  return (
    <time dateTime={iso} suppressHydrationWarning>
      {pretty ?? stable}
    </time>
  );
}
