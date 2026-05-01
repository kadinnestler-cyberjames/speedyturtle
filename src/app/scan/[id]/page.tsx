import { notFound } from "next/navigation";
import Link from "next/link";
import { loadScan } from "@/lib/store";
import { ScanResult } from "@/components/ScanResult";

export const dynamic = "force-dynamic";

export default async function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scan = await loadScan(id);
  if (!scan) notFound();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold tracking-tight">
            🐢 <span className="text-emerald-400">speedyturtle</span>
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
