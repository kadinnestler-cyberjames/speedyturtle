import { describe, it, expect } from "vitest";
import { llmAvailable } from "../src/lib/llm";

describe("llmAvailable", () => {
  it("returns sdk backend when ANTHROPIC_API_KEY is set", () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    try {
      const r = llmAvailable();
      expect(r.backend).toBe("sdk");
    } finally {
      if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prev;
    }
  });

  it("returns cli backend with explanation when ANTHROPIC_API_KEY is not set", () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const r = llmAvailable();
      expect(r.backend).toBe("cli");
      expect(r.reason).toContain("ANTHROPIC_API_KEY not set");
    } finally {
      if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
    }
  });
});
