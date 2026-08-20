import { extractText, getDocumentProxy } from "unpdf";

/**
 * Extracts plain text from a PDF file's raw bytes.
 * unpdf ships a pdf.js build that runs on Workers (no Node fs/canvas needed).
 */
export async function extractTextFromPdf(bytes: ArrayBuffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return text.trim();
}
