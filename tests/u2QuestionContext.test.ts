import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseQuestions } from "../src/lib/formQuestions.ts";

test("U2-02: parseQuestions mempertahankan field context yang disanitasi untuk UI", () => {
  const qs = parseQuestions({
    questions: [
      {
        key: "nama perusahaan",
        label: "Nama perusahaan",
        kind: "text",
        required: true,
        context: "  Riwayat Pekerjaan   ·  Pengalaman #1  ",
      },
      {
        key: "posisi",
        label: "Posisi",
        kind: "text",
        context: "   ",
      },
    ],
  });
  assert.equal(qs.length, 2);
  assert.equal(qs[0].context, "Riwayat Pekerjaan · Pengalaman #1");
  assert.equal(qs[1].context, undefined);
});

test("U2-02: AgentQuestions merender badge konteks grup bila tersedia dengan ukuran teks >= 12px", () => {
  const src = readFileSync(new URL("../src/components/AgentQuestions.tsx", import.meta.url), "utf8");
  assert.match(src, /q\.context\s*&&/);
  assert.doesNotMatch(src, /text-\[1[01]px\]/);
});
