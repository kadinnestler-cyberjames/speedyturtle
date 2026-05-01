import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { loadScan } from "@/lib/store";
import { ScanResult } from "@/components/ScanResult";
import { Logo } from "@/components/Logo";
import type { Scan } from "@/lib/types";

export const dynamic = "force-dynamic";

async function fetchScan(id: string): Promise<Scan | null> {
  // Local in-memory store first (matters when this page renders on the same
  // process that ran the scan — dev server, single-host self-host).
  const local = await loadScan(id);
  if (local) return local;

  // Fall back to a self-fetch through the API. On Vercel deployments where
  // /api/scan/* is rewritten to a self-hosted worker via SPEEDYTURTLE_WORKER_URL,
  // this is how the result page gets the actual scan data — Vercel's process
  // doesn't have it but the worker does. The page itself stays rendered by
  // Vercel so its CSS hashes match Vercel's bundle (the previous attempt to
  // rewrite the whole /scan/* path produced a styleless page because the
  // browser couldn't resolve the worker's _next/static asset paths).
  try {
    const h = await headers();
    const host = h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    if (!host) return null;
    const res = await fetch(`${proto}://${host}/api/scan/${id}/status?full=1`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Scan | { status: "not-found" };
    if ("status" in data && data.status === "not-found") return null;
    if (typeof (data as Scan).id !== "string") return null;
    return data as Scan;
  } catch {
    return null;
  }
}

export default async function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scan = await fetchScan(id);
  if (!scan) notFound();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold tracking-tight flex items-center gap-2">
            <Logo size={28} />
            <span className="text-emerald-400">speedyturtle</span>
          </Link>
          <Link href="/dashboard" className="text-sm text-slate-300 hover:text-white">Dashboard</Link>
        </div>
      </header>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <ScanResult scanId={scan.id} initialScan={scan} />
      </div>
    </main>
  );
}
