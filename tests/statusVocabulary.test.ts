import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { RETIRED_STATUS_LABELS, STATUS_TERM } from "../src/lib/statusVocabulary.ts";
import { APPLICATION_STATUS_LABEL, FILL_YOURSELF_LABEL, QUEUE_NEEDS_MANUAL_LABEL, QUEUE_STATUS_LABEL } from "../src/lib/statusLabels.ts";
import { EXPIRED_NOT_SENT_LABEL, FAILED_CLOSED_LABEL, STAGE_LABEL } from "../src/lib/approvalTabs.ts";
import { AGENT_PARTIAL_LABEL, AGENT_VALIDATION_LABEL } from "../src/lib/agentApplyStatus.ts";
import { STATUS_LABEL } from "../src/lib/dashboardStats.ts";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/** Isi berkas tanpa komentar: label lama boleh tetap disebut di komentar sebagai riwayat. */
const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("ON-10: satu keadaan, satu kata di Persetujuan, Antrean Agen, Lamaran Saya, dan Beranda", () => {
  assert.equal(STAGE_LABEL.not_started, QUEUE_STATUS_LABEL.pending);
  assert.equal(STAGE_LABEL.processing, QUEUE_STATUS_LABEL.processing);
  assert.equal(FILL_YOURSELF_LABEL, QUEUE_NEEDS_MANUAL_LABEL);
  assert.equal(FAILED_CLOSED_LABEL, EXPIRED_NOT_SENT_LABEL);
  assert.equal(STAGE_LABEL.failed_retry, STATUS_TERM.retryable);
  // Disetujui tetapi tidak diantre (LinkedIn): kata yang sama dengan Antrean Agen dan Lamaran Saya untuk "isi sendiri".
  assert.equal(STAGE_LABEL.fill_yourself, FILL_YOURSELF_LABEL);
  assert.equal(STAGE_LABEL.send_by_email, STATUS_TERM.sendByEmail);
  assert.equal(AGENT_PARTIAL_LABEL, STATUS_TERM.partlyFilled);
  assert.equal(AGENT_VALIDATION_LABEL, STATUS_TERM.rejectedByForm);
  // Kanban dan Beranda memakai kata yang sama untuk setiap status lamaran.
  for (const key of Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]) {
    assert.equal(STATUS_LABEL[key], APPLICATION_STATUS_LABEL[key], key);
  }
});

test("ON-10: label lama tidak tampil lagi di kode layar", () => {
  const hits: string[] = [];
  for (const file of sourceFiles(SRC)) {
    if (file.endsWith("statusVocabulary.ts")) continue;
    const code = withoutComments(readFileSync(file, "utf8"));
    for (const label of RETIRED_STATUS_LABELS) if (code.includes(label)) hits.push(`${file.slice(SRC.length)}: ${label}`);
  }
  assert.deepEqual(hits, []);
});

test("ON-10: kamus tanpa em dash dan tanda seru", () => {
  for (const term of Object.values(STATUS_TERM)) assert.doesNotMatch(term, /—|!/);
});
