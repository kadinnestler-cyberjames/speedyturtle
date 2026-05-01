import { renderToBuffer } from "@react-pdf/renderer";
import { writeFileSync } from "node:fs";
import { buildDemoScan } from "../src/lib/demo-scan";
import { PdfReport } from "../src/components/PdfReport";

const scan = buildDemoScan();
console.log("scan.validation summary:", JSON.stringify(scan.validation?.summary));
const buf = await renderToBuffer(PdfReport({ scan }));
writeFileSync("/tmp/demo-pdf.pdf", buf);
console.log(`wrote ${buf.byteLength} bytes`);
