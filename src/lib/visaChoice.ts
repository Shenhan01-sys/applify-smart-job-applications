/**
 * Pilihan "Butuh sponsor visa kerja?" di Pengaturan Agen (kolom `user_automation_settings.require_visa`, teks bebas).
 *
 * Kolom itu berisi "No" (huruf N besar) sebagai nilai bawaan database pada akun yang belum pernah mengisinya.
 * Backend dan worker membaca "No" persis itu, juga null dan kosong, sebagai belum dipilih (keyakinan rendah,
 * "Perlu dicek"), sedangkan `no` dan `yes` huruf kecil adalah pilihan pengguna. Pilihan di layar mengikuti aturan
 * yang sama, supaya nilai bawaan tidak tampil seolah-olah pengguna memilih "Tidak" (uji E2E klik 20 November 2026,
 * temuan 15). Layar hanya menulis `no`, `yes`, atau kosong, tidak pernah "No".
 *
 * Fungsi murni tanpa impor, supaya bisa dites dengan `node --test`.
 */

export type VisaChoice = "" | "no" | "yes";

/** Nilai pilihan "Belum dipilih": juga yang ditulis ke database bila pengguna memilihnya. */
export const VISA_UNSET: VisaChoice = "";

export const VISA_OPTIONS: ReadonlyArray<{ value: VisaChoice; label: string }> = [
  { value: VISA_UNSET, label: "Belum dipilih" },
  { value: "no", label: "Tidak" },
  { value: "yes", label: "Ya" },
];

/** Nilai yang ditampilkan pilihan. Hanya `no` dan `yes` huruf kecil yang dianggap pilihan pengguna. */
export function visaSelectValue(stored: unknown): VisaChoice {
  return stored === "no" || stored === "yes" ? stored : VISA_UNSET;
}

/** Nilai yang ditulis ke `require_visa` untuk pilihan di layar. Apa pun selain `no` dan `yes` ditulis kosong. */
export function visaValueToStore(selected: unknown): VisaChoice {
  return visaSelectValue(selected);
}
