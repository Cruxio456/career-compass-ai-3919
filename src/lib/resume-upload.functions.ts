import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { unzipSync } from "fflate";

const MAX_RESUME_FILE_BYTES = 10 * 1024 * 1024;
const MAX_RESUME_TEXT_CHARS = 12000;
const MIN_RESUME_TEXT_CHARS = 80;

export type ExtractedResume = { fileName: string; text: string; pages?: number };

export function decodeXmlEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|apos|#x?[0-9a-fA-F]+);/g, (entity) => {
    if (entity === "&amp;") return "&";
    if (entity === "&lt;") return "<";
    if (entity === "&gt;") return ">";
    if (entity === "&quot;") return '"';
    if (entity === "&apos;") return "'";
    const numeric = entity.slice(1, -1);
    const codePoint = numeric.startsWith("x") || numeric.startsWith("X")
      ? Number.parseInt(numeric.slice(1), 16)
      : Number.parseInt(numeric, 10);
    return Number.isFinite(codePoint) && codePoint > 0 && codePoint < 0x10ffff ? String.fromCodePoint(codePoint) : entity;
  });
}

export function docxXmlToText(xml: string): string {
  return decodeXmlEntities(
    xml
      .split(/<\/w:p>/)
      .map((paragraph) => paragraph.replace(/<[^>]+>/g, "").trim())
      .filter(Boolean)
      .join("\n"),
  );
}

export function normalizeExtractedText(input: string, limit = MAX_RESUME_TEXT_CHARS): string {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, limit);
}

async function extractPdfText(file: File): Promise<{ text: string; pages?: number }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
  const extracted = await extractText(pdf, { mergePages: true });
  const text = Array.isArray(extracted.text) ? extracted.text.join("\n") : extracted.text;
  return { text, pages: extracted.totalPages };
}

export const extractResumeText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Choose a resume file to upload first.");
    const file = data.get("file");
    if (!(file instanceof File)) throw new Error("Choose a resume file to upload first.");
    if (file.size < 1) throw new Error("That file appears to be empty.");
    if (file.size > MAX_RESUME_FILE_BYTES) throw new Error("That file is larger than 10 MB. Try a smaller copy of your resume.");
    return { file };
  })
  .handler(async ({ data }): Promise<ExtractedResume> => {
    const file = data.file;
    const name = file.name || "resume";
    const lower = name.toLowerCase();
    let raw = "";
    let pages: number | undefined;
    if (lower.endsWith(".pdf") || file.type === "application/pdf") {
      const pdf = await extractPdfText(file);
      raw = pdf.text;
      pages = pdf.pages;
    } else if (lower.endsWith(".docx") || file.type.includes("wordprocessingml")) {
      const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
      const documentXml = archive["word/document.xml"];
      if (!documentXml) throw new Error("That file doesn’t look like a readable Word document. Try saving it as a PDF first.");
      raw = docxXmlToText(new TextDecoder().decode(documentXml));
    } else if (lower.endsWith(".txt") || lower.endsWith(".md") || file.type.startsWith("text/")) {
      raw = await file.text();
    } else {
      throw new Error("Upload a PDF, Word (.docx), or plain-text resume.");
    }
    const text = normalizeExtractedText(raw);
    if (text.length < MIN_RESUME_TEXT_CHARS) {
      throw new Error("We couldn’t read enough text from that file. If it’s a scanned image, paste the text instead.");
    }
    return pages === undefined ? { fileName: name, text } : { fileName: name, text, pages };
  });
