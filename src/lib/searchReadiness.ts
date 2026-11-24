/**
 * Apakah pencarian lowongan punya bahan untuk dicari. Backend (POST /api/automation/search) memakai kata kunci
 * dari permintaan, lalu kata kunci tersimpan di Pengaturan Agen, lalu jabatan dan skill dari profil. Tanpa satu pun
 * ia menjawab 400 { code: "keywords_required" }. Murni, supaya bisa dites dengan `node --test`.
 */

export const SEARCH_INPUT_HINT_TITLE = "Pencarian belum tahu apa yang dicari";
export const SEARCH_INPUT_HINT_TEXT = "Kata kunci pencarian dan jabatan di profilmu sama-sama belum diisi.";
export const SEARCH_INPUT_HINT_SETTINGS_LINK = "Isi kata kunci di Pengaturan Agen";
export const SEARCH_INPUT_HINT_PROFILE_LINK = "isi jabatan di Profil Saya";

export interface SearchReadinessInput {
  /** user_automation_settings.search_keywords */
  searchKeywords?: unknown;
  /** profiles.current_title */
  currentTitle?: unknown;
}

const hasText = (v: unknown): boolean => typeof v === "string" && v.trim() !== "";

/** true bila tidak ada kata kunci tersimpan dan tidak ada jabatan: petunjuk tampil sebelum mencari. */
export function searchInputMissing(input: SearchReadinessInput): boolean {
  const keywords = Array.isArray(input.searchKeywords) ? input.searchKeywords.filter(hasText) : [];
  return keywords.length === 0 && !hasText(input.currentTitle);
}
