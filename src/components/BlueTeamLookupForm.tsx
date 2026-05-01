"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function BlueTeamLookupForm() {
  const router = useRouter();
  const [scanId, setScanId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!scanId.trim()) {
      setError("Paste a scan ID from /dashboard or your scan URL.");
      return;
    }
    setSubmitting(true);
    router.push(`/blue-team/scan/${scanId.trim()}`);
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-3">
      <h2 className="text-lg font-bold">Already have a Red Team scan?</h2>
      <p className="text-sm text-slate-400">
        Paste the scan ID (UUID from the URL) and we&apos;ll generate a hardening plan from it. Otherwise,
        <Link href="/blue-team/scan" className="text-sky-400 hover:text-sky-300"> kick off a fresh scan</Link>.
      </p>
      <input
        value={scanId}
        onChange={(e) => setScanId(e.target.value)}
        placeholder="00000000-0000-0000-0000-000000000000"
        className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2.5 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 font-mono text-sm"
      />
      {error ? <div className="text-sm text-rose-300">{error}</div> : null}
      <button
        type="submit"
        disabled={submitting}
        className="w-full px-4 py-2.5 rounded-lg bg-sky-500 text-slate-950 font-bold hover:bg-sky-400 disabled:opacity-40"
      >
        {submitting ? "Loading…" : "Open hardening plan →"}
      </button>
    </form>
  );
}
