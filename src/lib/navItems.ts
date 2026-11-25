/**
 * Daftar menu aplikasi. Label berbahasa Indonesia. Tanpa impor, supaya bisa dites dengan `node --test`;
 * ikon dipasangkan di AppShell berdasarkan `to`.
 *
 * - /profile ada di menu desktop dan ponsel.
 * - Persetujuan ada di bilah bawah ponsel.
 * - Sesi LinkedIn tidak ada di menu utama: halamannya dibuka dari Pengaturan ("Lanjutan, opsional").
 * - Langganan dan pembayaran tidak punya menu (lihat appConfig.isBillingEnabled).
 */
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
  { to: "/dashboard", label: "Beranda" },
  { to: "/jobs", label: "Lowongan" },
  { to: "/applications", label: "Lamaran Saya" },
  { to: "/approvals", label: "Persetujuan" },
  { to: "/profile", label: "Profil Saya" },
  { to: "/automation-settings", label: "Pengaturan Agen" },
  { to: "/skill-radar", label: "Peta Skill" },
  { to: "/blind-mode", label: "Mode Anonim" },
  { to: "/green-career", label: "Karier Hijau" },
  { to: "/settings", label: "Pengaturan" },
];

export const NAV_GROUPS: readonly NavGroup[] = [
  { title: "Utama", items: ["/dashboard", "/jobs", "/applications", "/approvals"] },
  { title: "Profil & Karir", items: ["/profile", "/skill-radar", "/green-career"] },
  { title: "Preferensi & Lainnya", items: ["/automation-settings", "/settings", "/blind-mode"] },
];

/** Bilah bawah ponsel: lima tujuan yang paling sering dipakai, semuanya terjangkau satu ketukan. */
export const MOBILE_TAB_ITEMS: readonly NavItem[] = [
  { to: "/dashboard", label: "Beranda" },
  { to: "/jobs", label: "Lowongan" },
  { to: "/approvals", label: "Persetujuan" },
  { to: "/applications", label: "Lamaran" },
  { to: "/profile", label: "Profil" },
];

/** Halaman aktif, termasuk anak rutenya (misalnya /profile?welcome=1 tetap /profile). */
export const isActivePath = (current: string, to: string): boolean => current === to || current.startsWith(`${to}/`);
