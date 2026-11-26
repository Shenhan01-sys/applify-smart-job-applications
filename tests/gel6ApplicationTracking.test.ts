import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyOutcomePreset, extractOutcomeTag, filterApplications, OUTCOME_PRESETS } from "../src/lib/applicationFilters.ts";

test("UX-P7-04 & UX-P7-06: preset hasil akhir (Wawancara/Tawaran/Ditolak) dan filter pencarian/status lamaran", () => {
  assert.deepEqual([...OUTCOME_PRESETS], ["Wawancara", "Tawaran", "Ditolak"]);
  assert.equal(applyOutcomePreset("", "Wawancara"), "Wawancara");
  assert.equal(applyOutcomePreset("Jadwal Senin 10.00", "Wawancara"), "Wawancara: Jadwal Senin 10.00");
  assert.equal(applyOutcomePreset("Wawancara: Jadwal Senin 10.00", "Tawaran"), "Tawaran: Jadwal Senin 10.00");
  assert.equal(extractOutcomeTag("Tawaran: Gaji cocok"), "Tawaran");
  assert.equal(extractOutcomeTag("Menunggu kabar"), null);

  const sample = [
    { id: "1", status: "draft", company_response: null, jobs: { title: "Backend Engineer", company: "PT Satu" } },
    { id: "2", status: "responded", company_response: "Wawancara: HRD Selasa", jobs: { title: "Frontend Dev", company: "PT Dua" } },
    { id: "3", status: "closed", company_response: "Ditolak", jobs: { title: "QA Engineer", company: "PT Tiga" } },
  ];
  assert.equal(filterApplications(sample, { status: "all" }).length, 3);
  assert.equal(filterApplications(sample, { status: "active" }).length, 2);
  assert.equal(filterApplications(sample, { status: "responded" }).length, 1);
  assert.equal(filterApplications(sample, { query: "wawancara" }).length, 1);
  assert.equal(filterApplications(sample, { query: "PT Tiga" }).length, 1);
});

test("FE-15 & FE-16: kartu Kanban memasang touch-none dan tidak membungkus tombol Lihat detail di dalam role=button", () => {
  const src = readFileSync(new URL("../src/routes/applications.tsx", import.meta.url), "utf8");
  const card = src.slice(src.indexOf("function DraggableKanbanCard"), src.indexOf("function DroppableColumn"));
  assert.match(card, /touch-none/);
  const btnIdx = card.indexOf("<button");
  const listenersIdx = card.indexOf("{...listeners}");
  assert.ok(listenersIdx > 0 && btnIdx > listenersIdx);
  const dragOpenTagEnd = card.indexOf(">", listenersIdx);
  const beforeBtn = card.slice(dragOpenTagEnd, btnIdx);
  assert.match(beforeBtn, /<\/div>\s*$/);
});
