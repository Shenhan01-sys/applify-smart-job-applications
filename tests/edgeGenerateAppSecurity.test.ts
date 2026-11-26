import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fnSrc = readFileSync(
  path.resolve(__dirname, "..", "supabase", "functions", "generate-application", "index.ts"),
  "utf8"
);

test("BS-01: generate-application menetralkan tag penutup </job_description> pada teks lowongan", () => {
  assert.match(fnSrc, /escapeWrapperTag/);
  assert.match(fnSrc, /escapeWrapperTag\(job\.description/);
  assert.match(fnSrc, /escapeWrapperTag\(job\.title\)/);
  assert.match(fnSrc, /escapeWrapperTag\(JSON\.stringify\(job\.requirements/);
});

test("BS-08.3: generate-application menyamarkan env platform dan tidak mengembalikan detail upstream mentah di HTTP 502", () => {
  assert.match(fnSrc, /platformSecrets/);
  assert.match(fnSrc, /redactSecrets\(await aiResp\.text\(\),\s*\[\.\.\.byokSecrets,\s*\.\.\.platformSecrets\]\)/);
  assert.doesNotMatch(fnSrc, /return json\(\{ error: "AI generation failed", detail: lastDetail/);
  assert.match(fnSrc, /return json\(\{ error: "AI generation failed", reason: safeReason/);
});
