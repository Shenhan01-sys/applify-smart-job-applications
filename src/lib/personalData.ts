/**
 * Isian formulir lowongan yang berasal dari Pengaturan Agen, tab Data Pribadi (nama depan, nama belakang,
 * nomor telepon, kota, alamat, kode pos, negara). Bila tab itu kosong, isian ini ikut kosong di setiap
 * lamaran, jadi layar yang menampilkan isian kosong perlu memberi tahu bahwa mengisinya cukup sekali.
 *
 * Label formulir apa adanya dari lowongan (biasanya bahasa Inggris), jadi pencocokannya longgar tetapi
 * hanya untuk label pendek: kalimat panjang seperti "Are you authorized to work in the country" bukan data pribadi.
 *
 * Fungsi murni tanpa impor, supaya bisa dites dengan `node --test`.
 */

/** Label yang lebih panjang dari ini dianggap pertanyaan, bukan isian data pribadi. */
export const MAX_PERSONAL_LABEL_LENGTH = 40;

const PERSONAL_LABEL =
  /\b(first name|last name|given name|family name|surname|phone|mobile|telephone|city|address|zip|postal|post code|country|nama depan|nama belakang|telepon|telpon|no\.? ?hp|nomor hp|kota|alamat|kode pos|negara)\b/i;

/** true untuk label isian yang diisi dari Data Pribadi di Pengaturan Agen. Email tidak termasuk (dari akun). */
export function isPersonalDataLabel(label: unknown): boolean {
  if (typeof label !== "string") return false;
  const text = label.trim();
  if (!text || text.length > MAX_PERSONAL_LABEL_LENGTH) return false;
  if (/e-?mail/i.test(text)) return false;
  return PERSONAL_LABEL.test(text);
}

/** Subset label yang berasal dari Data Pribadi, urutan asli dijaga, kembar dibuang. */
export function personalDataLabels(labels: ReadonlyArray<unknown> | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of labels ?? []) {
    if (!isPersonalDataLabel(item)) continue;
    const label = (item as string).trim();
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

/** Berapa label yang disebut di petunjuk; sisanya cukup dihitung. */
export const MAX_HINT_LABELS = 3;

/** "Country dan Phone", "Country, Phone, dan City", "Country, Phone, City, dan 2 lainnya". */
export function listPersonalLabels(labels: readonly string[]): string {
  const shown = labels.slice(0, MAX_HINT_LABELS);
  const rest = labels.length - shown.length;
  if (rest > 0) return `${shown.join(", ")}, dan ${rest} lainnya`;
  if (shown.length <= 1) return shown.join("");
  return `${shown.slice(0, -1).join(", ")} dan ${shown[shown.length - 1]}`;
}

/** Petunjuk singkat di bawah daftar isian kosong. "" bila tidak ada isian data pribadi di daftar. */
export function personalDataHint(labels: ReadonlyArray<unknown> | null | undefined): string {
  const personal = personalDataLabels(labels);
  if (personal.length === 0) return "";
  return `${listPersonalLabels(personal)} diisi dari Data Pribadi di Pengaturan Agen. Isi sekali di sana, lalu agen memakainya di semua lamaran.`;
}

/** Teks tautan ke /automation-settings, tempat Data Pribadi (tab pertama dan tab bawaan halaman itu). */
export const PERSONAL_DATA_LINK_LABEL = "Isi Data Pribadi";
