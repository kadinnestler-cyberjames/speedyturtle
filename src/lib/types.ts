export type ScanMode = "red-team" | "blue-team";

export type ScanStatus = "queued" | "running" | "ready" | "failed";

export type Severity = "info" | "low" | "medium" | "high" | "critical";

export type ScanInput = {
  target: string; // e.g. "example.com" or "https://example.com"
  mode: ScanMode;
  email: string;
  authorizationConfirmed: boolean;
};

export type Finding = {
  id: string;
  severity: Severity;
  category:
    | "subdomain-exposure"
    | "service-fingerprint"
    | "vulnerability"
    | "misconfig"
    | "tls"
    | "info-disclosure"
    | "credential-exposure";
  title: string;
  description: string;
  evidence?: string;
  affectedAsset: string;
  scanner: "subfinder" | "httpx" | "nuclei" | "claude-triage";
  recommendation?: string;
  cveId?: string;
  cvssScore?: number;
};

export type ScanProgress = {
  step: "queued" | "subfinder" | "httpx" | "nuclei" | "triage" | "report" | "done";
  pct: number;
  message: string;
};

export type ExploitChain = {
  id: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  attackChain: { step: number; description: string; usesFindings: string[]; primitive: string }[];
  whyScannersMiss: string;
  defensiveBreakpoint: string;
  attackerPersona?: string;
  mermaid?: string;
};

export type CheapestCut = {
  mitigation: string;
  chainsBroken: number;
  implementationCost: string;
  explanation: string;
};

export type AdversaryAssessment = {
  persona: "APT29" | "Lazarus" | "Sandworm" | "ScatteredSpider" | "GenericRansomware";
  description: string;
  conditionsMet: string[];
  conditionsMissing: string[];
  exposureScore: number;
  likelyEntryPoint: string;
  expectedDwellTimeDays: number;
};

export type Scan = {
  id: string;
  createdAt: string;
  input: ScanInput;
  status: ScanStatus;
  progress: ScanProgress;
  findings: Finding[];
  triage?: {
    summary: string;
    topRisks: string[];
    nextSteps: string[];
  };
  exploitChains?: ExploitChain[];
  exploitChainsNote?: string;
  cheapestCut?: CheapestCut | null;
  adversaryProfile?: AdversaryAssessment[];
  validation?: {
    verdicts: { findingId: string; verdict: "validated" | "false-positive" | "needs-review"; reasoning: string; manualCheckNeeded?: string }[];
    summary: { validated: number; falsePositive: number; needsReview: number };
  };
  genealogy?: {
    families: {
      familyName: string;
      groupedFindings: string[];
      lineage: { year: string; cveId: string; summary: string }[];
      evolution: string;
      nextMutation: string;
      defensiveInvariant: string;
    }[];
  };
  durationMs?: number;
  error?: string;
};
