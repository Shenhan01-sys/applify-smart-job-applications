import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ApiError, KEYWORDS_REQUIRED_MESSAGE, describeApiError } from "../src/lib/apiErrors.ts";
import {
  SEARCH_INPUT_HINT_PROFILE_LINK,
  SEARCH_INPUT_HINT_SETTINGS_LINK,
  SEARCH_INPUT_HINT_TEXT,
  searchInputMissing,
} from "../src/lib/searchReadiness.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("petunjuk pencarian hanya bila tidak ada kata kunci tersimpan dan tidak ada jabatan", () => {
  assert.equal(searchInputMissing({}), true);
  assert.equal(searchInputMissing({ searchKeywords: [], currentTitle: "" }), true);
  assert.equal(searchInputMissing({ searchKeywords: ["", "  "], currentTitle: "   " }), true);
  assert.equal(searchInputMissing({ searchKeywords: null, currentTitle: null }), true);
  assert.equal(searchInputMissing({ searchKeywords: ["Data Analyst"], currentTitle: "" }), false);
  assert.equal(searchInputMissing({ searchKeywords: [], currentTitle: "Staf Marketing" }), false);
  assert.equal(searchInputMissing({ searchKeywords: "bukan daftar", currentTitle: "" }), true);
});

test("400 keywords_required dari backend menjadi arahan Indonesia, bukan teks server", () => {
  const err = new ApiError(400, JSON.stringify({ error: "Kata kunci pencarian belum ada. Isi jabatan di profil atau kata kunci di Pengaturan Otomasi, lalu coba lagi.", code: "keywords_required" }));
  const msg = describeApiError(err, "Gagal mencari lowongan.");
  assert.equal(msg, KEYWORDS_REQUIRED_MESSAGE);
  assert.match(msg, /Pengaturan Agen/);
  assert.match(msg, /Profil Saya/);
  assert.doesNotMatch(msg, /Otomasi/);
});

test("kontrak backend: pencarian tanpa bahan menjawab 400 dengan kode keywords_required", () => {
  const route = read("../../backend/api/routes/automation.ts");
  assert.match(route, /SearchInputError/);
  assert.match(route, /code: err\.code/);
  assert.match(read("../../backend/services/automation.service.ts"), /'keywords_required'/);
});

test("pemindai: petunjuk sebelum mencari, tautan ke Pengaturan Agen dan Profil, dan penyebab galat dari backend ditampilkan", () => {
  const scanner = read("../src/components/AIJobScanner.tsx");
  assert.match(scanner, /loadSearchInputMissing\(\)/);
  assert.match(scanner, /data-testid="search-input-hint"/);
  assert.match(scanner, /to="\/automation-settings"/);
  assert.match(scanner, /to="\/profile"/);
  assert.match(scanner, /searched\.code === 'keywords_required'\) setInputMissing\(true\)/);
  assert.match(scanner, /addStage\(searched\.message \?\? /);
  // petunjuk tampil di atas daftar situs, sebelum tombol mencari dipakai
  assert.ok(scanner.indexOf('data-testid="search-input-hint"') < scanner.indexOf("Pilih situs lowongan:"));
  // pencarian tidak diblokir: backend masih bisa memakai skill profil
  assert.doesNotMatch(scanner, /disabled=\{[^}]*inputMissing/);

  const hook = read("../src/hooks/useAutomation.ts");
  assert.match(hook, /failed: true, message, code: parseApiError\(error\)\.code/);

  for (const text of [SEARCH_INPUT_HINT_TEXT, SEARCH_INPUT_HINT_SETTINGS_LINK, SEARCH_INPUT_HINT_PROFILE_LINK]) {
    assert.doesNotMatch(text, /administrator|env|keywords|API/i);
  }
});

test("layanan pembaca bahan pencarian: sesi pengguna sendiri, gagal baca berarti petunjuk tidak muncul", () => {
  const service = read("../src/services/searchReadinessService.ts");
  assert.match(service, /from\("profiles"\)\.select\("current_title"\)\.eq\("id", user\.id\)/);
  assert.match(service, /automationApi\.getSettings\(\)/);
  assert.match(service, /catch \{\s*return false;/);
  // hanya membaca: tidak ada tulis ke database
  assert.doesNotMatch(service, /\.(insert|update|upsert|delete)\(/);
});
