"use client";

import { useState } from "react";

type Accent = "slate" | "emerald" | "sky" | "amber";

const ACCENT_BG: Record<Accent, string> = {
  slate: "bg-slate-700 hover:bg-slate-600 text-slate-50",
  emerald: "bg-emerald-500 hover:bg-emerald-400 text-slate-950",
  sky: "bg-sky-500 hover:bg-sky-400 text-slate-950",
  amber: "bg-amber-500 hover:bg-amber-400 text-slate-950",
};

export function CheckoutButton({
  tier,
  label,
  accent,
}: {
  tier: "starter" | "pro" | "unlimited";
  label: string;
  accent: Accent;
}) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email || !email.includes("@")) {
      setError("Enter a valid email");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/checkout/${tier}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Checkout failed (${res.status})`);
      }
      if (!data?.url) {
        throw new Error("No checkout URL returned");
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@business.com"
        className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
        required
        disabled={submitting}
      />
      <button
        type="submit"
        disabled={submitting}
        className={`w-full px-4 py-2.5 rounded-lg font-bold text-sm disabled:opacity-50 ${ACCENT_BG[accent]}`}
      >
        {submitting ? "Redirecting…" : label}
      </button>
      {error && (
        <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-md px-2 py-1.5">
          {error}
        </div>
      )}
    </form>
  );
}
