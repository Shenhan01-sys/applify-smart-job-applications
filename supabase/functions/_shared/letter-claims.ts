// Penguji klaim surat lamaran yang deterministik: lama pengalaman, jabatan, dan perusahaan.
//
// Prompt melarang model mengarang, tetapi model tetap melakukannya (E2E production 27 November 2026: "Web Developer
// dengan pengalaman 3 tahun" untuk kandidat yang baru 13 bulan di peran teknis). Penguji ini membaca surat jadi dan
// menandai kalimat yang menyatakan:
//   1. lama pengalaman ("3 tahun pengalaman", "pengalaman selama 8 bulan", "3+ years of experience") yang melebihi
//      batas hasil hitungan kode (experience-facts.ts);
//   2. jabatan yang tidak ada di profil ("sebagai Senior Web Developer", "seorang Web Developer");
//   3. perusahaan tempat bekerja yang tidak ada di profil ("bekerja sebagai ... di PT Palsu").
// Alurnya di Edge Function: surat ditolak, dibuat ulang sekali dengan peringatan, dan bila masih melanggar, kalimat itu
// dihapus. Penguji ini sengaja sempit: ia hanya menandai kalimat yang jelas menyatakan klaim kerja, supaya kalimat
// biasa ("selama 4 tahun kuliah", "melamar sebagai Software Engineer Intern di Coinbase") tidak ikut terhapus.
//
// Fungsi murni, tanpa API Deno, Node, atau browser, supaya jalan di Edge Function dan di `node --test`.

export type ClaimKind = 'experience_duration' | 'job_title' | 'employer'

export interface ClaimViolation {
  kind: ClaimKind
  /** Kalimat lengkap seperti di surat. */
  sentence: string
  /** Bagian yang diklaim: "3 tahun", "Web Developer", "PT Palsu". */
  claim: string
  /** Penjelasan singkat (Bahasa Indonesia) untuk catatan ke pengguna. */
  message: string
}

export interface ClaimKnowledge {
  /** Paling banyak berapa bulan pengalaman yang boleh diklaim (ExperienceFacts.claimMonths). */
  claimMonths: number
  /** Jabatan sah: jabatan saat ini, semua jabatan di riwayat kerja, dan judul lowongan yang dilamar. */
  titles: string[]
  /** Teks yang memuat nama organisasi sah: perusahaan, institusi, ringkasan, penghargaan, lokasi, dan perusahaan target. */
  knownText: string
}

const stripMarks = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const compact = (s: string) => stripMarks(s).replace(/\s+/g, '')

// ───────────────────────────────────────────────────────────── 1. lama pengalaman

const WORD_NUMBERS: Record<string, number> = {
  satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10, sebelas: 11,
  'dua belas': 12, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
  twelve: 12,
}

const DURATION_RE = new RegExp(
  `(?<![\\p{L}\\p{N}.,])(\\d+(?:[.,]\\d+)?|dua belas|${Object.keys(WORD_NUMBERS).filter((k) => k !== 'dua belas').join('|')})\\s*\\+?\\s*(tahun|thn|bulan|years?|yrs?|months?)(?![\\p{L}\\p{N}])|\\b(setahun|sebulan)\\b`,
  'giu',
)

// Kalimat yang menyatakan pekerjaan atau pengalaman. Tanpa salah satunya, durasi dianggap hal lain (kuliah, kursus).
const EXPERIENCE_CONTEXT =
  /pengalaman|berpengalaman|experience|experienced|bekerja|berkarya|berkarier|berkarir|karier|karir|career|worked|working|menekuni|berkecimpung|menjabat|magang|intern(?:ship)?\b|freelance|profesional|professional/i
// Durasi di dekat kata pendidikan atau pelatihan bukan klaim pengalaman kerja.
const EDUCATION_NEAR = /kuliah|studi|study|studying|studied|pendidikan|sarjana|degree|bootcamp|kursus|course|pelatihan|training|semester|sekolah|school/i

function durationMonths(raw: string, unit: string): number {
  const key = raw.toLowerCase()
  const n = key in WORD_NUMBERS ? WORD_NUMBERS[key] : Number(key.replace(',', '.'))
  if (!Number.isFinite(n)) return 0
  return /^(?:tahun|thn|year|yr)/i.test(unit) ? n * 12 : n
}

function durationClaims(sentence: string): { text: string; months: number }[] {
  const out: { text: string; months: number }[] = []
  for (const m of sentence.matchAll(DURATION_RE)) {
    const at = m.index ?? 0
    const near = sentence.slice(Math.max(0, at - 35), at + m[0].length + 35)
    if (EDUCATION_NEAR.test(near)) continue
    const months = m[3] ? (m[3].toLowerCase() === 'setahun' ? 12 : 1) : durationMonths(m[1], m[2])
    if (months > 0) out.push({ text: m[0].trim(), months })
  }
  return out
}

// ───────────────────────────────────────────────────────────── 2. jabatan

const ROLE_NOUN =
  /\b(?:developer|engineer|programmer|analyst|analis|designer|desainer|manager|manajer|lead|coach|assistant|asisten|intern|magang|consultant|konsultan|specialist|spesialis|officer|administrator|admin|architect|arsitek|scientist|tester|staff|staf|instructor|instruktur|pengajar|trainer|freelancer|executive|supervisor|director|direktur|head|ketua|koordinator|coordinator|technician|teknisi|researcher|peneliti|writer|editor|marketer|accountant|akuntan|representative|operator|founder|co-founder|ceo|cto)\b/i

const TITLE_INTRO = /\b(?:sebagai|seorang|as an?|as the|i am an?|i'm an?|adalah)\s+/gi
const TITLE_STOP = new Set([
  'di', 'at', 'pada', 'for', 'with', 'dengan', 'yang', 'selama', 'sejak', 'since', 'in', 'dan', 'and', 'atau', 'or', 'to',
  'untuk', 'dalam', 'from', 'saya', 'i', 'my', 'that', 'where', 'which', 'serta', 'ini', 'itu', 'bagi', 'guna', 'sehingga',
])
// Kalimat yang menyatakan maksud melamar atau perkenalan posisi target: judulnya urusan lowongan, bukan klaim riwayat.
const APPLICATION_INTENT = /melamar|lamar|apply|applying|application|tertarik|interested|bergabung|join\b|kandidat|candidate|mengajukan|menjadi bagian/i

function titlePhrases(sentence: string): string[] {
  const out: string[] = []
  for (const intro of sentence.matchAll(TITLE_INTRO)) {
    const rest = sentence.slice((intro.index ?? 0) + intro[0].length)
    const tokens: string[] = []
    for (const word of rest.split(/\s+/)) {
      const clean = word.replace(/^[("']+/, '')
      if (!clean || TITLE_STOP.has(clean.toLowerCase().replace(/[.,;:)]+$/, ''))) break
      tokens.push(clean.replace(/[.,;:)]+$/, ''))
      if (/[.,;:)]$/.test(clean) || tokens.length >= 6) break
    }
    const phrase = tokens.join(' ').trim()
    if (phrase && ROLE_NOUN.test(phrase)) out.push(phrase)
  }
  return out
}

function titleKnown(phrase: string, titles: string[]): boolean {
  const p = compact(phrase)
  if (!p) return true
  return titles.some((t) => compact(t).includes(p))
}

// ───────────────────────────────────────────────────────────── 3. perusahaan

// Kalimat yang menyatakan tempat bekerja. "di Jakarta" dalam kalimat biasa tidak ikut diperiksa.
const WORK_CONTEXT =
  /bekerja|berkarya|magang|menjabat|worked|working|interned|internship|pengalaman[^.]{0,40}\bdi\b|experience\s+(?:at|with)|(?:sebagai|as an?)\s+[^.]{0,60}\s(?:di|at)\s/i
const EMPLOYER_RE =
  /\b(?:di|at|pada|bersama)\s+((?:PT|CV|UD|PD)\.?\s+)?([A-Z][\p{L}\p{N}&.'-]*(?:\s+(?:[A-Z][\p{L}\p{N}&.'-]*|of|&|and|dan))*)/gu
const GENERIC_PLACES = new Set([
  'indonesia', 'jakarta', 'yogyakarta', 'jogja', 'bandung', 'surabaya', 'semarang', 'bali', 'singapore', 'singapura', 'remote',
  'amerika', 'asia', 'eropa', 'europe', 'usa', 'us',
])

function employerPhrases(sentence: string): string[] {
  const out: string[] = []
  for (const m of sentence.matchAll(EMPLOYER_RE)) {
    const phrase = `${m[1] ?? ''}${m[2]}`.replace(/[.,;:]+$/, '').trim()
    const bare = stripMarks(phrase)
    if (!bare || GENERIC_PLACES.has(bare)) continue
    out.push(phrase)
  }
  return out
}

function employerKnown(phrase: string, knownText: string): boolean {
  const p = compact(phrase.replace(/^(?:PT|CV|UD|PD)\.?\s+/i, ''))
  return !p || compact(knownText).includes(p)
}

// ───────────────────────────────────────────────────────────── pemeriksaan surat

/** Kalimat per paragraf, urutan asli. Paragraf dipisah baris kosong; kalimat dipisah tanda akhir kalimat. */
export function splitLetter(letter: string): string[][] {
  return String(letter ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean))
}

/** Semua klaim surat yang tidak didukung data profil. Kosong bila surat bersih. */
export function findClaimViolations(letter: string, k: ClaimKnowledge): ClaimViolation[] {
  const out: ClaimViolation[] = []
  for (const sentence of splitLetter(letter).flat()) {
    const intent = APPLICATION_INTENT.test(sentence)

    if (EXPERIENCE_CONTEXT.test(sentence)) {
      for (const d of durationClaims(sentence)) {
        if (d.months > k.claimMonths) {
          out.push({
            kind: 'experience_duration',
            sentence,
            claim: d.text,
            message: `Lama pengalaman "${d.text}" melebihi hasil hitungan dari riwayat kerja di profil.`,
          })
        }
      }
    }

    if (!intent) {
      for (const phrase of titlePhrases(sentence)) {
        if (!titleKnown(phrase, k.titles)) {
          out.push({ kind: 'job_title', sentence, claim: phrase, message: `Jabatan "${phrase}" tidak ada di profil.` })
        }
      }
    }

    if (WORK_CONTEXT.test(sentence)) {
      for (const phrase of employerPhrases(sentence)) {
        if (!employerKnown(phrase, k.knownText)) {
          out.push({ kind: 'employer', sentence, claim: phrase, message: `Perusahaan "${phrase}" tidak ada di profil.` })
        }
      }
    }
  }
  return out
}

/** Hapus kalimat yang melanggar; paragraf yang jadi kosong ikut hilang. Bentuk paragraf lain tidak berubah. */
export function removeViolatingSentences(letter: string, violations: ClaimViolation[]): string {
  if (violations.length === 0) return String(letter ?? '')
  const bad = new Set(violations.map((v) => v.sentence))
  return splitLetter(letter)
    .map((sentences) => sentences.filter((s) => !bad.has(s)).join(' '))
    .filter(Boolean)
    .join('\n\n')
}

/** Peringatan untuk model pada percobaan ulang (Bahasa Inggris, karena prompt berbahasa Inggris). */
export function correctionNote(violations: ClaimViolation[], k: ClaimKnowledge): string {
  const lines = violations.slice(0, 6).map((v) => {
    const what =
      v.kind === 'experience_duration'
        ? `states "${v.claim}" of experience, but the verified maximum is ${k.claimMonths} month(s)`
        : v.kind === 'job_title'
          ? `names the job title "${v.claim}", which is not in the candidate data`
          : `names the employer "${v.claim}", which is not in the candidate data`
    return `- "${v.sentence.slice(0, 160)}" ${what}.`
  })
  return `CORRECTION: your previous draft was rejected because it contained claims the candidate data does not support:\n${lines.join('\n')}\nWrite the whole JSON again. Remove those claims. Use no duration of experience above the verified maximum, and use job titles and employers exactly as listed in the candidate data.`
}

/** Satu butir catatan untuk pengguna per jenis klaim yang dihapus. */
export function removalWarnings(violations: ClaimViolation[]): { kind: ClaimKind; values: string[]; message: string }[] {
  const byKind = new Map<ClaimKind, string[]>()
  for (const v of violations) byKind.set(v.kind, [...(byKind.get(v.kind) ?? []), v.claim])
  const label: Record<ClaimKind, string> = {
    experience_duration: 'Kalimat tentang lama pengalaman dihapus karena angkanya melebihi riwayat kerja di profil',
    job_title: 'Kalimat dihapus karena menyebut jabatan yang tidak ada di profil',
    employer: 'Kalimat dihapus karena menyebut perusahaan yang tidak ada di profil',
  }
  return [...byKind].map(([kind, values]) => {
    const unique = [...new Set(values)].slice(0, 6)
    return { kind, values: unique, message: `${label[kind]}: ${unique.join(', ')}.` }
  })
}
