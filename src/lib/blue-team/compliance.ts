import type { Finding } from "../types";
import type {
  ComplianceFramework,
  ComplianceFrameworkSlug,
  ComplianceCoverage,
  ComplianceControl,
  ComplianceControlStatus,
} from "./types";

export const COMPLIANCE_FRAMEWORKS: ComplianceFramework[] = [
  {
    slug: "ny-shield",
    name: "NY SHIELD Act",
    appliesTo: "Any business holding NY residents' private info",
    controls: [
      { id: "shield-01", family: "Administrative", description: "Designate one or more employees to coordinate the security program", status: "satisfied", evidenceSource: "tenant-config", lastEvidenceAt: agedDays(6) },
      { id: "shield-02", family: "Administrative", description: "Risk assessment with reasonable safeguards selection", status: "satisfied", evidenceSource: "wall-policy", lastEvidenceAt: agedDays(6) },
      { id: "shield-03", family: "Technical", description: "Detect, prevent, respond to attacks/intrusions", status: "satisfied", evidenceSource: "endpoint-sentinel", lastEvidenceAt: agedHours(1) },
      { id: "shield-04", family: "Technical", description: "Regular testing of safeguards", status: "satisfied", evidenceSource: "phishing-sim+restore-drill", lastEvidenceAt: agedDays(7) },
      { id: "shield-05", family: "Physical", description: "Detect, prevent, respond to intrusions of physical media", status: "partial", evidenceSource: "manual-attestation-needed", lastEvidenceAt: null },
      { id: "shield-06", family: "Administrative", description: "Vendor / service-provider safeguard contracts", status: "gap", evidenceSource: "vendor-DPA-tracker", lastEvidenceAt: null },
    ],
  },
  {
    slug: "hipaa-sra",
    name: "HIPAA Security Risk Analysis",
    appliesTo: "Medical, dental, behavioral health, any PHI handler",
    controls: [
      { id: "hipaa-164.308a1", family: "Administrative", description: "Security Management Process — risk analysis", status: "satisfied", evidenceSource: "wall-sra-engine", lastEvidenceAt: agedDays(14) },
      { id: "hipaa-164.308a3", family: "Administrative", description: "Workforce Security — authorization, clearance, termination", status: "satisfied", evidenceSource: "tenant-config", lastEvidenceAt: agedDays(30) },
      { id: "hipaa-164.308a5", family: "Administrative", description: "Security Awareness and Training", status: "satisfied", evidenceSource: "awareness-trainer", lastEvidenceAt: agedDays(7) },
      { id: "hipaa-164.308a6", family: "Administrative", description: "Security Incident Procedures", status: "satisfied", evidenceSource: "wall-runbook", lastEvidenceAt: agedDays(30) },
      { id: "hipaa-164.308a7", family: "Administrative", description: "Contingency Plan — backup, disaster recovery", status: "satisfied", evidenceSource: "backup-vault+restore-drill", lastEvidenceAt: agedDays(3) },
      { id: "hipaa-164.310a1", family: "Physical", description: "Facility Access Controls", status: "partial", evidenceSource: "manual-attestation-needed", lastEvidenceAt: null },
      { id: "hipaa-164.310d1", family: "Physical", description: "Device and Media Controls", status: "satisfied", evidenceSource: "endpoint-sentinel", lastEvidenceAt: agedHours(1) },
      { id: "hipaa-164.312a1", family: "Technical", description: "Access Control — unique user IDs, encryption, automatic logoff", status: "satisfied", evidenceSource: "endpoint-sentinel+m365-graph", lastEvidenceAt: agedHours(1) },
      { id: "hipaa-164.312b", family: "Technical", description: "Audit Controls — log activity in info systems", status: "satisfied", evidenceSource: "wazuh-audit-log", lastEvidenceAt: agedHours(1) },
      { id: "hipaa-164.312c1", family: "Technical", description: "Integrity — protect ePHI from improper alteration", status: "satisfied", evidenceSource: "wazuh-fim", lastEvidenceAt: agedHours(1) },
      { id: "hipaa-164.312d", family: "Technical", description: "Person or Entity Authentication", status: "partial", evidenceSource: "mfa-enforcement-pending", lastEvidenceAt: agedDays(7) },
      { id: "hipaa-164.312e1", family: "Technical", description: "Transmission Security — encryption in transit", status: "satisfied", evidenceSource: "tls-everywhere", lastEvidenceAt: agedDays(30) },
    ],
  },
  {
    slug: "pci-saq-a",
    name: "PCI DSS 4.0 — SAQ-A",
    appliesTo: "Card-not-present merchants outsourcing all CHD handling",
    controls: [
      { id: "pci-2.3", family: "Network", description: "All non-console admin access uses strong cryptography", status: "satisfied", evidenceSource: "tls-everywhere", lastEvidenceAt: agedDays(30) },
      { id: "pci-6.4.3", family: "Web", description: "Manage scripts loaded on payment pages", status: "partial", evidenceSource: "csp-headers-needed", lastEvidenceAt: null },
      { id: "pci-8.3.1", family: "Identity", description: "MFA for all access into the CDE", status: "satisfied", evidenceSource: "m365-conditional-access", lastEvidenceAt: agedDays(14) },
      { id: "pci-9.3", family: "Physical", description: "Restrict physical access to facilities with CHD", status: "satisfied", evidenceSource: "tenant-attestation", lastEvidenceAt: agedDays(30) },
      { id: "pci-11.6.1", family: "Web", description: "Detect changes to payment-page HTTP headers and content", status: "gap", evidenceSource: "page-monitor-needed", lastEvidenceAt: null },
      { id: "pci-12.8", family: "Vendor", description: "Maintain list of TPSPs + acknowledged responsibilities", status: "satisfied", evidenceSource: "vendor-tracker", lastEvidenceAt: agedDays(30) },
    ],
  },
  {
    slug: "nist-csf-2",
    name: "NIST CSF 2.0",
    appliesTo: "Universal baseline (often required by cyber insurance / RFPs)",
    controls: [
      { id: "csf-gv", family: "Govern", description: "Cybersecurity strategy + roles + risk management", status: "satisfied", evidenceSource: "wall-policy-pack", lastEvidenceAt: agedDays(7) },
      { id: "csf-id", family: "Identify", description: "Asset management, risk assessment, supply chain", status: "satisfied", evidenceSource: "endpoint-sentinel-inventory", lastEvidenceAt: agedHours(1) },
      { id: "csf-pr", family: "Protect", description: "Identity & access, awareness, data security, platform security", status: "satisfied", evidenceSource: "phishing-shield+endpoint-sentinel+awareness-trainer", lastEvidenceAt: agedHours(1) },
      { id: "csf-de", family: "Detect", description: "Continuous monitoring, adverse event analysis", status: "satisfied", evidenceSource: "wazuh-rules", lastEvidenceAt: agedHours(1) },
      { id: "csf-rs", family: "Respond", description: "Incident management, analysis, mitigation, reporting, communication", status: "partial", evidenceSource: "runbook-exists-not-tested", lastEvidenceAt: agedDays(60) },
      { id: "csf-rc", family: "Recover", description: "Incident recovery plan + communications", status: "satisfied", evidenceSource: "backup-vault+restore-drill", lastEvidenceAt: agedDays(3) },
    ],
  },
];

function agedDays(n: number): string {
  return new Date(Date.now() - n * 86400_000).toISOString();
}

function agedHours(n: number): string {
  return new Date(Date.now() - n * 3600_000).toISOString();
}

export function selectFramework(slug: string): ComplianceFramework | null {
  return COMPLIANCE_FRAMEWORKS.find((f) => f.slug === slug) ?? null;
}

export function listFrameworks(): ComplianceFramework[] {
  return COMPLIANCE_FRAMEWORKS;
}

const PAYMENT_PATH_RX = /(pay|checkout|cart|billing|invoice)/i;

export function mapFindingToControls(
  finding: Finding,
  framework: ComplianceFrameworkSlug
): string[] {
  const sev = finding.severity;
  const cat = finding.category;
  const isHighOrCritical = sev === "high" || sev === "critical";
  const isMediumPlus = sev === "medium" || isHighOrCritical;
  const asset = finding.affectedAsset.toLowerCase();
  const out = new Set<string>();

  if (framework === "ny-shield") {
    if (cat === "vulnerability" || (cat === "misconfig" && isHighOrCritical)) out.add("shield-03");
    if (cat === "credential-exposure") out.add("shield-03");
    if (cat === "service-fingerprint" && /(dev|staging|test|qa|preview)/i.test(asset)) out.add("shield-04");
  }

  if (framework === "hipaa-sra") {
    if ((cat === "vulnerability" || cat === "misconfig") && isHighOrCritical) {
      out.add("hipaa-164.308a6");
      out.add("hipaa-164.312a1");
    }
    if (cat === "tls") out.add("hipaa-164.312e1");
    if (cat === "info-disclosure" || cat === "credential-exposure") out.add("hipaa-164.312c1");
  }

  if (framework === "pci-saq-a") {
    if (cat === "tls") out.add("pci-2.3");
    if (isHighOrCritical && PAYMENT_PATH_RX.test(asset)) {
      out.add("pci-6.4.3");
      out.add("pci-11.6.1");
    }
  }

  if (framework === "nist-csf-2") {
    out.add("csf-id");
    if (cat === "vulnerability" && isHighOrCritical) {
      out.add("csf-pr");
      out.add("csf-de");
    }
    if (cat === "misconfig") out.add("csf-pr");
    if (isMediumPlus) out.add("csf-de");
  }

  return Array.from(out);
}

export function mapFindingsToControls(
  findings: Finding[],
  framework: ComplianceFrameworkSlug
): { findingsByControl: Record<string, string[]>; impactedFindingsPerFinding: Map<string, string[]> } {
  const byControl: Record<string, string[]> = {};
  const perFinding = new Map<string, string[]>();
  for (const f of findings) {
    const controls = mapFindingToControls(f, framework);
    perFinding.set(f.id, controls);
    for (const c of controls) {
      if (!byControl[c]) byControl[c] = [];
      byControl[c].push(f.id);
    }
  }
  return { findingsByControl: byControl, impactedFindingsPerFinding: perFinding };
}

export function computeCoverage(
  framework: ComplianceFramework,
  findings: Finding[]
): ComplianceCoverage {
  const { findingsByControl } = mapFindingsToControls(findings, framework.slug);
  const findingsById = new Map(findings.map((f) => [f.id, f]));

  const overlaid = framework.controls.map((control) => {
    const impacting = findingsByControl[control.id] ?? [];
    const sevs = impacting.map((id) => findingsById.get(id)?.severity).filter(Boolean) as string[];
    let status: ComplianceControlStatus = control.status;
    if (sevs.includes("high") || sevs.includes("critical")) {
      status = "gap";
    } else if (sevs.includes("medium")) {
      status = status === "satisfied" ? "partial" : status;
    }
    return { ...control, status, findingsImpacting: impacting };
  });

  const counts = overlaid.reduce(
    (acc: { satisfied: number; partial: number; gap: number }, c) => {
      acc[c.status] += 1;
      return acc;
    },
    { satisfied: 0, partial: 0, gap: 0 }
  );

  const total = overlaid.length || 1;
  const percent = Math.round(((counts.satisfied + counts.partial * 0.5) / total) * 100);

  return {
    framework: { ...framework, controls: overlaid },
    satisfied: counts.satisfied,
    partial: counts.partial,
    gap: counts.gap,
    percent,
    controls: overlaid,
    findingsByControl,
  };
}

export type FrameworkSummary = {
  slug: ComplianceFrameworkSlug;
  name: string;
  appliesTo: string;
  totalControls: number;
  baselineSatisfied: number;
};

export function summarizeFrameworks(): FrameworkSummary[] {
  return COMPLIANCE_FRAMEWORKS.map((f) => ({
    slug: f.slug,
    name: f.name,
    appliesTo: f.appliesTo,
    totalControls: f.controls.length,
    baselineSatisfied: f.controls.filter((c: ComplianceControl) => c.status === "satisfied").length,
  }));
}
