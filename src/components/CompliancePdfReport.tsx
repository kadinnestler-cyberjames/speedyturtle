import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { ComplianceCoverage, ComplianceControlStatus } from "@/lib/blue-team/types";

const STATUS_COLOR: Record<ComplianceControlStatus, string> = {
  satisfied: "#16a34a",
  partial: "#d97706",
  gap: "#dc2626",
};

const styles = StyleSheet.create({
  cover: { padding: 60, fontSize: 14, fontFamily: "Helvetica", color: "#0f172a" },
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#0f172a" },
  brand: { fontSize: 28, fontWeight: 700, marginBottom: 24, color: "#0ea5e9" },
  h1: { fontSize: 22, fontWeight: 700, marginBottom: 6 },
  h2: { fontSize: 14, fontWeight: 700, marginTop: 16, marginBottom: 8 },
  meta: { fontSize: 9, color: "#64748b", marginBottom: 12 },
  small: { fontSize: 8, color: "#64748b" },
  pill: { padding: "2 6", color: "#fff", fontSize: 8, fontWeight: 700 },
  control: { marginBottom: 8, padding: 8, borderRadius: 4, backgroundColor: "#f8fafc" },
  callout: { backgroundColor: "#e0f2fe", padding: 12, borderRadius: 4, marginVertical: 8, borderLeft: "3 solid #0ea5e9" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});

export function CompliancePdfReport({
  coverage,
  scanTarget,
  scanId,
}: {
  coverage: ComplianceCoverage;
  scanTarget: string | null;
  scanId: string | null;
}) {
  const fw = coverage.framework;
  const total = fw.controls.length;

  return (
    <Document>
      <Page size="LETTER" style={styles.cover}>
        <Text style={styles.brand}>speedyturtle Blue Team</Text>
        <Text style={{ fontSize: 30, fontWeight: 700, marginBottom: 10 }}>{fw.name}</Text>
        <Text style={{ fontSize: 14, color: "#64748b", marginBottom: 32 }}>{fw.appliesTo}</Text>

        <View style={{ marginBottom: 24 }}>
          <Text style={styles.small}>Coverage</Text>
          <Text style={{ fontSize: 48, fontWeight: 700, color: "#0ea5e9" }}>{coverage.percent}%</Text>
        </View>

        <View style={{ marginBottom: 12 }}>
          <Text style={styles.small}>Status breakdown</Text>
          <Text style={{ fontSize: 12 }}>
            Satisfied: {coverage.satisfied} of {total} | Partial: {coverage.partial} | Gap: {coverage.gap}
          </Text>
        </View>

        {scanTarget ? (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.small}>Tied to scan</Text>
            <Text style={{ fontSize: 12 }}>{scanTarget}</Text>
            {scanId ? <Text style={styles.small}>Scan ID: {scanId}</Text> : null}
          </View>
        ) : (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.small}>Baseline view (no scan attached)</Text>
          </View>
        )}

        <View style={{ marginTop: 60, padding: 16, backgroundColor: "#f1f5f9", borderRadius: 6 }}>
          <Text style={{ fontSize: 10, color: "#64748b", marginBottom: 6, fontWeight: 700 }}>HOW THIS REPORT WAS BUILT</Text>
          <Text style={{ fontSize: 10, color: "#475569", lineHeight: 1.5 }}>
            speedyturtle Blue Team starts from the published controls for {fw.name} and overlays your live scan findings.
            Any high or critical finding mapped to a control downgrades that control to gap. Mediums downgrade to partial.
            This is a continuous-evidence approach — not a substitute for a signed audit.
          </Text>
        </View>
      </Page>

      <Page size="LETTER" style={styles.page}>
        <Text style={styles.h1}>Per-control coverage</Text>
        <Text style={styles.meta}>{total} controls in this framework. Status reflects the overlay of live findings on the baseline.</Text>

        {fw.controls.map((c) => (
          <View key={c.id} style={styles.control}>
            <View style={styles.rowBetween}>
              <Text style={{ fontSize: 11, fontWeight: 700 }}>{c.id}</Text>
              <Text style={[styles.pill, { backgroundColor: STATUS_COLOR[c.status] }]}>{c.status.toUpperCase()}</Text>
            </View>
            <Text style={{ fontSize: 9, color: "#475569", marginTop: 3 }}>{c.description}</Text>
            <Text style={{ fontSize: 8, color: "#64748b", marginTop: 3 }}>
              Family: {c.family} | Evidence source: {c.evidenceSource}
            </Text>
            {coverage.findingsByControl[c.id] && coverage.findingsByControl[c.id].length > 0 ? (
              <Text style={{ fontSize: 8, color: "#dc2626", marginTop: 3 }}>
                {coverage.findingsByControl[c.id].length} finding(s) impact this control.
              </Text>
            ) : null}
          </View>
        ))}
      </Page>
    </Document>
  );
}
