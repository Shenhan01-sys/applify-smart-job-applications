import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BOARD_MOUSE_CONSTRAINT,
  BOARD_ROLE_DESCRIPTION,
  BOARD_SCREEN_READER_INSTRUCTIONS,
  BOARD_STATUSES,
  BOARD_TOUCH_CONSTRAINT,
  boardAnnouncements,
  boardStatusOf,
  dragEndMove,
} from "../src/lib/boardDnd.ts";
import { APPLICATION_STATUS_LABEL } from "../src/lib/statusLabels.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

// Uji E2E klik 20 November 2026 (temuan 8): seret kartu antar kolom tidak terverifikasi.

test("temuan 8: kolom papan sama dengan APPLICATION_STATUSES dan punya label Indonesia", () => {
  const service = read("../src/services/aiApplicationService.ts");
  const m = service.match(/export const APPLICATION_STATUSES = \[([^\]]+)\] as const;/);
  assert.ok(m, "APPLICATION_STATUSES tidak ditemukan");
  const fromService = [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
  assert.deepEqual([...BOARD_STATUSES], fromService);
  assert.deepEqual(Object.keys(APPLICATION_STATUS_LABEL), fromService);
});

test("temuan 8: boardStatusOf hanya menerima kolom papan yang dikenal", () => {
  for (const status of BOARD_STATUSES) assert.equal(boardStatusOf({ status }), status);
  for (const bad of [undefined, null, {}, { status: "" }, { status: "archived" }, { status: 3 }, "ready", [], { Status: "ready" }]) {
    assert.equal(boardStatusOf(bad), null, JSON.stringify(bad));
  }
});

test("temuan 8: dragEndMove memetakan kolom tujuan ke status, dan mengabaikan lepas di luar kolom", () => {
  assert.deepEqual(dragEndMove({ active: { id: "app-1" }, over: { data: { current: { status: "submitted" } } } }), { appId: "app-1", status: "submitted" });
  assert.deepEqual(dragEndMove({ active: { id: 42 }, over: { data: { current: { status: "closed" } } } }), { appId: "42", status: "closed" });
  // dilepas di luar kolom mana pun
  assert.equal(dragEndMove({ active: { id: "app-1" }, over: null }), null);
  // dilepas di atas sesuatu tanpa status kolom, atau dengan status asing
  assert.equal(dragEndMove({ active: { id: "app-1" }, over: { data: { current: undefined } } }), null);
  assert.equal(dragEndMove({ active: { id: "app-1" }, over: { data: { current: { status: "archived" } } } }), null);
});

test("temuan 8: pengumuman pembaca layar berbahasa Indonesia dan menyebut kolom dengan labelnya", () => {
  const a = boardAnnouncements((id) => (id === "app-1" ? "Frontend Engineer" : "Lowongan"));
  assert.equal(a.onDragStart({ active: { id: "app-1" } }), "Kartu Frontend Engineer diangkat.");
  assert.equal(a.onDragOver({ active: { id: "app-1" }, over: { id: "ready" } }), "Kartu Frontend Engineer ada di atas kolom Siap dikirim.");
  assert.equal(a.onDragOver({ active: { id: "app-1" }, over: null }), "Kartu Frontend Engineer tidak berada di atas kolom mana pun.");
  assert.equal(a.onDragEnd({ active: { id: "app-1" }, over: { id: "follow_up" } }), "Kartu Frontend Engineer dijatuhkan di kolom Perlu tindak lanjut.");
  assert.equal(a.onDragEnd({ active: { id: "app-1" }, over: null }), "Kartu Frontend Engineer dikembalikan ke tempat semula.");
  assert.equal(a.onDragCancel({ active: { id: "app-1" } }), "Pemindahan dibatalkan. Kartu Frontend Engineer kembali ke tempat semula.");
  for (const text of [BOARD_SCREEN_READER_INSTRUCTIONS, BOARD_ROLE_DESCRIPTION]) assert.doesNotMatch(text, /\b(drag|press|space bar|draggable)\b/i);
});

test("temuan 8: sensor mouse, sentuhan, dan keyboard terpasang; PointerSensor tidak dipakai", () => {
  const src = read("../src/routes/applications.tsx");
  assert.match(src, /useSensor\(MouseSensor, \{ activationConstraint: BOARD_MOUSE_CONSTRAINT \}\)/);
  assert.match(src, /useSensor\(TouchSensor, \{ activationConstraint: BOARD_TOUCH_CONSTRAINT \}\)/);
  assert.match(src, /useSensor\(KeyboardSensor\)/);
  assert.doesNotMatch(src, /useSensor\(PointerSensor/);
  assert.doesNotMatch(src, /import \{[^}]*\bPointerSensor\b[^}]*\} from "@dnd-kit\/core"/);
  // sensor dipasang ke DndContext, dan seretan yang dibatalkan (Esc) membersihkan kartu yang sedang diangkat
  assert.match(src, /<DndContext\s+sensors=\{sensors\}/);
  assert.match(src, /onDragCancel=\{\(\) => setActiveDragApp\(null\)\}/);
  assert.match(src, /dragEndMove\(event\)/);
});

test("temuan 8: batas aktivasi: mouse bergeser 8 px, sentuhan menahan 250 ms dan bergeser kurang dari 8 px", () => {
  assert.deepEqual(BOARD_MOUSE_CONSTRAINT, { distance: 8 });
  assert.deepEqual(BOARD_TOUCH_CONSTRAINT, { delay: 250, tolerance: 8 });
  // tombol "Lihat detail" dan keyboard di dalam kartu tidak memulai seretan lewat sensor mana pun
  const src = read("../src/routes/applications.tsx");
  const button = src.slice(src.indexOf("<button", src.indexOf("function DraggableKanbanCard")), src.indexOf("Lihat detail"));
  assert.match(button, /onMouseDown=\{\(e\) => e\.stopPropagation\(\)\}/);
  assert.match(button, /onTouchStart=\{\(e\) => e\.stopPropagation\(\)\}/);
  assert.match(button, /onKeyDown=\{\(e\) => e\.stopPropagation\(\)\}/);
});

test("temuan 8: kolom papan adalah droppable dengan data { status }, sehingga dragEndMove menemukannya", () => {
  const src = read("../src/routes/applications.tsx");
  assert.match(src, /useDroppable\(\{ id: status, data: \{ status \} \}\)/);
  assert.match(src, /useDraggable\(\{ id: app\.id, data: app, attributes: \{ roleDescription: BOARD_ROLE_DESCRIPTION \} \}\)/);
});
