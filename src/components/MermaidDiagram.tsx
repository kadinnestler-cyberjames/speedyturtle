"use client";

import { useEffect, useId, useState } from "react";

type Props = {
  code: string;
  className?: string;
};

const THEME_VARIABLES = {
  darkMode: true,
  background: "transparent",
  primaryColor: "#1e293b",
  primaryTextColor: "#e2e8f0",
  primaryBorderColor: "#475569",
  lineColor: "#fb7185",
  secondaryColor: "#0f172a",
  tertiaryColor: "#0f172a",
  actorBkg: "#1e293b",
  actorTextColor: "#fecdd3",
  actorLineColor: "#fb7185",
  signalColor: "#fda4af",
  signalTextColor: "#fecaca",
  noteBkgColor: "#1e293b",
  noteTextColor: "#fcd34d",
  noteBorderColor: "#475569",
} as const;

export function MermaidDiagram({ code, className }: Props) {
  // useId returns ":r0:" style strings; mermaid needs a CSS-id-safe value.
  const rawId = useId();
  const id = "mmd-" + rawId.replace(/[:]/g, "");

  const [svg, setSvg] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!code || !code.trim()) {
      setSvg(null);
      setErrored(false);
      return;
    }

    (async () => {
      try {
        const mermaidModule = await import("mermaid");
        const mermaid = mermaidModule.default ?? mermaidModule;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "loose",
          themeVariables: THEME_VARIABLES,
        });
        const { svg: rendered } = await mermaid.render(id, code);
        if (!cancelled) {
          setSvg(rendered);
          setErrored(false);
        }
      } catch (err) {
        console.warn("MermaidDiagram render failed:", err);
        if (!cancelled) {
          setSvg(null);
          setErrored(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, id]);

  if (!code || !code.trim()) return null;

  const wrapperClass = [
    "rounded-lg bg-slate-950/60 border border-slate-800 p-4 overflow-x-auto",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  if (errored) {
    return (
      <div className={wrapperClass}>
        <p className="text-xs text-slate-400 mb-2">
          Diagram failed to render — showing source.
        </p>
        <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono">
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  if (!svg) {
    // Briefly empty before first render finishes; keep wrapper for layout stability.
    return <div className={wrapperClass} aria-hidden="true" />;
  }

  return (
    <div
      className={wrapperClass}
      // mermaid returns a sanitized SVG string; securityLevel:"loose" still escapes scripts.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
