import { describe, expect, it } from "vitest";

import { docxXmlToText, normalizeExtractedText } from "@/lib/resume-upload.functions";

describe("docxXmlToText", () => {
  it("turns Word paragraph markup into readable lines", () => {
    const xml = `<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>Senior product designer</w:t></w:r></w:p><w:p><w:r><w:t>Skills &amp; tools: Figma, prototypes</w:t></w:r></w:p></w:body></w:document>`;
    expect(docxXmlToText(xml)).toBe("Senior product designer\nSkills & tools: Figma, prototypes");
  });

  it("drops empty paragraphs left behind by markup", () => {
    expect(docxXmlToText("<w:p><w:r><w:t>First</w:t></w:r></w:p><w:p></w:p><w:p><w:r><w:t>Second</w:t></w:r></w:p>")).toBe("First\nSecond");
  });
});

describe("normalizeExtractedText", () => {
  it("collapses messy spacing and keeps line breaks readable", () => {
    expect(normalizeExtractedText("Line one   with   spaces\r\n\r\n\r\n\r\nLine two\ttabbed")).toBe("Line one with spaces\n\nLine two tabbed");
  });

  it("caps extracted resume text at the 12,000-character limit", () => {
    const result = normalizeExtractedText("a".repeat(20000));
    expect(result).toHaveLength(12000);
  });
});
