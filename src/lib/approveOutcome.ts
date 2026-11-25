/**
 * Apa yang terjadi sesudah pengguna menekan Setujui, menurut jalur kirim lowongan (ON-02, catatan 41).
 *
 * Audit onboarding menemukan teks yang tampak bertentangan: modal Persetujuan berkata lamaran "benar-benar dikirim",
 * sedangkan teks ekstensi berkata "berhenti sebelum kirim". Keduanya benar untuk jalurnya masing-masing, tetapi
 * pengguna tidak tahu jalur mana yang dipakai lowongannya. Fungsi ini memilih satu penjelasan dari `platform`
 * persetujuan, sama seperti pembagian di lib/applyChannel.ts:
 *   1. ATS publik (Greenhouse, Lever, Ashby, dan sejenisnya): agen server mengisi dan menekan kirim sendiri.
 *   2. Portal berakun yang didukung ekstensi (JobStreet, Glints, Kalibrr, Dealls): ekstensi di laptop mengisi,
 *      pengguna yang menekan Kirim.
 *   3. Lainnya: penjelasan umum yang tetap benar (lamaran bisa terkirim sungguhan, tidak bisa ditarik).
 */

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
    "Setelah kamu setujui, Ekstensi Browser Applify di laptopmu (Chrome atau Edge) membuka situs ini, menunggu kamu masuk ke akun pelamar, lalu mengisi formulir. Ekstensi berhenti sebelum kirim: kamu sendiri yang menekan Kirim di situs itu.",
  other:
    "Setujui berarti lamaran ini boleh dikirim ke perusahaan atas namamu, dan lamaran yang sudah terkirim tidak bisa ditarik. Tekan Tolak bila kamu tidak ingin melamar.",
};

export function afterApproveText(platform: unknown): string {
  return AFTER_APPROVE_TEXT[approveRouteFor(platform)];
}
