import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasDocumentMagicBytes } from "../src/lib/profileDocuments.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

test("FE-01: public/sw.js adalah pembatal pendaftaran & pembersih cache tanpa cache-first lama", () => {
  const sw = readFileSync(path.join(root, "public", "sw.js"), "utf8");
  assert.match(sw, /self\.registration\.unregister\(\)/);
  assert.match(sw, /caches\.delete/);
  assert.doesNotMatch(sw, /caches\.open\(/);
  assert.doesNotMatch(sw, /addEventListener\(['"]fetch['"]/);
});

test("FE-04 / BS-U4-02: automationQueue.enqueueAutoApply lewat backend /api/queue/apply bukan insert langsung ke automation_queue", () => {
  const src = readFileSync(path.join(root, "src", "services", "automationQueue.ts"), "utf8");
  assert.match(src, /\/api\/queue\/apply/);
  assert.doesNotMatch(src, /\.from\(["']automation_queue["']\)\s*\.\s*insert\(/);
});

test("BS-U1-04: hasDocumentMagicBytes memverifikasi PDF (offset <= 1024), DOCX (PK), dan DOC (OLE2)", () => {
  assert.equal(hasDocumentMagicBytes(new TextEncoder().encode("%PDF-1.7 body"), "pdf"), true);
  const offsetPdf = new Uint8Array(64);
  offsetPdf.set(new TextEncoder().encode("%PDF-1.4"), 24);
  assert.equal(hasDocumentMagicBytes(offsetPdf, "pdf"), true);
  assert.equal(hasDocumentMagicBytes(new TextEncoder().encode("<html>not pdf</html>"), "pdf"), false);

  assert.equal(hasDocumentMagicBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]), "docx"), true);
  assert.equal(hasDocumentMagicBytes(new TextEncoder().encode("%PDF-1.4"), "docx"), false);

  assert.equal(hasDocumentMagicBytes(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), "doc"), true);
  assert.equal(hasDocumentMagicBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), "doc"), false);
});
