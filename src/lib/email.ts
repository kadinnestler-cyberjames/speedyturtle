import type { Scan } from "./types";
import type { HardeningPlan } from "./blue-team/types";

/**
 * Email a scan report via Resend. No-op when RESEND_API_KEY isn't set so
 * forks/self-hosters without a Resend account don't error out.
 *
 * Calls Resend's HTTP API directly to avoid pulling in the resend SDK
 * (saves ~200KB on the cold-start bundle and we only need POST /emails).
 */

type SendOpts = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

async function send(opts: SendOpts): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not set" };
  }
  const from = process.env.RESEND_FROM_ADDRESS || "speedyturtle <reports@speedyturtle.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `resend ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function reportLink(scanId: string, mode: "red-team" | "blue-team"): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") || "https://speedyturtle-khaki.vercel.app";
  return mode === "blue-team" ? `${base}/blue-team/scan/${scanId}` : `${base}/scan/${scanId}`;
}

function pdfLink(scanId: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") || "https://speedyturtle-khaki.vercel.app";
  return `${base}/api/pdf/${scanId}`;
}

export async function sendRedTeamReport(scan: Scan): Promise<{ ok: boolean; error?: string }> {
  const target = scan.input.target;
  const findingCount = scan.findings.length;
  const summary = scan.triage?.summary ?? `Scan of ${target} complete: ${findingCount} finding(s).`;
  const topRisks = scan.triage?.topRisks ?? [];
  const cheapest = scan.cheapestCut?.mitigation;
  const personas = (scan.adversaryProfile ?? []).slice(0, 5);
  const link = reportLink(scan.id, "red-team");
  const pdf = pdfLink(scan.id);

  const text = [
    `speedyturtle Red Team scan complete: ${target}`,
    "",
    summary,
    "",
    topRisks.length > 0 ? "Top risks:" : "",
    ...topRisks.map((r, i) => `  ${i + 1}. ${r}`),
    "",
    cheapest ? `Cheapest cut: ${cheapest}` : "",
    "",
    personas.length > 0 ? "Adversary persona exposure:" : "",
    ...personas.map((p) => `  ${p.persona ?? "?"}: ${p.exposureScore}/100 (dwell ${p.expectedDwellTimeDays}d)`),
    "",
    `Full report: ${link}`,
    `PDF: ${pdf}`,
    "",
    "—",
    "speedyturtle · https://speedyturtle-khaki.vercel.app",
  ]
    .filter((l) => l !== "")
    .join("\n");

  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#0f172a;max-width:600px;margin:0 auto;padding:24px;">
    <h2 style="color:#10b981;margin-bottom:4px">Red Team scan complete</h2>
    <p style="color:#64748b;margin-top:0;font-size:14px">${target} · ${findingCount} finding${findingCount === 1 ? "" : "s"}</p>
    <p>${escapeHtml(summary)}</p>
    ${topRisks.length > 0 ? `<h3 style="margin-bottom:6px">Top risks</h3><ol style="margin-top:0">${topRisks.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ol>` : ""}
    ${cheapest ? `<h3 style="margin-bottom:6px">Cheapest cut</h3><p style="background:#ecfdf5;padding:12px;border-radius:6px">${escapeHtml(cheapest)}</p>` : ""}
    ${personas.length > 0 ? `<h3 style="margin-bottom:6px">Adversary persona exposure</h3><ul style="margin-top:0">${personas.map((p) => `<li><strong>${escapeHtml(p.persona ?? "?")}</strong>: ${p.exposureScore}/100 (dwell ${p.expectedDwellTimeDays}d)</li>`).join("")}</ul>` : ""}
    <p style="margin-top:24px"><a href="${link}" style="background:#10b981;color:#0f172a;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600">View full report</a> &nbsp; <a href="${pdf}">Download PDF</a></p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin-top:32px"/>
    <p style="color:#94a3b8;font-size:12px">speedyturtle · <a href="https://speedyturtle-khaki.vercel.app" style="color:#64748b">speedyturtle-khaki.vercel.app</a></p>
  </body></html>`;

  return send({
    to: scan.input.email,
    subject: `Red Team scan complete: ${target} (${findingCount} finding${findingCount === 1 ? "" : "s"})`,
    html,
    text,
  });
}

export async function sendBlueTeamReport(
  scan: Scan,
  plan: HardeningPlan,
): Promise<{ ok: boolean; error?: string }> {
  const target = scan.input.target;
  const link = reportLink(scan.id, "blue-team");
  const pdf = pdfLink(scan.id);
  const patches = plan.patches.length;
  const breakpoints = plan.chainBreakpoints.length;
  const quickWins = plan.summary.quickWins;
  const hours = plan.summary.estimatedEffortHours;

  const text = [
    `speedyturtle Blue Team hardening plan ready: ${target}`,
    "",
    `${patches} prioritized patch${patches === 1 ? "" : "es"}, ${breakpoints} chain breakpoint${breakpoints === 1 ? "" : "s"}.`,
    `${quickWins} quick win${quickWins === 1 ? "" : "s"} (low-effort, high-severity).`,
    `Total estimated effort: ${hours} hour${hours === 1 ? "" : "s"}.`,
    "",
    `Full plan: ${link}`,
    `PDF: ${pdf}`,
    "",
    "—",
    "speedyturtle · https://speedyturtle-khaki.vercel.app",
  ].join("\n");

  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#0f172a;max-width:600px;margin:0 auto;padding:24px;">
    <h2 style="color:#0ea5e9;margin-bottom:4px">Blue Team hardening plan ready</h2>
    <p style="color:#64748b;margin-top:0;font-size:14px">${escapeHtml(target)}</p>
    <ul style="line-height:1.7">
      <li><strong>${patches}</strong> prioritized patch${patches === 1 ? "" : "es"}</li>
      <li><strong>${breakpoints}</strong> exploit-chain breakpoint${breakpoints === 1 ? "" : "s"}</li>
      <li><strong>${quickWins}</strong> quick win${quickWins === 1 ? "" : "s"} (low-effort, high-severity)</li>
      <li>Estimated effort: <strong>${hours}</strong> hour${hours === 1 ? "" : "s"}</li>
    </ul>
    <p style="margin-top:24px"><a href="${link}" style="background:#0ea5e9;color:#0f172a;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600">View full plan</a> &nbsp; <a href="${pdf}">Download PDF</a></p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin-top:32px"/>
    <p style="color:#94a3b8;font-size:12px">speedyturtle · <a href="https://speedyturtle-khaki.vercel.app" style="color:#64748b">speedyturtle-khaki.vercel.app</a></p>
  </body></html>`;

  return send({
    to: scan.input.email,
    subject: `Blue Team hardening plan ready: ${target}`,
    html,
    text,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
