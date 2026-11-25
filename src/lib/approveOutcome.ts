/**
 * Apa yang terjadi sesudah pengguna menekan Setujui, menurut jalur kirim lowongan (ON-02, catatan 41).
 *
 * Audit onboarding menemukan teks yang tampak bertentangan: modal Persetujuan berkata lamaran "benar-benar dikirim",
 * sedangkan teks ekstensi berkata "berhenti sebelum kirim". Keduanya benar untuk jalurnya masing-masing, tetapi
 * pengguna tidak tahu jalur mana yang dipakai lowongannya. Fungsi ini memilih satu penjelasan dari `platform`
 * persetujuan, sama seperti pembagian di lib/applyChannel.ts:
 *   1. ATS publik (Greenhouse, Lever, Ashby, dan sejenisnya): agen server mengisi dan menekan kirim sendiri.
 *   2. Portal berakun yang didukung ekstensi (JobStreet, Glints, Kalibrr, Dealls): ekstensi di laptop mengisi,
 *      pengguna yang menekan Kirim Sekarang di panel ekstensi.
 *   3. Lainnya: penjelasan umum yang tetap benar (lamaran bisa terkirim sungguhan, tidak bisa ditarik).
 */

import { classifyJobChannel, type JobChannelInput } from "./applyChannel.ts";
import { EXTENSION_CONSENT_REQUIRED_TOAST, consentRequiredFrom } from "./extensionConsent.ts";

export type ApproveRoute = "server_agent" | "extension" | "other";

const SERVER_AGENT_PLATFORMS = new Set(["greenhouse", "lever", "ashby", "workable", "smartrecruiters", "recruitee", "breezy", "applify-uji"]);
const EXTENSION_PLATFORMS = new Set(["jobstreet", "glints", "kalibrr", "dealls"]);

export function approveRouteFor(platform: unknown): ApproveRoute {
  const p = typeof platform === "string" ? platform.trim().toLowerCase() : "";
  if (SERVER_AGENT_PLATFORMS.has(p)) return "server_agent";
  if (EXTENSION_PLATFORMS.has(p)) return "extension";
  return "other";
}

export const AFTER_APPROVE_TEXT: Record<ApproveRoute, string> = {
  server_agent:
    "Setelah kamu setujui, agen Applify membuka formulir lowongan ini di server, mengisinya, lalu menekan kirim. Lamaran benar-benar terkirim ke perusahaan atas namamu dan tidak bisa ditarik. Bila agen butuh jawabanmu, kartunya muncul lagi di halaman ini.",
  extension:
    "Setelah kamu setujui, Ekstensi Browser Applify di laptopmu (Chrome atau Edge) membuka situs ini, menunggu kamu masuk ke akun pelamar, lalu mengisi formulir. Ekstensi berhenti sebelum kirim: kamu yang menekan Kirim Sekarang di panel ekstensi.",
  other:
    "Setujui berarti lamaran ini boleh dikirim ke perusahaan atas namamu, dan lamaran yang sudah terkirim tidak bisa ditarik. Tekan Tolak bila kamu tidak ingin melamar.",
};

export function afterApproveText(platform: unknown): string {
  return AFTER_APPROVE_TEXT[approveRouteFor(platform)];
}

/**
 * Persetujuan yang sengaja tidak diantre ke agen atau ekstensi (POST /approve menjawab queued false):
 *   - "manual": lowongan hanya bisa dilamar sendiri (LinkedIn), jawaban memuat manual_only true;
 *   - "email_direct": lamaran dikirim lewat panel Email di kartu persetujuan.
 */
export type NotQueuedRoute = "manual" | "email_direct";

export const QUEUED_APPROVED_TOAST = "Disetujui. Lamaran masuk antrean agen.";
export const MANUAL_APPROVED_TOAST = "Disetujui. Lamar sendiri di situs lowongan.";
export const EMAIL_APPROVED_TOAST = "Disetujui. Kirim lewat panel Email.";
export const UNQUEUED_APPROVED_TOAST = "Disetujui. Lamaran belum masuk antrean agen.";

export const NOT_QUEUED_HEADING: Record<NotQueuedRoute, string> = {
  manual: "Lamar sendiri di situs lowongan",
  email_direct: "Dilamar lewat email rekruter",
};
export const NOT_QUEUED_TEXT: Record<NotQueuedRoute, string> = {
  manual:
    "Lowongan ini hanya bisa dilamar sendiri di situsnya. Agen dan ekstensi tidak dipakai, jadi Applify tidak mengirim apa pun. Kartu ini pindah ke Riwayat saat masa berlaku persetujuan habis.",
  email_direct:
    "Lowongan ini meminta lamaran lewat email rekruter. Agen dan ekstensi tidak dipakai. Kirim lewat panel Email di bawah, lalu kartu ini pindah ke Riwayat setelah emailnya terkirim.",
};
export const NOT_QUEUED_OPEN_LABEL = "Buka lowongan";

/** Jalur tanpa antrean menurut jawaban POST /approve; null bila lamaran diantre atau jawabannya tidak dikenal. */
export function notQueuedRouteFrom(approveResponse: unknown): NotQueuedRoute | null {
  if (typeof approveResponse !== "object" || approveResponse === null) return null;
  const r = approveResponse as { apply_channel?: unknown; manual_only?: unknown };
  if (r.manual_only === true || r.apply_channel === "manual") return "manual";
  if (r.apply_channel === "email_direct") return "email_direct";
  return null;
}

/** Teks toast sesudah Setujui: hanya menyebut antrean agen bila lamaran memang masuk antrean. */
export function approvedToast(approveResponse: unknown): string {
  if (consentRequiredFrom(approveResponse)) return EXTENSION_CONSENT_REQUIRED_TOAST;
  const route = notQueuedRouteFrom(approveResponse);
  if (route === "manual") return MANUAL_APPROVED_TOAST;
  if (route === "email_direct") return EMAIL_APPROVED_TOAST;
  const queued = typeof approveResponse === "object" && approveResponse !== null ? (approveResponse as { queued?: unknown }).queued : undefined;
  return queued === false ? UNQUEUED_APPROVED_TOAST : QUEUED_APPROVED_TOAST;
}

/**
 * Jalur tanpa antrean untuk lowongan yang sudah disetujui, dibaca dari data lowongan (sama dengan pembagian
 * approvalDispatchTarget di backend/services/apply-channel.ts: manualOnly dulu, lalu email langsung). Dipakai saat halaman
 * dimuat ulang, ketika jawaban POST /approve sudah tidak ada.
 */
export function notQueuedRouteForJob(job: JobChannelInput): NotQueuedRoute | null {
  const c = classifyJobChannel(job);
  if (c.manualOnly) return "manual";
  if (c.channel === "email_direct") return "email_direct";
  return null;
}
