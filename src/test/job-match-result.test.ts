import { describe, expect, it } from "vitest";

import { normalizeJobMatchResult } from "@/lib/career-ai.functions";

describe("normalizeJobMatchResult", () => {
  it("preserves a reported ATS match percentage and prioritizes missing keywords", () => {
    const result = normalizeJobMatchResult({
      score: 78,
      summary: "Relevant experience with a few key requirements to strengthen.",
      matchedKeywords: ["React", "TypeScript"],
      missingKeywords: [{ keyword: "Accessibility", priority: "high", evidence: "Not mentioned." }],
      experienceGaps: [{ requirement: "Team leadership", resumeEvidence: "No example shown.", nextStep: "Add a real example if available." }],
      recommendations: ["Bring the relevant project closer to the top."],
    });

    expect(result.score).toBe(78);
    expect(result.missingKeywords[0]?.priority).toBe("high");
    expect(result.experienceGaps[0]?.requirement).toBe("Team leadership");
    expect(result.recommendations).toEqual(["Bring the relevant project closer to the top."]);
  });

  it("keeps the estimated score within a percentage range", () => {
    const result = normalizeJobMatchResult({ score: 150, summary: "Estimate", missingKeywords: [] });
    expect(result.score).toBe(100);
  });

  it("rejects a response without the score needed for the report", () => {
    expect(() => normalizeJobMatchResult({ summary: "Incomplete report" })).toThrow("The match report was incomplete.");
  });
});