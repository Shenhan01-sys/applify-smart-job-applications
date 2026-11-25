/**
 * Checklist lima langkah pengguna baru di Beranda (ON-01, catatan 41, 25 November 2026).
 *
 * Audit onboarding menemukan pengguna baru hanya melihat empat kartu "Langkah cepat" yang sejajar, tanpa urutan
 * dan tanpa tanda kemajuan. Pola daftar tugas (GOV.UK Design System, Task list) dan heuristik "visibility of system
 * status" (NN/g) dipakai di sini: setiap langkah punya status selesai dari data nyata akun, dan hanya ada satu
 * ajakan utama, yaitu langkah pertama yang belum selesai.
 *
 * TypeScript murni tanpa React supaya bisa diuji langsung oleh `node --test`.
 */

export type ChecklistStepId = "profile" | "cv" | "draft" | "approve" | "sent";

export interface ChecklistFacts {
  /** Profil memenuhi syarat AI Apply (needsOnboarding false). null = belum diketahui. */
  profileComplete: boolean | null;
  /** profiles.resume_url terisi. null = belum diketahui. */
  hasResume: boolean | null;
  /** Jumlah draf lamaran AI (ai_applications) di akun. */
  drafts: number;
  /** Jumlah persetujuan yang sudah disetujui (approval_requests.status approved). null = belum diketahui. */
  approved: number | null;
  /** Jumlah lamaran yang benar-benar terkirim (dashboardStats sent). */
  sent: number;
}

export interface ChecklistStep {
  id: ChecklistStepId;
  title: string;
  detail: string;
  /** Rute tujuan tombol langkah ini. */
  to: "/profile" | "/jobs" | "/approvals" | "/applications";
  /** Teks tombol saat langkah ini menjadi langkah berikutnya. */
  cta: string;
  /** true selesai, false belum, null belum diketahui (data gagal dibaca). */
  done: boolean | null;
}

const STEPS: ReadonlyArray<Omit<ChecklistStep, "done">> = [
  {
    id: "profile",
    title: "Lengkapi profil",
    detail: "Nama, bidang kerja yang kamu tuju, skill, serta pendidikan atau pengalaman. Agen memakai profil ini untuk mencocokkan lowongan dan menyusun lamaran.",
    to: "/profile",
    cta: "Lengkapi profil",
  },
  {
    id: "cv",
    title: "Unggah CV PDF",
    detail: "CV ini dilampirkan agen ke formulir lamaran. Unggahan yang sama juga bisa mengisi profilmu otomatis.",
    to: "/profile",
    cta: "Unggah CV",
  },
  {
    id: "draft",
    title: "Pilih lowongan, lalu buat draf dengan AI",
    detail: "Buka menu Lowongan, pilih lowongan yang kamu mau, lalu tekan Lamar dengan AI. Agen menyusun CV dan surat lamaran khusus untuk lowongan itu.",
    to: "/jobs",
    cta: "Cari lowongan",
  },
  {
    id: "approve",
    title: "Periksa dan setujui",
    detail: "Draf masuk ke halaman Persetujuan. Tidak ada lamaran yang dikirim sebelum kamu menekan Setujui.",
    to: "/approvals",
    cta: "Buka Persetujuan",
  },
  {
    id: "sent",
    title: "Pantau sampai terkirim",
    detail: "Setelah kamu setujui, agen mengirim lamaran dan statusnya muncul di Lamaran Saya. Bila agen butuh jawabanmu, kartunya ada di Persetujuan.",
    to: "/applications",
    cta: "Lihat Lamaran Saya",
  },
];

function stepDone(id: ChecklistStepId, f: ChecklistFacts): boolean | null {
  switch (id) {
    case "profile":
      return f.profileComplete;
    case "cv":
      return f.hasResume;
    case "draft":
      return f.drafts > 0 || f.sent > 0;
    case "approve":
      // Lamaran yang sudah terkirim pasti pernah disetujui, walau hitungan persetujuan gagal dibaca.
      if (f.sent > 0) return true;
      return f.approved === null ? null : f.approved > 0;
    case "sent":
      return f.sent > 0;
  }
}

export interface Checklist {
  steps: ChecklistStep[];
  /** Jumlah langkah selesai (yang belum diketahui tidak dihitung). */
  doneCount: number;
  total: number;
  /** Langkah pertama yang belum selesai; null bila semua selesai. Langkah yang belum diketahui tidak dipilih. */
  next: ChecklistStep | null;
  /** true bila semua langkah selesai: checklist boleh disembunyikan. */
  complete: boolean;
}

export function buildChecklist(f: ChecklistFacts): Checklist {
  const steps = STEPS.map((s) => ({ ...s, done: stepDone(s.id, f) }));
  const doneCount = steps.filter((s) => s.done === true).length;
  const next = steps.find((s) => s.done === false) ?? null;
  return { steps, doneCount, total: steps.length, next, complete: doneCount === steps.length };
}
