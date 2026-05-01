"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ScanForm() {
  const router = useRouter();
  const [target, setTarget] = useState("");
  const [email, setEmail] = useState("");
  const [auth, setAuth] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          email,
          mode: "red-team",
          authorizationConfirmed: auth,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Scan failed to start");
      router.push(`/scan/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
      <h2 className="text-xl font-bold">Run a Red Team scan</h2>
      <p className="text-sm text-slate-400">
        Enter a target you own. We&apos;ll do passive recon, probe live HTTP services, and run nuclei vuln templates
        (medium+). Typical scan: 2-5 minutes.
      </p>

      <label className="block">
        <span className="text-sm font-semibold mb-1 block">Target domain</span>
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="example.com"
          className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2.5 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 font-mono"
          required
        />
      </label>

      <label className="block">
        <span className="text-sm font-semibold mb-1 block">Your email (where we send the report)</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@business.com"
          className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2.5 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
          required
        />
      </label>

      <label className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 cursor-pointer">
        <input
          type="checkbox"
          checked={auth}
          onChange={(e) => setAuth(e.target.checked)}
          className="mt-0.5 shrink-0"
          required
        />
        <span className="text-sm text-amber-100">
          <strong className="block mb-1">I have authorization to scan this target.</strong>
          Unauthorized port scanning and vulnerability scanning is illegal in many jurisdictions. By checking this box
          you confirm you own this domain or have explicit written permission from the owner.
        </span>
      </label>

      {error && <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">{error}</div>}

      <button
        type="submit"
        disabled={submitting || !target || !email || !auth}
        className="w-full px-4 py-3 rounded-lg bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 disabled:opacity-40"
      >
        {submitting ? "Starting scan…" : "Run Red Team scan →"}
      </button>
    </form>
  );
}
