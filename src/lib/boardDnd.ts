/**
 * Logika murni di balik seret kartu pada papan Lamaran Saya (dnd-kit).
 *
 * Sensor: mouse (setelah bergeser 8 piksel, supaya klik biasa tidak jadi seretan), sentuhan (setelah ditahan
 * 250 ms, supaya menggulir halaman dengan jari tidak memindahkan kartu), dan keyboard (Spasi atau Enter
 * mengangkat, panah menggeser, Spasi atau Enter menjatuhkan, Esc membatalkan). PointerSensor tidak dipakai:
 * tanpa `touch-action: none` peramban membatalkan seretan jari (pointercancel) begitu halaman mulai
 * menggulir, jadi papan di tablet (layar 768 piksel ke atas) tidak bisa dipindah dengan jari.
 *
 * Catatan untuk uji otomatis: dnd-kit memakai gerakan pertama yang melewati batas jarak hanya untuk memulai
 * seretan, dan baru gerakan berikutnya yang menggeser kartu. Seretan sintetis yang hanya mengirim tekan,
 * satu gerakan, lalu lepas menjatuhkan kartu di kolom asalnya, jadi tidak memindahkan apa pun.
 *
 * Hanya impor relatif, supaya jalan di bawah `node --test` tanpa bundler.
 */

import { APPLICATION_STATUS_LABEL } from "./statusLabels.ts";

/** Kolom papan, urutannya sama dengan APPLICATION_STATUSES di services/aiApplicationService.ts. */
export const BOARD_STATUSES = ["draft", "ready", "submitted", "follow_up", "responded", "closed"] as const;
export type BoardStatus = (typeof BOARD_STATUSES)[number];

/** Mouse: bergeser 8 piksel baru dianggap seretan. */
export const BOARD_MOUSE_CONSTRAINT = { distance: 8 } as const;
/** Sentuhan: tahan 250 ms tanpa bergeser lebih dari 8 piksel; bergeser lebih dulu berarti menggulir. */
export const BOARD_TOUCH_CONSTRAINT = { delay: 250, tolerance: 8 } as const;

/** Status kolom dari `data` sebuah droppable (`{ status }`); null bila bukan kolom papan yang dikenal. */
export function boardStatusOf(data: unknown): BoardStatus | null {
  const status = data && typeof data === "object" ? (data as { status?: unknown }).status : undefined;
  return typeof status === "string" && (BOARD_STATUSES as readonly string[]).includes(status) ? (status as BoardStatus) : null;
}

export interface BoardDragEndInput {
  active: { id: string | number };
  over: { data: { current?: unknown } } | null;
}

/**
 * Hasil akhir seretan: kartu mana pindah ke kolom mana. null bila kartu dilepas di luar kolom, atau di atas
 * sesuatu yang bukan kolom. Pindah ke kolom yang sama ditangani pemanggil (moveApplication mengabaikannya).
 */
export function dragEndMove(event: BoardDragEndInput): { appId: string; status: BoardStatus } | null {
  if (!event.over) return null;
  const status = boardStatusOf(event.over.data.current);
  return status ? { appId: String(event.active.id), status } : null;
}

// ---- teks pembaca layar (bawaan dnd-kit berbahasa Inggris) -------------------------------------------------

export const BOARD_SCREEN_READER_INSTRUCTIONS =
  "Untuk memindahkan kartu, tekan Spasi atau Enter, geser dengan tombol panah, lalu tekan Spasi atau Enter lagi untuk menjatuhkannya di kolom. Tekan Esc untuk membatalkan.";

export const BOARD_ROLE_DESCRIPTION = "kartu yang bisa dipindahkan";

interface DragRef {
  active: { id: string | number };
  over?: { id: string | number } | null;
}

/** Pengumuman seretan berbahasa Indonesia; `titleOf` memberi judul kartu, label kolom dari statusLabels. */
export function boardAnnouncements(titleOf: (id: string) => string) {
  const title = (e: DragRef) => titleOf(String(e.active.id));
  const column = (e: DragRef) => (e.over ? APPLICATION_STATUS_LABEL[String(e.over.id)] ?? String(e.over.id) : "");
  return {
    onDragStart: (e: DragRef) => `Kartu ${title(e)} diangkat.`,
    onDragOver: (e: DragRef) => (e.over ? `Kartu ${title(e)} ada di atas kolom ${column(e)}.` : `Kartu ${title(e)} tidak berada di atas kolom mana pun.`),
    onDragEnd: (e: DragRef) => (e.over ? `Kartu ${title(e)} dijatuhkan di kolom ${column(e)}.` : `Kartu ${title(e)} dikembalikan ke tempat semula.`),
    onDragCancel: (e: DragRef) => `Pemindahan dibatalkan. Kartu ${title(e)} kembali ke tempat semula.`,
  };
}
