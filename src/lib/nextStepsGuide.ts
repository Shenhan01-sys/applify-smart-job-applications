import type { AgentNextStep } from "./agentEvidence.ts";
import type { AgentApplyRow, AgentApplyTone } from "./agentApplyStatus.ts";

/**
 * Daftar "Langkah berikutnya" di kartu Persetujuan saat Ekstensi Browser berhenti sebelum tombol kirim akhir
 * (log ekstensi `details.next_steps`). Menggantikan satu kalimat umum "buka tab atau panel ekstensi" dengan langkah
 * yang jelas. Fungsi murni tanpa React. Kartu hanya menampilkan petunjuk: tidak ada tombol di sini yang menyimpan
 * sub-formulir, melanjutkan halaman, atau mengirim lamaran. Pengguna yang mengkliknya di tab lowongan.
 */

export const NEXT_STEPS_TITLE = "Langkah berikutnya";

/** Label umum yang dikirim ekstensi bila editor terbuka tetapi tombol halaman berikutnya belum terlihat. */
export const GENERIC_NEXT_PAGE_LABEL = "Lanjut ke langkah berikutnya";

export const OPEN_TAB_STEP_TEXT = "Buka tab lowongan yang dibuka ekstensi.";
export const FINAL_STEP_LEAD = "Tekan";
export const FINAL_STEP_LABEL = "Kirim Sekarang";
export const FINAL_STEP_TAIL = "di panel ekstensi setelah kamu memeriksa isiannya.";

/** Satu butir daftar: `lead`, lalu `label` (dicetak tebal) dan `tail` bila ada. `openTab` menandai butir yang diberi tombol buka tab lowongan. */
export interface NextStepItem {
  key: string;
  lead: string;
  label?: string;
  tail?: string;
  openTab?: boolean;
}

const trimStop = (s: string): string => s.replace(/[.\s]+$/g, "").trim();

/** "Unggah CV secara manual" -> "CV"; label lain dipakai apa adanya. */
function uploadTarget(label: string): string {
  return (
    trimStop(label)
      .replace(/^unggah\s+/i, "")
      .replace(/\s+secara manual$/i, "")
      .trim() || "berkas"
  );
}

function itemFor(step: AgentNextStep, index: number): NextStepItem | null {
  const key = `${step.kind}-${index}`;
  const label = trimStop(step.label);
  if (!label) return null;
  switch (step.kind) {
    case "subform_save":
      return { key, lead: "Klik", label, tail: "untuk menyimpan isian yang sedang terbuka di halaman itu." };
    case "next_page":
      if (label.toLowerCase() === GENERIC_NEXT_PAGE_LABEL.toLowerCase()) {
        return { key, lead: "Lanjut ke halaman berikutnya sampai tiba di halaman terakhir sebelum kirim." };
      }
      return { key, lead: "Klik", label, tail: "untuk lanjut ke halaman berikutnya." };
    case "upload_file":
      return { key, lead: `Unggah ${uploadTarget(label)} sendiri di tab lowongan.` };
    case "answer_required":
      return { key, lead: `${label}. Kolom jawabannya ada di kartu ini.` };
    default:
      return null;
  }
}

/**
 * Daftar bernomor langkah berikutnya, atau null bila tidak ada yang perlu ditampilkan (log tanpa `next_steps`, atau
 * hanya langkah login yang sudah punya panduan sendiri). Butir pertama selalu membuka tab lowongan, butir terakhir
 * selalu menekan Kirim Sekarang di panel ekstensi.
 */
export function buildNextStepGuide(steps: readonly AgentNextStep[] | null | undefined): NextStepItem[] | null {
  const usable = (Array.isArray(steps) ? steps : []).filter((s) => s && s.kind !== "login");
  const items = usable.map(itemFor).filter((i): i is NextStepItem => i !== null);
  if (items.length === 0) return null;
  return [
    { key: "open-tab", lead: OPEN_TAB_STEP_TEXT, openTab: true },
    ...items,
    { key: "final", lead: FINAL_STEP_LEAD, label: FINAL_STEP_LABEL, tail: FINAL_STEP_TAIL },
  ];
}

/** Butir sebagai satu kalimat teks biasa (untuk uji dan pembaca layar). */
export function nextStepItemText(item: NextStepItem): string {
  return [item.lead, item.label, item.tail].filter(Boolean).join(" ");
}

/**
 * Daftar yang tampil di kartu agen: hanya untuk log Ekstensi Browser yang berhenti sebelum kirim (nada "ready") dan
 * membawa `next_steps`. Selain itu null, dan kartu memakai kalimat lamanya.
 */
export function nextStepGuideFor(row: AgentApplyRow | null | undefined, tone: AgentApplyTone): NextStepItem[] | null {
  if (!row || row.channel !== "extension" || tone !== "ready") return null;
  return buildNextStepGuide(row.next_steps);
}
