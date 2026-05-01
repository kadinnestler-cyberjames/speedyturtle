import type { Finding, Severity } from "../types";

export type PatchEffort = "low" | "medium" | "high";

export type PatchSuggestion = {
  findingId: string;
  title: string;
  affectedAsset: string;
  severity: Severity;
  category: Finding["category"];
  patch: string;
  effort: PatchEffort;
  priority: number;
  source: "claude" | "fallback";
};

export type ChainBreakpoint = {
  chainId: string;
  chainTitle: string;
  breakpoint: string;
  rationale: string;
  effort: PatchEffort;
  cutsChainAtStep?: number;
  source: "opus" | "fallback";
};

export type ComplianceImpactItem = {
  findingId: string;
  findingTitle: string;
  severity: Severity;
  affectedAsset: string;
  framework: ComplianceFrameworkSlug;
  controlIds: string[];
};

export type HardeningPlan = {
  scanId: string;
  generatedAt: string;
  target: string;
  patches: PatchSuggestion[];
  chainBreakpoints: ChainBreakpoint[];
  complianceImpact: ComplianceImpactItem[];
  summary: {
    patchCount: number;
    chainCount: number;
    quickWins: number;
    estimatedEffortHours: number;
  };
};

export type FindingFingerprint = string;

export type VerificationReport = {
  originalScanId: string;
  verifyScanId: string;
  generatedAt: string;
  fixed: Finding[];
  persistent: Finding[];
  newSince: Finding[];
  coverage: number;
};

export type MonitorTarget = {
  id: string;
  target: string;
  email: string;
  baselineScanId: string | null;
  lastScanAt: string | null;
  lastScanId: string | null;
  registeredAt: string;
};

export type MonitorAlert = {
  targetId: string;
  target: string;
  email: string;
  scanId: string;
  baselineScanId: string | null;
  generatedAt: string;
  newCriticals: Finding[];
  newHighs: Finding[];
  delivered: boolean;
  deliveryNote: string;
};

export type ComplianceFrameworkSlug =
  | "ny-shield"
  | "hipaa-sra"
  | "pci-saq-a"
  | "nist-csf-2";

export type ComplianceControlStatus = "satisfied" | "partial" | "gap";

export type ComplianceControl = {
  id: string;
  family: string;
  description: string;
  status: ComplianceControlStatus;
  evidenceSource: string;
  lastEvidenceAt: string | null;
  findingsImpacting?: string[];
};

export type ComplianceFramework = {
  slug: ComplianceFrameworkSlug;
  name: string;
  appliesTo: string;
  controls: ComplianceControl[];
};

export type ComplianceCoverage = {
  framework: ComplianceFramework;
  satisfied: number;
  partial: number;
  gap: number;
  percent: number;
  controls: (ComplianceControl & { findingsImpacting: string[] })[];
  findingsByControl: Record<string, string[]>;
};
