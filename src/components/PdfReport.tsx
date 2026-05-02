import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { Scan, Severity } from "@/lib/types";

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
                  <View key={f.id} style={styles.finding}>
                    <Text style={{ fontSize: 11, fontWeight: 700, marginBottom: 2 }}>{f.title}</Text>
                    {f.description && <Text style={{ fontSize: 9, color: "#475569", marginBottom: 3 }}>{f.description}</Text>}
                    <Text style={{ fontSize: 8, color: "#64748b" }}>Asset: {f.affectedAsset}</Text>
                    <Text style={{ fontSize: 8, color: "#64748b" }}>Scanner: {f.scanner}{f.cveId ? ` · ${f.cveId} (CVSS ${f.cvssScore?.toFixed(1)})` : ""}</Text>
                    {verdict && verdict.verdict !== "false-positive" && (
                      <Text style={{ fontSize: 8, color: "#047857", marginTop: 3, fontStyle: "italic" }}>
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
