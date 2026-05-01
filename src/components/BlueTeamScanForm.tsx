"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BlueTeamScanForm() {
  const router = useRouter();
  const [target, setTarget] = useState("");
  const [email, setEmail] = useState("");
  const [auth, setAuth] = useState(false);
  const [originalScanId, setOriginalScanId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (originalScanId.trim()) {
        router.push(`/blue-team/scan/${originalScanId.trim()}`);
        return;
      }
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, email, mode: "blue-team", authorizationConfirmed: auth }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Scan failed to start");
      router.push(`/blue-team/scan/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  const skipScan = originalScanId.trim().length > 0;

  return (
    <form onSubmit={submit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
      <div>
        <label className="block">
          <span className="text-sm font-semibold mb-1 block">Existing Red Team scan ID (optional)</span>
          <input
            value={originalScanId}
            onChange={(e) => setOriginalScanId(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2.5 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 font-mono text-sm"
          />
          <span className="text-xs text-slate-400 mt-1 block">
            If provided, we&apos;ll skip a new scan and load the hardening plan for that one.
          </span>
        </label>
      </div>

      <div className="border-t border-slate-800 pt-4">
        <p className="text-sm text-slate-400 mb-3">Otherwise, run a fresh scan and we&apos;ll generate a hardening plan from it:</p>

        <label className="block mb-3">
          <span className="text-sm font-semibold mb-1 block">Target domain</span>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="example.com"
            disabled={skipScan}
            className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2.5 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 font-mono disabled:opacity-50"
          />
        </label>

        <label className="block mb-3">
          <span className="text-sm font-semibold mb-1 block">Your email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@business.com"
            disabled={skipScan}
            className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2.5 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 disabled:opacity-50"
          />
        </label>

        <label className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 cursor-pointer">
          <input
            type="checkbox"
            checked={auth}
            onChange={(e) => setAuth(e.target.checked)}
            disabled={skipScan}
            className="mt-0.5 shrink-0"
          />
          <span className="text-sm text-amber-100">
            <strong className="block mb-1">I have authorization to scan this target.</strong>
            Unauthorized port scanning and vulnerability scanning is illegal in many jurisdictions. By checking this box
            you confirm you own this domain or have explicit written permission from the owner.
          </span>
        </label>
      </div>

      {error ? <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">{error}</div> : null}

      <button
        type="submit"
        disabled={submitting || (!skipScan && (!target || !email || !auth))}
        className="w-full px-4 py-3 rounded-lg bg-sky-500 text-slate-950 font-bold hover:bg-sky-400 disabled:opacity-40"
      >
        {submitting ? "Starting…" : skipScan ? "Open hardening plan →" : "Run Blue Team scan →"}
      </button>
    </form>
  );
}
