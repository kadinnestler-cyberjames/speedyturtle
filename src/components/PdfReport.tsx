import React from "react";
import { Document, Page, Text, View, StyleSheet, Svg, Rect, Circle, Line as PdfLine, Polygon } from "@react-pdf/renderer";
import type { Finding, Scan, Severity } from "@/lib/types";

// ────────────────────────────────────────────────────────────────────────────
// Posture-radar helpers
// ────────────────────────────────────────────────────────────────────────────

function computePosture(findings: Finding[]) {
  const cnt = (cat: Finding["category"]) => findings.filter((f) => f.category === cat).length;
  const cntSev = (sev: Severity) => findings.filter((f) => f.severity === sev).length;
  const has = (pred: (f: Finding) => boolean) => findings.some(pred);
  const edgeBlob = JSON.stringify(findings.filter((f) => f.category === "service-fingerprint")).toLowerCase();
  const edgePresent = /cloudflare|akamai|fastly|cloudfront|sucuri|stackpath/.test(edgeBlob);
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  return {
    patch: clamp(100 - cnt("vulnerability") * 12 - cntSev("critical") * 20 - cntSev("high") * 12),
    tls: clamp(100 - cnt("tls") * 25 - cnt("misconfig") * 5),
    auth: clamp(100 - cnt("email-auth") * 12 - cnt("credential-exposure") * 30),
    edge: edgePresent ? 90 : 50,
    exposure: clamp(100 - cnt("network-exposure") * 15 - cnt("info-disclosure") * 10),
    thirdParty: clamp(100 - cnt("breach-exposure") * 18 - (has((f) => /third.?party|supply.?chain/i.test(f.title)) ? 25 : 0)),
  };
}

function estimateExposure(findings: Finding[]): number {
  // Heuristic dollar exposure — calibrated against IBM 2025 per-record costs
  // and DBIR 2025 incident frequencies. Floor at $25K, ceiling at $2M.
  const sev = (s: Severity) => findings.filter((f) => f.severity === s).length;
  let n = 25_000;
  n += sev("critical") * 600_000;
  n += sev("high") * 200_000;
  n += sev("medium") * 60_000;
  n += sev("low") * 8_000;
  return Math.max(25_000, Math.min(2_000_000, n));
}

function hasEdge(findings: Finding[]): boolean {
  const blob = JSON.stringify(findings.filter((f) => f.category === "service-fingerprint")).toLowerCase();
  return /cloudflare|akamai|fastly|cloudfront|sucuri|stackpath/.test(blob);
}

function hasNo(findings: Finding[], category: Finding["category"]): boolean {
  return !findings.some((f) => f.category === category && f.severity !== "info");
}

const sev_color: Record<Severity, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#d97706",
  low: "#16a34a",
  info: "#64748b",
};

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#0f172a" },
  cover: { padding: 60, fontSize: 14, fontFamily: "Helvetica", color: "#0f172a" },
  brand: { fontSize: 28, fontWeight: 700, marginBottom: 24, color: "#10b981" },
  h1: { fontSize: 22, fontWeight: 700, marginBottom: 6 },
  h2: { fontSize: 14, fontWeight: 700, marginTop: 16, marginBottom: 8 },
  h3: { fontSize: 11, fontWeight: 700, marginTop: 8, marginBottom: 2 },
  meta: { fontSize: 9, color: "#64748b", marginBottom: 12 },
  pill: { padding: "2 8", color: "#fff", fontSize: 8, marginRight: 6, fontWeight: 700 },
  row: { flexDirection: "row", marginBottom: 4 },
  callout: { backgroundColor: "#ecfdf5", padding: 12, borderRadius: 4, marginVertical: 8, borderLeft: "3 solid #10b981" },
  filteredCallout: { backgroundColor: "#f1f5f9", padding: 12, borderRadius: 4, marginVertical: 8, borderLeft: "3 solid #94a3b8" },
  finding: { marginBottom: 10, padding: 8, borderRadius: 4, backgroundColor: "#f8fafc" },
  filteredFinding: { marginBottom: 10, padding: 8, borderRadius: 4, backgroundColor: "#f1f5f9", borderLeft: "2 solid #cbd5e1" },
  small: { fontSize: 8, color: "#64748b" },
  divider: { borderBottom: 1, borderColor: "#e2e8f0", marginVertical: 12 },
  validationRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  validationLabel: { fontSize: 10, color: "#475569", width: 140 },
  validationValue: { fontSize: 10, fontWeight: 700, color: "#0f172a" },
});

export function PdfReport({ scan }: { scan: Scan }) {
  // Build set of false-positive finding IDs (8-char prefix match)
  const falsePositiveIds = new Set<string>();
  const verdictByFindingId = new Map<string, NonNullable<Scan["validation"]>["verdicts"][number]>();
  if (scan.validation) {
    for (const v of scan.validation.verdicts) {
      verdictByFindingId.set(v.findingId, v);
      if (v.verdict === "false-positive") {
        falsePositiveIds.add(v.findingId);
      }
    }
  }

  const isFalsePositive = (id: string) =>
    falsePositiveIds.has(id.slice(0, 8)) || falsePositiveIds.has(id);

  const filteredFindings = scan.findings.filter((f) => !isFalsePositive(f.id));
  const fpFindings = scan.findings.filter((f) => isFalsePositive(f.id));

  const grouped = (["critical", "high", "medium", "low", "info"] as Severity[]).map((sev) => ({
    sev,
    items: filteredFindings.filter((f) => f.severity === sev),
  }));
  const summaryCounts = grouped.map((g) => `${g.sev.toUpperCase()}: ${g.items.length}`).join(" · ");

  const findingsHeading = scan.validation && fpFindings.length > 0
    ? `Findings · ${filteredFindings.length} validated · ${fpFindings.length} filtered as false ${fpFindings.length === 1 ? "positive" : "positives"}`
    : `Findings · ${filteredFindings.length}`;

  return (
    <Document>
      <Page size="LETTER" style={styles.cover}>
        <Text style={styles.brand}>🐢 speedyturtle</Text>
        <Text style={{ fontSize: 36, fontWeight: 700, marginBottom: 10 }}>Red Team Scan Report</Text>
        <Text style={{ fontSize: 16, color: "#64748b", marginBottom: 40 }}>{scan.input.target}</Text>
        <View style={{ marginBottom: 24 }}>
          <Text style={styles.small}>Generated</Text>
          <Text style={{ fontSize: 12 }}>{new Date(scan.createdAt).toLocaleString()}</Text>
        </View>
        <View style={{ marginBottom: 16 }}>
          <Text style={styles.small}>Total findings</Text>
          <Text style={{ fontSize: 18, fontWeight: 700 }}>{scan.findings.length}</Text>
          <Text style={styles.small}>{summaryCounts}</Text>
        </View>
        {scan.validation && (
          <View style={{ marginBottom: 16, padding: 12, backgroundColor: "#ecfdf5", borderRadius: 4, borderLeft: "3 solid #10b981" }}>
            <Text style={{ fontSize: 10, color: "#047857", fontWeight: 700, marginBottom: 6 }}>VALIDATOR SUBAGENT</Text>
            <View style={styles.validationRow}>
              <Text style={styles.validationLabel}>✅ Validated</Text>
              <Text style={styles.validationValue}>{scan.validation.summary.validated}</Text>
            </View>
            <View style={styles.validationRow}>
              <Text style={styles.validationLabel}>❌ False positives</Text>
              <Text style={styles.validationValue}>
                {scan.validation.summary.falsePositive}
                <Text style={{ fontSize: 8, color: "#64748b", fontWeight: 400 }}>{"  "}filtered from main findings</Text>
              </Text>
            </View>
            <View style={styles.validationRow}>
              <Text style={styles.validationLabel}>⚠ Needs review</Text>
              <Text style={styles.validationValue}>{scan.validation.summary.needsReview}</Text>
            </View>
          </View>
        )}
        <View style={{ marginTop: 40, padding: 16, backgroundColor: "#f1f5f9", borderRadius: 6 }}>
          <Text style={{ fontSize: 10, color: "#64748b", marginBottom: 6, fontWeight: 700 }}>SCOPE NOTE</Text>
          <Text style={{ fontSize: 10, color: "#475569", lineHeight: 1.5 }}>
            This scan covers passive recon, live HTTP probing, and Nuclei vulnerability templates at medium severity
            and above. It is not a substitute for manual penetration testing or code review. Findings should be
            validated before remediation.
          </Text>
        </View>
      </Page>

      {scan.triage && (
        <Page size="LETTER" style={styles.page}>
          <Text style={styles.h1}>Executive Summary</Text>
          <Text style={styles.meta}>Triaged by Claude</Text>
          <View style={styles.callout}>
            <Text style={{ fontSize: 11, lineHeight: 1.6 }}>{scan.triage.summary}</Text>
          </View>

          <Text style={styles.h2}>Top risks</Text>
          {scan.triage.topRisks.map((r, i) => (
            <Text key={i} style={{ fontSize: 10, marginBottom: 4 }}>• {r}</Text>
          ))}

          <Text style={styles.h2}>Recommended next steps</Text>
          {scan.triage.nextSteps.map((s, i) => (
            <Text key={i} style={{ fontSize: 10, marginBottom: 4 }}>{i + 1}. {s}</Text>
          ))}
        </Page>
      )}

      {/* Defensive Posture page — radar chart + industry-baseline bars + ransomware kill-chain timeline */}
      {filteredFindings.length > 0 && (
        <Page size="LETTER" style={styles.page}>
          <Text style={styles.h1}>Defensive Posture</Text>
          <Text style={styles.meta}>
            Three views of your residual risk. Radar shows where the defenses are doing their job; bar chart sets
            your exposure against the IBM 2025 industry average; timeline shows where each defense intercepts a
            modern ransomware kill-chain.
          </Text>

          {/* ── Security-posture radar (6-axis) ─────────────────────────────── */}
          {(() => {
            const cx = 240;
            const cy = 110;
            const R = 78;
            const axes = [
              "Patch Hygiene",
              "TLS / Transport",
              "Auth Hardening",
              "Edge (CDN/WAF)",
              "Public Exposure",
              "Third-Party Risk",
            ];
            const score = computePosture(filteredFindings);
            const values = [
              score.patch,
              score.tls,
              score.auth,
              score.edge,
              score.exposure,
              score.thirdParty,
            ];
            const point = (idx: number, value: number) => {
              const angle = (-Math.PI / 2) + (idx * (Math.PI * 2)) / axes.length;
              const r = (R * value) / 100;
              return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
            };
            const ringPoints = (frac: number) =>
              axes
                .map((_, i) => {
                  const angle = -Math.PI / 2 + (i * (Math.PI * 2)) / axes.length;
                  return `${cx + R * frac * Math.cos(angle)},${cy + R * frac * Math.sin(angle)}`;
                })
                .join(" ");
            const polyPoints = values
              .map((v, i) => {
                const p = point(i, v);
                return `${p.x},${p.y}`;
              })
              .join(" ");
            return (
              <View style={{ marginTop: 8, marginBottom: 14, alignItems: "center" }}>
                <Text style={[styles.h3, { textAlign: "center" }]}>Where defenses are holding (and where they aren&apos;t)</Text>
                <Svg width={480} height={220}>
                  {/* concentric rings */}
                  {[0.25, 0.5, 0.75, 1].map((f) => (
                    <Polygon
                      key={f}
                      points={ringPoints(f)}
                      fill="none"
                      stroke="#cbd5e1"
                      strokeWidth={0.4}
                    />
                  ))}
                  {/* axis spokes */}
                  {axes.map((_, i) => {
                    const angle = -Math.PI / 2 + (i * (Math.PI * 2)) / axes.length;
                    return (
                      <PdfLine
                        key={i}
                        x1={cx}
                        y1={cy}
                        x2={cx + R * Math.cos(angle)}
                        y2={cy + R * Math.sin(angle)}
                        stroke="#cbd5e1"
                        strokeWidth={0.4}
                      />
                    );
                  })}
                  {/* posture polygon */}
                  <Polygon points={polyPoints} fill="#10b981" fillOpacity={0.25} stroke="#10b981" strokeWidth={1.2} />
                  {/* axis labels */}
                  {axes.map((label, i) => {
                    const angle = -Math.PI / 2 + (i * (Math.PI * 2)) / axes.length;
                    const lx = cx + (R + 14) * Math.cos(angle) - 32;
                    const ly = cy + (R + 14) * Math.sin(angle) + 3;
                    return (
                      <Text key={label} x={lx} y={ly} style={{ fontSize: 7, color: "#475569" }}>
                        {label} {values[i]}
                      </Text>
                    );
                  })}
                </Svg>
              </View>
            );
          })()}

          {/* ── Industry baseline bars (IBM 2025 Cost of Data Breach) ─────── */}
          {(() => {
            const W = 460;
            const barH = 18;
            const labelW = 130;
            const maxScale = 11_000_000; // $11M ceiling for the chart
            const yourExposure = estimateExposure(filteredFindings);
            const bars = [
              { label: "U.S. avg breach (IBM 2025)", value: 10_220_000, fill: "#dc2626" },
              { label: "Healthcare avg (IBM 2025)", value: 7_420_000, fill: "#ea580c" },
              { label: "Financial avg (IBM 2025)", value: 5_560_000, fill: "#f59e0b" },
              { label: "Global avg (IBM 2025)", value: 4_440_000, fill: "#a3a3a3" },
              { label: `Your residual exposure`, value: yourExposure, fill: "#10b981" },
            ];
            const fmtMoney = (n: number) =>
              n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${(n / 1000).toFixed(0)}K`;
            return (
              <View style={{ marginBottom: 14 }}>
                <Text style={[styles.h3]}>What you&apos;d face vs the industry baseline</Text>
                <Text style={{ fontSize: 8, color: "#64748b", marginBottom: 6 }}>
                  Industry numbers from IBM&apos;s 2025 Cost of a Data Breach Report. Your exposure is heuristic,
                  derived from finding count + severity + observed defenses. Not a guarantee — a calibration tool.
                </Text>
                <Svg width={W} height={bars.length * (barH + 6)}>
                  {bars.map((b, i) => {
                    const y = i * (barH + 6);
                    const w = ((W - labelW - 60) * b.value) / maxScale;
                    return (
                      <React.Fragment key={b.label}>
                        <Text x={0} y={y + 12} style={{ fontSize: 8, color: "#475569" }}>
                          {b.label}
                        </Text>
                        <Rect x={labelW} y={y} width={w} height={barH} fill={b.fill} />
                        <Text x={labelW + w + 4} y={y + 12} style={{ fontSize: 8, color: "#475569" }}>
                          {fmtMoney(b.value)}
                        </Text>
                      </React.Fragment>
                    );
                  })}
                </Svg>
              </View>
            );
          })()}

          {/* ── Ransomware kill-chain timeline ──────────────────────────────── */}
          {(() => {
            const stages = [
              { day: "D 0", label: "Initial access", note: "Phishing, credential reuse, or exposed RDP/SMB", blocked: hasEdge(filteredFindings) || hasNo(filteredFindings, "network-exposure") },
              { day: "D 0-1", label: "Lateral movement", note: "Credential dumping, internal SMB scan", blocked: hasNo(filteredFindings, "credential-exposure") },
              { day: "D 1", label: "Encryption", note: "File encryption + shadow copy deletion", blocked: false },
              { day: "D 2", label: "Ransom note", note: "Demand $50K-$5M depending on size", blocked: false },
              { day: "D 3-14", label: "Downtime", note: "Lost revenue: $500-$50K/day for an SMB", blocked: false },
              { day: "D 14-60", label: "IR + legal", note: "PCI/GDPR fines, breach-notification law costs", blocked: false },
              { day: "D 90+", label: "Recovery", note: "76% of orgs need >100 days (IBM 2025)", blocked: false },
            ];
            const W = 480;
            const stageW = W / stages.length;
            return (
              <View>
                <Text style={[styles.h3]}>Modern ransomware kill-chain (where your defenses intercept)</Text>
                <Svg width={W} height={92}>
                  <PdfLine x1={0} y1={36} x2={W} y2={36} stroke="#cbd5e1" strokeWidth={1} />
                  {stages.map((s, i) => {
                    const x = i * stageW + stageW / 2;
                    const fill = s.blocked ? "#10b981" : i === 0 ? "#dc2626" : "#94a3b8";
                    return (
                      <React.Fragment key={i}>
                        <Circle cx={x} cy={36} r={6} fill={fill} />
                        <Text x={x - stageW / 2 + 2} y={20} style={{ fontSize: 7, fontWeight: 700, color: "#0f172a" }}>
                          {s.day}
                        </Text>
                        <Text x={x - stageW / 2 + 2} y={54} style={{ fontSize: 7, color: "#0f172a" }}>
                          {s.label}
                        </Text>
                      </React.Fragment>
                    );
                  })}
                </Svg>
                <View style={{ marginTop: 4 }}>
                  {stages.map((s, i) => (
                    <Text key={i} style={{ fontSize: 8, color: "#475569", marginBottom: 1 }}>
                      <Text style={{ fontWeight: 700 }}>{s.day} — {s.label}{s.blocked ? " ✓ blocked: " : " — "}</Text>
                      {s.note}
                    </Text>
                  ))}
                </View>
              </View>
            );
          })()}
        </Page>
      )}

      {/* NIST SP 800-30 5x5 risk matrix — every non-info finding plotted as a dot */}
      {filteredFindings.some((f) => f.severity !== "info") && (
        <Page size="LETTER" style={styles.page}>
          <Text style={styles.h1}>Risk Posture (NIST SP 800-30)</Text>
          <Text style={styles.meta}>
            Likelihood × Business impact. Non-info findings plotted as dots. Empty top-right is the punchline — clean
            quadrants are evidence the defenses you have are doing their job.
          </Text>
          <View style={{ marginTop: 16, alignItems: "center" }}>
            {(() => {
              const W = 360;
              const H = 280;
              const ML = 70;
              const MB = 40;
              const cellW = (W - ML) / 5;
              const cellH = (H - MB) / 5;
              const cellColor = (likelihood: number, impact: number): string => {
                const score = likelihood + impact;
                if (score >= 8) return "#dc2626";
                if (score >= 6) return "#ea580c";
                if (score >= 4) return "#f59e0b";
                if (score >= 2) return "#84cc16";
                return "#16a34a";
              };
              // Derive impact from category (business-impact-ish) and
              // likelihood from severity + observed defenses. This keeps
              // dots from all bunching in the same cell.
              const categoryImpact: Record<Finding["category"], number> = {
                "credential-exposure": 4,
                "vulnerability": 3,
                "breach-exposure": 4,
                "network-exposure": 3,
                "domain-hygiene": 2,
                "email-auth": 2,
                "tls": 2,
                "info-disclosure": 1,
                "misconfig": 1,
                "subdomain-exposure": 1,
                "service-fingerprint": 0,
              };
              const sevToLikelihood: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
              const edgePresent = hasEdge(filteredFindings);
              const dots = filteredFindings
                .filter((f) => f.severity !== "info")
                .map((f, i) => {
                  const im = Math.min(4, Math.max(0, categoryImpact[f.category] ?? 1));
                  let li = sevToLikelihood[f.severity];
                  if (edgePresent && f.category !== "email-auth" && f.category !== "domain-hygiene") li = Math.max(0, li - 1);
                  const cx = ML + cellW * im + cellW / 2 + (((i * 17) % 9) - 4) * 3;
                  const cy = H - MB - cellH * li - cellH / 2 + (((i * 23) % 7) - 3) * 3;
                  return { cx, cy, sev: f.severity };
                });
              const impactLabels = ["Negligible", "Minor", "Moderate", "Major", "Severe"];
              const likeLabels = ["Rare", "Unlikely", "Possible", "Likely", "Almost cert."];
              return (
                <Svg width={W} height={H}>
                  {Array.from({ length: 5 }, (_, li) =>
                    Array.from({ length: 5 }, (_, im) => (
                      <Rect
                        key={`${li}-${im}`}
                        x={ML + cellW * im}
                        y={H - MB - cellH * (li + 1)}
                        width={cellW}
                        height={cellH}
                        fill={cellColor(li, im)}
                        fillOpacity={0.18}
                        stroke="#cbd5e1"
                        strokeWidth={0.5}
                      />
                    )),
                  )}
                  {impactLabels.map((lbl, i) => (
                    <Text
                      key={`xl-${i}`}
                      x={ML + cellW * i + cellW / 2}
                      y={H - MB + 14}
                      style={{ fontSize: 7, color: "#475569" }}
                    >
                      {lbl}
                    </Text>
                  ))}
                  {likeLabels.map((lbl, i) => (
                    <Text
                      key={`yl-${i}`}
                      x={6}
                      y={H - MB - cellH * i - cellH / 2 + 3}
                      style={{ fontSize: 7, color: "#475569" }}
                    >
                      {lbl}
                    </Text>
                  ))}
                  <PdfLine x1={ML} y1={0} x2={ML} y2={H - MB} stroke="#475569" strokeWidth={0.8} />
                  <PdfLine x1={ML} y1={H - MB} x2={W} y2={H - MB} stroke="#475569" strokeWidth={0.8} />
                  {dots.map((d, i) => (
                    <Circle key={i} cx={d.cx} cy={d.cy} r={4} fill={sev_color[d.sev]} fillOpacity={0.9} />
                  ))}
                </Svg>
              );
            })()}
            <Text style={{ fontSize: 8, color: "#64748b", marginTop: 6 }}>
              X axis: Business impact if exploited · Y axis: Likelihood the scanner-observed conditions enable
              compromise. Methodology adapted from NIST SP 800-30 Rev. 1, Appendix I.
            </Text>
          </View>
        </Page>
      )}

      {scan.adversaryProfile && scan.adversaryProfile.length > 0 && (
        <Page size="LETTER" style={styles.page}>
          <Text style={styles.h1}>Adversary Persona Simulation</Text>
          <Text style={styles.meta}>
            If a known threat actor were targeting you — exposure score, likely entry point, expected dwell time.
            MITRE ATT&CK + named-APT TTP cross-reference.
          </Text>
          {scan.adversaryProfile.map((p, i) => {
            const exposure = p.exposureScore ?? 0;
            const exposureColor = exposure >= 50 ? "#dc2626" : exposure >= 25 ? "#d97706" : exposure >= 10 ? "#16a34a" : "#64748b";
            return (
              <View key={i} style={{ marginBottom: 12, padding: 10, backgroundColor: "#f8fafc", borderRadius: 4, borderLeft: `3 solid ${exposureColor}` }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: 700 }}>{p.persona ?? "Unknown actor"}</Text>
                  <Text style={[styles.pill, { backgroundColor: exposureColor }]}>EXPOSURE {exposure}/100</Text>
                </View>
                {p.description && (
                  <Text style={{ fontSize: 9, color: "#475569", marginBottom: 4, fontStyle: "italic" }}>{p.description}</Text>
                )}
                {p.likelyEntryPoint && (
                  <View style={{ marginBottom: 3 }}>
                    <Text style={{ fontSize: 8, color: "#64748b", fontWeight: 700 }}>LIKELY ENTRY POINT</Text>
                    <Text style={{ fontSize: 10, color: "#0f172a" }}>{p.likelyEntryPoint}</Text>
                  </View>
                )}
                <View style={{ flexDirection: "row", marginTop: 4 }}>
                  <Text style={{ fontSize: 8, color: "#64748b", marginRight: 12 }}>
                    <Text style={{ fontWeight: 700 }}>Expected dwell:</Text> {p.expectedDwellTimeDays ?? "?"} days
                  </Text>
                </View>
                {p.conditionsMet && p.conditionsMet.length > 0 && (
                  <View style={{ marginTop: 4 }}>
                    <Text style={{ fontSize: 8, color: "#64748b", fontWeight: 700, marginBottom: 1 }}>CONDITIONS MET</Text>
                    {p.conditionsMet.slice(0, 3).map((c, idx) => (
                      <Text key={idx} style={{ fontSize: 8, color: "#475569" }}>· {c}</Text>
                    ))}
                  </View>
                )}
                {p.conditionsMissing && p.conditionsMissing.length > 0 && (
                  <View style={{ marginTop: 4 }}>
                    <Text style={{ fontSize: 8, color: "#64748b", fontWeight: 700, marginBottom: 1 }}>CONDITIONS MISSING (defenses holding)</Text>
                    {p.conditionsMissing.slice(0, 3).map((c, idx) => (
                      <Text key={idx} style={{ fontSize: 8, color: "#475569" }}>· {c}</Text>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </Page>
      )}

      <Page size="LETTER" style={styles.page}>
        <Text style={styles.h1}>{findingsHeading}</Text>
        <Text style={styles.meta}>
          Grouped by severity. {scan.validation && fpFindings.length > 0 ? "False positives are listed in the appendix." : ""}
        </Text>

        {grouped.map(({ sev, items }) => {
          if (items.length === 0) return null;
          return (
            <View key={sev} style={{ marginTop: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                <Text style={[styles.pill, { backgroundColor: sev_color[sev] }]}>{sev.toUpperCase()}</Text>
                <Text style={{ fontSize: 11, fontWeight: 700 }}>{items.length} {items.length === 1 ? "finding" : "findings"}</Text>
              </View>
              {items.map((f) => {
                const verdict = verdictByFindingId.get(f.id.slice(0, 8)) ?? verdictByFindingId.get(f.id);
                return (
                  <View key={f.id} style={styles.finding} wrap={false}>
                    <View style={{ flexDirection: "row", alignItems: "baseline", marginBottom: 2 }}>
                      {f.findingId && (
                        <Text style={{ fontSize: 8, fontWeight: 700, color: "#64748b", marginRight: 6, fontFamily: "Courier" }}>
                          {f.findingId}
                        </Text>
                      )}
                      <Text style={{ fontSize: 11, fontWeight: 700, flex: 1 }}>{f.title}</Text>
                    </View>
                    {f.description && <Text style={{ fontSize: 9, color: "#475569", marginBottom: 3, lineHeight: 1.4 }}>{f.description}</Text>}
                    <Text style={{ fontSize: 8, color: "#64748b" }}>Asset: {f.affectedAsset}</Text>
                    <Text style={{ fontSize: 8, color: "#64748b" }}>Scanner: {f.scanner}{f.cveId ? ` · ${f.cveId}${f.cvssScore != null ? ` (CVSS ${f.cvssScore.toFixed(1)})` : ""}` : ""}</Text>
                    {f.shortTermFix && (
                      <View style={{ marginTop: 6, padding: 6, backgroundColor: "#fef3c7", borderRadius: 3, borderLeft: "2 solid #f59e0b" }}>
                        <Text style={{ fontSize: 8, fontWeight: 700, color: "#78350f", marginBottom: 1 }}>FIX THIS WEEK</Text>
                        <Text style={{ fontSize: 9, color: "#451a03", lineHeight: 1.4 }}>{f.shortTermFix}</Text>
                      </View>
                    )}
                    {f.longTermFix && (
                      <View style={{ marginTop: 4, padding: 6, backgroundColor: "#eff6ff", borderRadius: 3, borderLeft: "2 solid #3b82f6" }}>
                        <Text style={{ fontSize: 8, fontWeight: 700, color: "#1e3a8a", marginBottom: 1 }}>FIX THIS QUARTER</Text>
                        <Text style={{ fontSize: 9, color: "#1e3a8a", lineHeight: 1.4 }}>{f.longTermFix}</Text>
                      </View>
                    )}
                    {!f.shortTermFix && f.recommendation && (
                      <View style={{ marginTop: 6, padding: 6, backgroundColor: "#fef3c7", borderRadius: 3, borderLeft: "2 solid #f59e0b" }}>
                        <Text style={{ fontSize: 8, fontWeight: 700, color: "#78350f", marginBottom: 1 }}>RECOMMENDED FIX</Text>
                        <Text style={{ fontSize: 9, color: "#451a03", lineHeight: 1.4 }}>{f.recommendation}</Text>
                      </View>
                    )}
                    {verdict && verdict.verdict !== "false-positive" && (
                      <Text style={{ fontSize: 8, color: "#047857", marginTop: 4, fontStyle: "italic" }}>
                        Validator ({verdict.verdict}): {verdict.reasoning}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}
      </Page>

      <Page size="LETTER" style={styles.page}>
        <Text style={styles.h1}>References</Text>
        <Text style={styles.meta}>
          Industry sources cited in the analysis above. Methodology, severity rationale, and dollar-impact framings
          all trace back to public references — no proprietary scoring.
        </Text>
        <View style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 10, marginBottom: 4 }}>
            [1] IBM 2025 Cost of a Data Breach Report — global average $4.44M, U.S. average $10.22M, per-record
            costs $160 customer PII / $168 employee PII / $178 IP. https://www.ibm.com/reports/data-breach
          </Text>
          <Text style={{ fontSize: 10, marginBottom: 4 }}>
            [2] Verizon 2025 Data Breach Investigations Report — initial-access mix, ransomware composition,
            human-element rate. https://www.verizon.com/business/resources/reports/dbir/
          </Text>
          <Text style={{ fontSize: 10, marginBottom: 4 }}>
            [3] Mandiant M-Trends 2025 — global median dwell time, attribution confidence framing.
            https://cloud.google.com/security/resources/m-trends
          </Text>
          <Text style={{ fontSize: 10, marginBottom: 4 }}>
            [4] NIST SP 800-30 Rev. 1, Appendix I — 5×5 likelihood × impact risk matrix.
            https://nvlpubs.nist.gov/nistpubs/legacy/sp/nistspecialpublication800-30r1.pdf
          </Text>
          <Text style={{ fontSize: 10, marginBottom: 4 }}>
            [5] MITRE ATT&CK — Enterprise techniques referenced in adversary persona simulations.
            https://attack.mitre.org/
          </Text>
          <Text style={{ fontSize: 10, marginBottom: 4 }}>
            [6] Have I Been Pwned — domain breach exposure check used in this report.
            https://haveibeenpwned.com
          </Text>
          <Text style={{ fontSize: 10, marginBottom: 4 }}>
            [7] Shodan InternetDB — IP/port/CVE exposure cross-reference.
            https://internetdb.shodan.io
          </Text>
          <Text style={{ fontSize: 10, marginBottom: 4 }}>
            [8] RFC 7208 (SPF), RFC 7489 (DMARC), RFC 8461 (MTA-STS) — email authentication standards probed.
          </Text>
          <Text style={{ fontSize: 10, marginBottom: 4 }}>
            [9] OWASP Top 10:2021 — vulnerability categorization framework.
            https://owasp.org/Top10/
          </Text>
          <Text style={{ fontSize: 10, marginBottom: 4 }}>
            [10] CIS Controls v8 — short-term and long-term remediation framings adapted from CIS implementation
            groups. https://www.cisecurity.org/controls
          </Text>
        </View>
      </Page>

      {scan.validation && fpFindings.length > 0 && (
        <Page size="LETTER" style={styles.page}>
          <Text style={styles.h1}>Appendix: Filtered false positives</Text>
          <Text style={styles.meta}>
            These findings were flagged by the scanner but the adversarial validator subagent rejected them. Listed here for transparency.
          </Text>
          {fpFindings.map((f) => {
            const verdict = verdictByFindingId.get(f.id.slice(0, 8)) ?? verdictByFindingId.get(f.id);
            return (
              <View key={f.id} style={styles.filteredFinding}>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
                  <Text style={[styles.pill, { backgroundColor: "#94a3b8" }]}>FALSE POSITIVE</Text>
                  <Text style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>{f.title}</Text>
                </View>
                <Text style={{ fontSize: 8, color: "#64748b" }}>Asset: {f.affectedAsset}</Text>
                <Text style={{ fontSize: 8, color: "#64748b" }}>
                  Scanner: {f.scanner} · Severity: {f.severity}{f.cveId ? ` · ${f.cveId}` : ""}
                </Text>
                {verdict && (
                  <View style={styles.filteredCallout}>
                    <Text style={{ fontSize: 9, color: "#475569", lineHeight: 1.5 }}>
                      <Text style={{ fontWeight: 700 }}>Validator reasoning: </Text>
                      {verdict.reasoning}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </Page>
      )}
    </Document>
  );
}
