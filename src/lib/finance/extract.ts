// Document text extraction. PDF via pdf-parse, CSV via papaparse.
// Both kept here so the extraction route only needs one import.

import type { Buffer } from 'node:buffer';

export interface ExtractedText {
  text: string;
  pageCount: number | null;
}

export async function extractPdfText(buffer: Buffer): Promise<ExtractedText> {
  // Import the inner module directly. pdf-parse's index.js runs a debug
  // self-test on load that opens './test/data/05-versions-space.pdf' and
  // throws ENOENT in production where that fixture doesn't exist.
  // @ts-expect-error pdf-parse ships no types for the inner module
  const mod = await import('pdf-parse/lib/pdf-parse.js');
  const pdfParse = (mod as unknown as {
    default: (b: Buffer) => Promise<{ text: string; numpages: number }>;
  }).default;
  const result = await pdfParse(buffer);
  return { text: result.text, pageCount: result.numpages };
}

export async function extractCsvText(buffer: Buffer): Promise<ExtractedText> {
  const mod = await import('papaparse');
  const Papa = (mod as unknown as { default: typeof import('papaparse') }).default;
  const text = buffer.toString('utf-8');
  const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
  // Re-serialize as a tidy, model-friendly TSV: header row + data rows
  const lines = (result.data as string[][]).map((row) => row.join('\t'));
  return { text: lines.join('\n'), pageCount: null };
}

export async function extractDocumentText(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ExtractedText> {
  const lower = fileName.toLowerCase();
  if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) {
    return extractPdfText(buffer);
  }
  if (
    mimeType === 'text/csv' ||
    mimeType === 'application/csv' ||
    lower.endsWith('.csv')
  ) {
    return extractCsvText(buffer);
  }
  // Fallback: try as UTF-8 text
  return { text: buffer.toString('utf-8'), pageCount: null };
}

const MAX_CHUNK_CHARS = 16000;

export function chunkText(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text];
  const chunks: string[] = [];
  const lines = text.split('\n');
  let current: string[] = [];
  let currentLen = 0;
  for (const line of lines) {
    if (currentLen + line.length + 1 > MAX_CHUNK_CHARS && current.length > 0) {
      chunks.push(current.join('\n'));
      current = [];
      currentLen = 0;
    }
    current.push(line);
    currentLen += line.length + 1;
  }
  if (current.length > 0) chunks.push(current.join('\n'));
  return chunks;
}
