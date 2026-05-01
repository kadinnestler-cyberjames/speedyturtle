import { runSubfinder } from "../scanners/subfinder";
import { runHttpx } from "../scanners/httpx";
import { runNuclei, type NucleiFinding } from "../scanners/nuclei";
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
    message: `Running nuclei against ${liveUrls.length || 1} live hosts (info+low+medium+high+critical, validator filters FPs)…`,
  });
  // nuclei also needs URL prefixes, not bare hostnames. Default to https:// fallback.
  const nucleiTargets = liveUrls.length > 0 ? liveUrls : [`https://${target}`];
  // Include low+ — most real-world surface scans surface low-sev exposures, info-disclosure,
  // and CVE-tagged "info" templates that matter. Validator subagent will filter false positives.
  const vulns: NucleiFinding[] = await runNuclei(nucleiTargets, {
    severity: "info,low,medium,high,critical",
    timeoutMs: 540_000,
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

  const finalScan: Scan = {
    ...scan,
    findings,
    triage,
    validation,
    exploitChains: chainResult.chains,
    exploitChainsNote: chainResult.noChainsReason ?? undefined,
    cheapestCut: chainResult.cheapestCut,
    adversaryProfile,
    genealogy,
    status: "ready",
    durationMs: Date.now() - start,
    progress: { step: "done", pct: 100, message: "Scan complete." },
  };
  await saveScan(finalScan);
  return finalScan;
}
