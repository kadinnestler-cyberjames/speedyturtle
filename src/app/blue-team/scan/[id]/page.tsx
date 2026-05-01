import { notFound } from "next/navigation";
import Link from "next/link";
import { loadScan } from "@/lib/store";
import { loadHardeningPlan } from "@/lib/blue-team/store";
import { HardeningPlanView } from "@/components/HardeningPlanView";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function BlueTeamHardeningPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const scan = await loadScan(id);
  if (!scan) notFound();

  const existingPlan = await loadHardeningPlan(id);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold tracking-tight flex items-center gap-2"><Logo size={28} /><span className="text-emerald-400">speedyturtle</span></Link>
          <nav className="flex gap-5 text-sm">
            <Link href="/red-team" className="text-slate-300 hover:text-white">Red Team</Link>
            <Link href="/blue-team" className="text-sky-400 font-semibold">Blue Team</Link>
            <Link href="/blue-team/compliance" className="text-slate-300 hover:text-white">Compliance</Link>
            <Link href="/dashboard" className="text-slate-300 hover:text-white">Dashboard</Link>
          </nav>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <HardeningPlanView scan={scan} initialPlan={existingPlan} />
      </div>
    </main>
  );
}
