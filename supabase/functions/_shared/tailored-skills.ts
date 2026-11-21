// "Skill yang Disorot" pada draf lamaran harus berisi skill milik kandidat, bukan kalimat persyaratan lowongan.
// Uji klik produksi 21 November 2026 (temuan 24): tiga butir berupa kalimat seperti "Memiliki kemampuan analisa
// yang baik" tampil sebagai skill yang disorot, karena keluaran model dipakai apa adanya.
//
// Aturan di sini: hasil akhir selalu irisan dengan daftar skill profil (ejaan profil dipakai), dari dua sumber:
//   1. butir keluaran model yang sama dengan, atau memuat sebagai kata utuh, sebuah skill profil;
//   2. skill profil yang disebut di teks lowongan (judul, deskripsi, requirements).
// Tanpa irisan, hasilnya kosong. Kalimat dari lowongan tidak pernah masuk.
//
// TypeScript murni tanpa impor: jalan di Deno (Edge Function) dan di `node --test`.

/** Huruf kecil; hanya a-z, 0-9, + # . yang dipertahankan ("c++", "c#", "node.js"); sisanya jadi spasi. */
function norm(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").replace(/\s+/g, " ").trim();
}

const isAlnum = (c: string): boolean => /[a-z0-9]/.test(c);

/** `term` berdiri sendiri di `hay` (bukan potongan kata lain: "java" tidak ada di "javascript"). */
function hasWord(hay: string, term: string): boolean {
  if (!term) return false;
  let from = 0;
  for (;;) {
    const i = hay.indexOf(term, from);
    if (i < 0) return false;
    const before = i > 0 ? hay[i - 1] : " ";
    const after = i + term.length < hay.length ? hay[i + term.length] : " ";
    if (!(isAlnum(term[0]) && isAlnum(before)) && !(isAlnum(term[term.length - 1]) && isAlnum(after))) return true;
    from = i + 1;
  }
}

/** Skill profil yang dipakai untuk mencocokkan teks bebas harus cukup panjang: "Go" atau "R" cocok dengan kata biasa. */
const MIN_FREE_TEXT_LENGTH = 3;

export function selectTailoredSkills(
  modelSkills: unknown,
  profileSkills: readonly string[],
  jobText: string,
  max = 8,
): string[] {
  const profile: { label: string; n: string }[] = [];
  const seen = new Set<string>();
  for (const raw of profileSkills) {
    const label = typeof raw === "string" ? raw.trim() : "";
    const n = norm(label);
    if (n.length < 2 || seen.has(n)) continue;
    seen.add(n);
    profile.push({ label, n });
  }
  if (profile.length === 0) return [];

  const picked = new Map<string, string>();
  const take = (p: { label: string; n: string }) => {
    if (!picked.has(p.n)) picked.set(p.n, p.label);
  };

  // 1) butir keluaran model yang menunjuk skill profil
  for (const item of Array.isArray(modelSkills) ? modelSkills : []) {
    if (typeof item !== "string") continue;
    const n = norm(item);
    if (n.length < 2 || n.split(" ").length > 4) continue;
    const hit = profile.find((p) => p.n === n || (p.n.length >= MIN_FREE_TEXT_LENGTH && hasWord(n, p.n)) || (n.length >= MIN_FREE_TEXT_LENGTH && hasWord(p.n, n)));
    if (hit) take(hit);
  }

  // 2) skill profil yang disebut lowongan
  const hay = norm(jobText);
  for (const p of profile) {
    if (p.n.length >= MIN_FREE_TEXT_LENGTH && hasWord(hay, p.n)) take(p);
  }

  return [...picked.values()].slice(0, max);
}
