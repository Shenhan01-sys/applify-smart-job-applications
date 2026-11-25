/**
 * Daftar menu aplikasi. Label berbahasa Indonesia. Tanpa impor, supaya bisa dites dengan `node --test`;
 * ikon dipasangkan di AppShell berdasarkan `to`.
 *
 * - /profile ada di menu desktop dan ponsel.
 * - Persetujuan ada di bilah bawah ponsel.
 * - Bantuan disimpan di HELP_NAV_ITEM karena peta ikon AppShell dimiliki tim lain dan belum memuat /bantuan.
 * - Mode Anonim tidak ada di menu karena hanya pratinjau.
 * - Sesi LinkedIn tidak ada di menu utama: halamannya dibuka dari Pengaturan ("Lanjutan, opsional").
 * - Langganan dan pembayaran tidak punya menu (lihat appConfig.isBillingEnabled).
 */

/** Kamus label halaman yang dipakai bersama menu desktop, tab ponsel, dan halaman Bantuan. */
export const PAGE_LABELS = {
  "/dashboard": "Beranda",
  "/jobs": "Lowongan",
  "/approvals": "Persetujuan",
  "/applications": "Lamaran",
  "/profile": "Profil",
  "/bantuan": "Bantuan",
} as const;

/** Tautan halaman Bantuan. Dipasang terpisah sampai AppShell mendapat ikon untuk /bantuan. */
export const HELP_NAV_ITEM: { to: "/bantuan"; label: string } = {
  to: "/bantuan",
  label: PAGE_LABELS["/bantuan"],
};

export interface NavItem {
  to: "/dashboard" | "/jobs" | "/applications" | "/approvals" | "/profile" | "/automation-settings" | "/skill-radar" | "/blind-mode" | "/green-career" | "/settings";
  label: string;
}

export interface NavGroup {
  title: string;
  items: readonly NavItem["to"][];
}

/** Menu penuh: sidebar desktop dan laci ponsel. */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: "/dashboard", label: PAGE_LABELS["/dashboard"] },
  { to: "/jobs", label: PAGE_LABELS["/jobs"] },
  { to: "/applications", label: PAGE_LABELS["/applications"] },
  { to: "/approvals", label: PAGE_LABELS["/approvals"] },
  { to: "/profile", label: PAGE_LABELS["/profile"] },
  { to: "/automation-settings", label: "Pengaturan Agen" },
  { to: "/skill-radar", label: "Peta Skill" },
  { to: "/green-career", label: "Karier Hijau" },
  { to: "/settings", label: "Pengaturan" },
];

export const NAV_GROUPS: readonly NavGroup[] = [
  { title: "Utama", items: ["/dashboard", "/jobs", "/applications", "/approvals"] },
  { title: "Profil & Karir", items: ["/profile", "/skill-radar", "/green-career"] },
  { title: "Preferensi & Lainnya", items: ["/automation-settings", "/settings"] },
];

/** Bilah bawah ponsel: lima tujuan yang paling sering dipakai, semuanya terjangkau satu ketukan. */
export const MOBILE_TAB_ITEMS: readonly NavItem[] = [
  { to: "/dashboard", label: PAGE_LABELS["/dashboard"] },
  { to: "/jobs", label: PAGE_LABELS["/jobs"] },
  { to: "/approvals", label: PAGE_LABELS["/approvals"] },
  { to: "/applications", label: PAGE_LABELS["/applications"] },
  { to: "/profile", label: PAGE_LABELS["/profile"] },
];

/** Halaman aktif, termasuk anak rutenya (misalnya /profile?welcome=1 tetap /profile). */
export const isActivePath = (current: string, to: string): boolean => current === to || current.startsWith(`${to}/`);
