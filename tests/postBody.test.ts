import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "../src");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

// Header bawaan getAuthHeaders memuat Content-Type JSON. POST/PUT/PATCH tanpa body ditolak Fastify dengan
// 400 FST_ERR_CTP_EMPTY_JSON_BODY: tombol Hubungkan Gmail sempat gagal karena ini (24 Nov 2026).
test("setiap fetch POST/PUT/PATCH di src mengirim body", () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(/method:\s*['"](POST|PUT|PATCH)['"]/g)) {
      const seg = src.slice(m.index!, m.index! + 400);
      const end = seg.indexOf("})");
      const block = end > 0 ? seg.slice(0, end) : seg;
      if (!/\bbody\b/.test(block)) offenders.push(`${path.relative(SRC, file)}:${src.slice(0, m.index!).split("\n").length}`);
    }
  }
  assert.deepEqual(offenders, []);
});
