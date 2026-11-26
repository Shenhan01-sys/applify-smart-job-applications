import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BOARD_MOUSE_CONSTRAINT,
  BOARD_ROLE_DESCRIPTION,
  BOARD_SCREEN_READER_INSTRUCTIONS,
  BOARD_STATUSES,
  BOARD_TOUCH_CONSTRAINT,
  SUBMITTED_BLOCKED_TEXT,
  boardAnnouncements,
  boardCollisionDetection,
  boardStatusOf,
  dragEndMove,
  dropIntoSubmittedBlocked,
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

// Uji klik 21 November 2026 (temuan 21): kartu dari "Draf" yang dilepas di "Siap dikirim" mendarat di kolom lain.

// Enam kolom selebar 100 piksel dengan sela 10 piksel, setinggi 400 piksel (urutan sama dengan BOARD_STATUSES).
const columnRects = new Map(BOARD_STATUSES.map((status, i) => [status, { left: i * 110, right: i * 110 + 100, top: 0, bottom: 400 }]));
const containers = BOARD_STATUSES.map((id) => ({ id }));
const detect = (pointerCoordinates: { x: number; y: number } | null, collisionRect: { left: number; right: number; top: number; bottom: number } | null) =>
  boardCollisionDetection({ droppableContainers: containers, droppableRects: columnRects, pointerCoordinates, collisionRect });

test("temuan 21: kolom ditentukan dari titik penunjuk, bukan dari persegi kartu yang bisa bergeser", () => {
  // Penunjuk di tengah "Siap dikirim" (kolom ke-2), tetapi persegi overlay terukur dua kolom lebih ke kanan.
  const shifted = { left: 1 * 110 + 220, right: 1 * 110 + 220 + 80, top: 150, bottom: 230 };
  assert.deepEqual(detect({ x: 160, y: 200 }, shifted), [{ id: "ready" }]);
  // setiap kolom dikenali dari titik tengahnya
  for (const [i, status] of BOARD_STATUSES.entries()) assert.deepEqual(detect({ x: i * 110 + 50, y: 200 }, null), [{ id: status }]);
});

test("temuan 21: penunjuk di sela kolom atau di luar papan tidak menghasilkan tujuan (kartu kembali)", () => {
  assert.deepEqual(detect({ x: 105, y: 200 }, { left: 100, right: 180, top: 150, bottom: 230 }), []);
  assert.deepEqual(detect({ x: 160, y: 900 }, { left: 110, right: 190, top: 800, bottom: 880 }), []);
  assert.deepEqual(detect({ x: -5, y: 200 }, null), []);
});

test("temuan 21: keyboard (tanpa penunjuk) memakai kolom yang paling tertimpa kartu, terurut dari yang terbesar", () => {
  // 70 piksel di "Draf" dan 20 piksel di "Siap dikirim": Draf menang
  assert.deepEqual(detect(null, { left: 30, right: 130, top: 100, bottom: 160 }).map((c) => c.id), ["draft", "ready"]);
  assert.deepEqual(detect(null, { left: 90, right: 190, top: 100, bottom: 160 }).map((c) => c.id), ["ready", "draft"]);
  // tidak menimpa kolom mana pun, atau tanpa persegi sama sekali
  assert.deepEqual(detect(null, { left: 700, right: 800, top: 100, bottom: 160 }), []);
  assert.deepEqual(detect(null, null), []);
});

test("temuan 21: kolom nonaktif atau tanpa ukuran diabaikan", () => {
  const args = {
    droppableContainers: [{ id: "draft" }, { id: "ready", disabled: true }, { id: "ghost" }],
    droppableRects: columnRects,
    pointerCoordinates: { x: 160, y: 200 },
    collisionRect: null,
  };
  assert.deepEqual(boardCollisionDetection(args), []);
  assert.deepEqual(boardCollisionDetection({ ...args, pointerCoordinates: { x: 50, y: 200 } }), [{ id: "draft" }]);
});

test("temuan 21: overlay seret dirender lewat portal ke body dan tabrakan memakai boardCollisionDetection", () => {
  const src = read("../src/routes/applications.tsx");
  assert.match(src, /collisionDetection=\{boardCollisionDetection\}/);
  assert.match(src, /createPortal\(\s*<DragOverlay>/);
  assert.match(src, /document\.body/);
  // kartu asal tidak ikut bergeser (hanya overlay yang mengikuti penunjuk)
  const card = src.slice(src.indexOf("function DraggableKanbanCard"), src.indexOf("function DroppableColumn"));
  const cardCode = card.replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(cardCode, /translate3d|transform\b/);
  // akar masalah: animasi geser menahan transform lewat fill-mode both, sehingga fixed di dalamnya ikut bergeser
  assert.match(read("../src/styles.css"), /\.animate-slide-right \{\s*animation: slideInRight [^;]*both;/);
});

test("Terkirim tidak bisa dipilih pengguna lewat seret atau Ubah status; pindah dari Terkirim tetap boleh", () => {
  for (const from of ["draft", "ready", "follow_up", "responded", "closed", undefined]) assert.equal(dropIntoSubmittedBlocked(from, "submitted"), true, String(from));
  assert.equal(dropIntoSubmittedBlocked("submitted", "submitted"), false);
  for (const to of BOARD_STATUSES.filter((s) => s !== "submitted")) assert.equal(dropIntoSubmittedBlocked("draft", to), false, to);
  assert.equal(dropIntoSubmittedBlocked("submitted", "draft"), false);
  assert.match(SUBMITTED_BLOCKED_TEXT.description, /Persetujuan/);
  assert.doesNotMatch(JSON.stringify(SUBMITTED_BLOCKED_TEXT), /sudah kukirim/i);
});

test("halaman Lamaran: tidak ada jalan memindahkan kartu ke Terkirim secara manual", () => {
  const src = read("../src/routes/applications.tsx");
  const end = src.slice(src.indexOf("const handleDragEnd"), src.indexOf("const stats ="));
  assert.match(end, /dropIntoSubmittedBlocked\(from, move\.status\)/);
  assert.match(end, /setPendingSubmitted\(move\.appId\);\s*return;/);
  assert.doesNotMatch(src, /moveApplication\(pendingSubmitted, "submitted"\)/);
  assert.doesNotMatch(src, /sudah kukirim/i);
  // Pilihan Terkirim dikunci; kartu "Perlu dicek" juga tidak bisa dipilihkan follow_up (lib/needsCheck.ts).
  assert.match(src, /disabled=\{dropIntoSubmittedBlocked\(selectedApp\.status, s\)( \|\| \(selectedNeedsCheck && s === NEEDS_CHECK_BOARD_COLUMN\))?\}/);
});

test("Antrean Agen: tugas yang sudah terkirim tidak berlabel belum terkirim; tautan situs asal Karier Hijau disaring", async () => {
  const { sentQueueJobIds } = await import("../src/lib/formGaps.ts");
  const ids = sentQueueJobIds({
    a: { status: "success", at: "", reason: null, fieldsFilled: 3, applicationStatus: "submitted", queueJobId: "q1" },
    b: { status: "ready", at: "", reason: null, fieldsFilled: 3, applicationStatus: "ready", queueJobId: "q2" },
    c: { status: "success", at: "", reason: null, fieldsFilled: 3, applicationStatus: null, queueJobId: null },
  } as any);
  assert.deepEqual(ids, { q1: true });
  const panel = read("../src/components/QueuePanel.tsx");
  assert.match(panel, /!isSent && \(q\.job_type === "apply"/);
  const green = read("../src/routes/green-career.tsx");
  assert.doesNotMatch(green, /href=\{job\??\.external_url\}/);
});
