import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { csvCell } from "../src/lib/csvSafe.ts";

test("csvCell: sel yang diawali karakter rumus diberi apostrof (BS-06)", () => {
  assert.equal(csvCell("=HYPERLINK(\"http://x\")"), '"\'=HYPERLINK(""http://x"")"');
  assert.equal(csvCell("+62812"), "'+62812");
  assert.equal(csvCell("-1+1"), "'-1+1");
  assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvCell("\tcmd"), "'\tcmd");
  assert.equal(csvCell("\rcmd"), '"\'\rcmd"');
});

test("csvCell: nilai biasa tidak berubah, null jadi kosong, angka jadi teks", () => {
  assert.equal(csvCell("Universitas Kristen Duta Wacana"), "Universitas Kristen Duta Wacana");
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(undefined), "");
  assert.equal(csvCell(21), "21");
  assert.equal(csvCell("a=b"), "a=b");
  assert.equal(csvCell("nama@contoh.id"), "nama@contoh.id");
});

test("csvCell: koma, tanda kutip, dan baris baru tetap diapit", () => {
  assert.equal(csvCell("Yogyakarta, DIY"), '"Yogyakarta, DIY"');
  assert.equal(csvCell('Ia berkata "halo"'), '"Ia berkata ""halo"""');
  assert.equal(csvCell("baris1\nbaris2"), '"baris1\nbaris2"');
});

test("ekspor CSV daftar tunggu memakai csvCell, bukan fungsi escape lokal", () => {
  const admin = readFileSync(new URL("../src/routes/admin.waitinglist.tsx", import.meta.url), "utf8");
  assert.match(admin, /import \{ csvCell \} from "@\/lib\/csvSafe"/);
  assert.match(admin, /csvCell\(\(r as any\)\[h\]\)/);
  assert.doesNotMatch(admin, /const escape = /);
});
