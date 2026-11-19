import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Pemeriksaan kabel statis pada komponen React (suite ini tidak punya DOM): membaca teks sumbernya.
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("pengajuan persetujuan yang gagal: galat tampil di footer dekat tombol dan lewat toast.error", () => {
  const src = read("../src/components/AIApplyModal.tsx");
  const fn = src.slice(src.indexOf("const handleRequestApproval"), src.indexOf("// The user sent this application outside Applify"));
  // galat tidak lagi masuk ke setError (area isi yang bisa tergulir keluar layar)
  assert.doesNotMatch(fn, /setError\(`/);
  assert.match(fn, /setApprovalError\(message\)/);
  assert.match(fn, /toast\.error\(message\)/);
  assert.match(fn, /describeApprovalError\(err, "Draf belum bisa diajukan\."\)/);
  // dibersihkan saat mencoba lagi, supaya galat lama tidak menempel
  assert.match(fn.slice(0, fn.indexOf("await persistPendingEdit")), /setApprovalError\(""\)/);

  // kotak galat ada di footer (setelah komentar "Footer Actions"), role=alert, tepat sebelum baris tombol
  const footer = src.slice(src.indexOf("{/* Footer Actions */}"));
  const alertAt = footer.indexOf('id="apply-approval-error"');
  const buttonsAt = footer.indexOf("Ajukan ke Persetujuan");
  assert.ok(alertAt > 0 && alertAt < buttonsAt, "kotak galat berada di atas tombol Ajukan ke Persetujuan");
  assert.match(footer.slice(Math.max(0, alertAt - 60), alertAt + 80), /role="alert"/);
  assert.match(footer, /aria-describedby=\{approvalError \? "apply-approval-error" : undefined\}/);
});
