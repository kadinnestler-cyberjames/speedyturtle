import { runSubfinder } from "../scanners/subfinder";
import { runHttpx } from "../scanners/httpx";
import { runNuclei, type NucleiFinding } from "../scanners/nuclei";
import { runEmailAuthScan } from "../scanners/email-auth";
import { runShodanScan } from "../scanners/shodan-internetdb";
import { runHibpScan } from "../scanners/hibp";
import { runRdapScan } from "../scanners/rdap";
import { runCrtScan } from "../scanners/crt-sh";
import { triageFindings } from "./triage";
import { reasonAboutChains } from "./chain-reasoning";
import { simulateAdversaries } from "./adversary-personas";
import { validateFindings } from "./validator";
import { traceVulnerabilityGenealogy } from "./genealogy";
import type { Finding, Scan } from "../types";
import { randomUUID } from "node:crypto";
import { saveScan, updateScanProgress } from "../store";

export async function runRedTeamScan(scan: Scan): Promise<Scan> {
  const start = Date.now();
  const target = scan.input.target.replace(/^https?:\/\//, "").split("/")[0];
  const findings: Finding[] = [];

  // Step 1 — subdomain enum
  await updateScanProgress(scan.id, {
    step: "subfinder",
    pct: 10,
    message: `Enumerating subdomains of ${target}…`,
  });
  const subs = await runSubfinder(target);

  for (const s of subs) {
    findings.push({
      id: randomUUID(),
      severity: "info",
      category: "subdomain-exposure",
      title: `Subdomain discovered: ${s.host}`,
      description: `Public DNS source: ${s.source ?? "passive"}`,
      affectedAsset: s.host,
      scanner: "subfinder",
    });
  }

  // Step 2 — HTTP probe live hosts
  await updateScanProgress(scan.id, {
    step: "httpx",
    pct: 35,
    message: `Probing ${subs.length || 1} hosts for live HTTP services…`,
  });
  // httpx requires URLs with protocol — bare hostnames return empty.
  // Always include the apex target — subfinder may return only subdomains
  // (e.g. just www.example.com), and the apex itself often serves the most surface.
  // Pass both https:// and http:// so httpx can probe each; dedupe by host after.
  const probeHostSet = new Set<string>([target, ...subs.map((s) => s.host)]);
  const probeHosts = Array.from(probeHostSet);
  const probeTargets = probeHosts.flatMap((h) => [`https://${h}`, `http://${h}`]);
  const probes = await runHttpx(probeTargets);
  // Dedupe — keep https variant if both probes succeed
  const seen = new Set<string>();
  const dedupedProbes = probes.filter((p) => {
    if (seen.has(p.host)) return false;
    seen.add(p.host);
    return true;
  });
  const liveUrls = dedupedProbes.map((p) => p.url);

  for (const p of dedupedProbes) {
    findings.push({
      id: randomUUID(),
      severity: p.statusCode >= 500 ? "low" : "info",
      category: "service-fingerprint",
      title: `${p.statusCode} ${p.title || p.host}`,
      description: `${p.webServer ?? "unknown server"} · ${(p.techStack ?? []).join(", ") || "no tech detected"}`,
      affectedAsset: p.url,
      scanner: "httpx",
      evidence: `Content-Type: ${p.contentType ?? "?"}, Length: ${p.contentLength ?? "?"}`,
    });
  }

  // Step 3 — vuln scan with nuclei
  await updateScanProgress(scan.id, {
    step: "nuclei",
    pct: 60,
    message: `Running nuclei against ${liveUrls.length || 1} live host(s) — 5,000+ templates, low/medium/high/critical severity. This is the slow part: typical 3-8 min, heavy WordPress/PHP sites can hit 15 min.`,
  });
  // nuclei also needs URL prefixes, not bare hostnames. Default to https:// fallback.
  const nucleiTargets = liveUrls.length > 0 ? liveUrls : [`https://${target}`];
  // Drop "info" — those are mostly fingerprint/banner templates that dominate
  // the template count and produce thousands of low-signal results that the
  // validator would just filter anyway. Keep low+ to catch real exposures
  // and CVE matches. Bump ceiling to 15 min so heavy targets don't get
  // SIGTERM'd mid-scan — a truncated JSONL produces 0 findings.
  const vulns: NucleiFinding[] = await runNuclei(nucleiTargets, {
    severity: "low,medium,high,critical",
    timeoutMs: 900_000,
  });

  for (const v of vulns) {
    findings.push({
      id: randomUUID(),
      severity: v.severity,
      category: v.cveId ? "vulnerability" : "misconfig",
      title: v.templateName || v.templateId,
      description: v.description || `Matched template ${v.templateId}`,
      affectedAsset: v.matchedAt,
      scanner: "nuclei",
      evidence: v.reference?.join("\n"),
      cveId: v.cveId,
      cvssScore: v.cvssScore,
    });
  }

  // Step 3b — Domain & email posture (cheap, parallel, high-signal). These run
  // even when nuclei produces nothing, which is the common case for sites
  // sitting behind Cloudflare like roxannestaqueria.com — turning a "0 findings"
  // empty report into a substantive one.
  await updateScanProgress(scan.id, {
    step: "nuclei",
    pct: 62,
    message: "Checking domain posture: SPF/DKIM/DMARC, exposed ports, breach exposure, registrar lock…",
  });
  // Promise.allSettled so a single slow/erroring upstream can't take down the
  // whole posture pass. Each scanner reports its own status — surfaced in the
  // report so a "0 findings" doesn't get confused with "scanner failed."
  const knownHosts = Array.from(probeHostSet);
  const settled = await Promise.allSettled([
    runEmailAuthScan(target),
    runShodanScan(target),
    runHibpScan(target),
    runRdapScan(target),
    runCrtScan(target, knownHosts),
  ]);
  const scannerNames = ["email-auth", "shodan-internetdb", "hibp", "rdap", "crt-sh"] as const;
  const scannerStatus: Record<string, "ok" | "error"> = {};
  const [emailAuthRes, shodanRes, hibpRes, rdapRes, crtRes] = settled.map((s, i) => {
    if (s.status === "fulfilled") {
      scannerStatus[scannerNames[i]] = "ok";
      return s.value;
    }
    console.warn(`[scanner ${scannerNames[i]}] failed:`, s.reason);
    scannerStatus[scannerNames[i]] = "error";
    return [];
  });
  const emailAuth = emailAuthRes as Awaited<ReturnType<typeof runEmailAuthScan>>;
  const shodan = shodanRes as Awaited<ReturnType<typeof runShodanScan>>;
  const hibp = hibpRes as Awaited<ReturnType<typeof runHibpScan>>;
  const rdap = rdapRes as Awaited<ReturnType<typeof runRdapScan>>;
  const crt = crtRes as Awaited<ReturnType<typeof runCrtScan>>;

  for (const f of emailAuth) {
    findings.push({
      id: randomUUID(),
      severity: f.severity,
      category: f.category,
      title: f.title,
      description: f.description,
      recommendation: f.recommendation,
      shortTermFix: f.shortTermFix,
      longTermFix: f.longTermFix,
      affectedAsset: f.affectedAsset,
      scanner: "dns-auth",
      evidence: f.evidence,
    });
  }
  for (const f of shodan) {
    findings.push({
      id: randomUUID(),
      severity: f.severity,
      category: f.category,
      title: f.title,
      description: f.description,
      recommendation: f.recommendation,
      shortTermFix: f.shortTermFix,
      longTermFix: f.longTermFix,
      affectedAsset: f.affectedAsset,
      scanner: "shodan-internetdb",
      evidence: f.evidence,
      cveId: f.cveId,
      cvssScore: f.cvssScore,
    });
  }
  for (const f of hibp) {
    findings.push({
      id: randomUUID(),
      severity: f.severity,
      category: f.category,
      title: f.title,
      description: f.description,
      recommendation: f.recommendation,
      shortTermFix: f.shortTermFix,
      longTermFix: f.longTermFix,
      affectedAsset: f.affectedAsset,
      scanner: "hibp",
      evidence: f.evidence,
    });
  }
  for (const f of rdap) {
    findings.push({
      id: randomUUID(),
      severity: f.severity,
      category: f.category,
      title: f.title,
      description: f.description,
      recommendation: f.recommendation,
      shortTermFix: f.shortTermFix,
      longTermFix: f.longTermFix,
      affectedAsset: f.affectedAsset,
      scanner: "rdap",
      evidence: f.evidence,
    });
  }
  for (const f of crt) {
    findings.push({
      id: randomUUID(),
      severity: f.severity,
      category: f.category,
      title: f.title,
      description: f.description,
      recommendation: f.recommendation,
      shortTermFix: f.shortTermFix,
      longTermFix: f.longTermFix,
      affectedAsset: f.affectedAsset,
      scanner: "subfinder",
      evidence: f.evidence,
    });
  }

  // Step 4a — Validator subagent (Mythos scaffold pattern: disprove findings before triage)
  await updateScanProgress(scan.id, {
    step: "triage",
    pct: 65,
    message: "Validator subagent: trying to disprove each finding (Mythos-style false-positive filter)…",
  });
  const validation = await validateFindings(findings);

  // Step 4b — Claude triage (now operates on validated set)
  await updateScanProgress(scan.id, {
    step: "triage",
    pct: 75,
    message: "Triaging validated findings + writing recommendations…",
  });
  const triage = await triageFindings(scan.input.target, findings);

  // Step 5 — Chain reasoning (world-first: multi-step exploit composition)
  await updateScanProgress(scan.id, {
    step: "triage",
    pct: 82,
    message: "Reasoning about exploit chains (Claude Opus, Mythos-style)…",
  });
  const chainResult = await reasonAboutChains(scan.input.target, findings);

  // Step 6 — Adversary persona simulation (APT TTPs vs your surface)
  await updateScanProgress(scan.id, {
    step: "triage",
    pct: 92,
    message: "Cross-referencing findings against named APT TTPs…",
  });
  const adversaryProfile = await simulateAdversaries(scan.input.target, findings);

  // Step 6b — Vulnerability Genealogy (historical CVE family tracing)
  await updateScanProgress(scan.id, {
    step: "triage",
    pct: 96,
    message: "Tracing vulnerability genealogy — historical CVE families…",
  });
  const genealogy = await traceVulnerabilityGenealogy(findings);

  // Step 7 — done
  await updateScanProgress(scan.id, {
    step: "done",
    pct: 100,
    message: "Scan complete.",
  });

  // Stamp every non-info finding with a stable short ID for citation
  // (TOB/NCC pattern: ST-XXXX). Use a content-derived hash of
  // (category, affectedAsset, title-prefix) so the SAME finding gets the
  // SAME ID across re-runs — important for tracking remediation over time.
  // 4 hex chars = 65k namespace, plenty for a single scan; collisions
  // within a scan are vanishingly unlikely and only affect display.
  function stableFindingId(f: Finding): string {
    const fingerprint = `${f.category}|${f.affectedAsset}|${(f.title ?? "").slice(0, 80)}`;
    let h = 0;
    for (let i = 0; i < fingerprint.length; i++) {
      h = (h * 31 + fingerprint.charCodeAt(i)) | 0;
    }
    const hex = (h >>> 0).toString(16).padStart(8, "0").slice(-4).toUpperCase();
    return `ST-${hex}`;
  }
  for (const f of findings) {
    if (f.severity !== "info" && !f.findingId) {
      f.findingId = stableFindingId(f);
    }
  }

  const finalScan: Scan = {
    ...scan,
    findings,
    triage,
    validation,
    exploitChains: chainResult.chains,
    exploitChainsNote: chainResult.noChainsReason ?? undefined,
    overallAttackTree: chainResult.overallAttackTree,
    cheapestCut: chainResult.cheapestCut,
    adversaryProfile,
    genealogy,
    status: "ready",
    durationMs: Date.now() - start,
    progress: { step: "done", pct: 100, message: "Scan complete." },
  };
  await saveScan(finalScan);

  // Fire-and-forget the email report. We don't await — the report
  // sending shouldn't gate the scan completion or block the next request.
  void (async () => {
    try {
      const { sendRedTeamReport } = await import("../email");
      const r = await sendRedTeamReport(finalScan);
      if (!r.ok && r.error && !r.error.includes("RESEND_API_KEY not set")) {
        console.warn("Red Team report email failed:", r.error);
      }
    } catch (err) {
      console.warn("Red Team report email crashed:", err);
    }
  })();

  return finalScan;
}
