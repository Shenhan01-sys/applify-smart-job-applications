import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("47.3 P3-01: AIJobScanner menyediakan input kata kunci & lokasi cepat, tombol Batalkan AbortController, dan tanpa sleep buatan", () => {
  const scanner = readFileSync(new URL("../src/components/AIJobScanner.tsx", import.meta.url), "utf8");
  assert.match(scanner, /id="scanner-keywords"/);
  assert.match(scanner, /id="scanner-location"/);
  // Isian bebas ikut ke permintaan pencarian backend: panjangnya dibatasi di input.
  assert.match(scanner, /id="scanner-keywords"[\s\S]{0,400}maxLength=\{120\}/);
  assert.match(scanner, /id="scanner-location"[\s\S]{0,400}maxLength=\{80\}/);
  assert.match(scanner, /new AbortController\(\)/);
  assert.match(scanner, /data-testid="cancel-scan-btn"/);
  assert.match(scanner, /Batalkan/);
  assert.doesNotMatch(scanner, /\bsleep\(/);

  const hook = readFileSync(new URL("../src/hooks/useAutomation.ts", import.meta.url), "utf8");
  assert.match(hook, /error\?\.name === 'AbortError'/);
});
