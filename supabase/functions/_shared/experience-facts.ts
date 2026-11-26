// Lama pengalaman kerja yang dihitung di kode, bukan oleh model, untuk prompt surat lamaran.
//
// Temuan E2E production 27 November 2026 (draf Coinbase Software Engineer Intern): surat menyebut kandidat "Web
// Developer" dengan "3 tahun" pengalaman. Data work_experiences-nya: tiga peran teknis yang baru berjalan 1 tahun
// lebih (sejak 2025-10, 2026-02, 2026-07), ditambah peran non-teknis (pelatih kebugaran 2023-12 sampai 2025-12).
// Angka 3 berasal dari kolom profiles.experience_years yang diisi sendiri dan dari penjumlahan semua peran, termasuk
// yang non-IT. Berkas ini menghitung lama pengalaman dari tanggal peran, memisahkan peran teknis dari non-teknis,
// menggabungkan peran yang bertumpuk supaya tidak dihitung dua kali, lalu menyerahkan angkanya ke prompt sebagai fakta.
// Angka yang sama dipakai penguji surat (letter-claims.ts) sebagai batas klaim.
//
// Fungsi murni, tanpa impor dan tanpa API Deno, Node, atau browser, supaya jalan di Edge Function dan di `node --test`.
// Heuristik klasifikasi sengaja condong ke "bukan teknis": salah menghitung peran non-teknis sebagai teknis membuat
// surat membesar-besarkan, sedangkan salah dalam arah sebaliknya hanya membuat surat lebih hemat.

export interface WorkRowLike {
  role_title?: unknown
  company_name?: unknown
  description?: unknown
  start_date?: unknown
  end_date?: unknown
  is_current?: unknown
}

export interface ExperienceFacts {
  /** Gabungan semua peran bertanggal, dalam bulan penuh (peran yang bertumpuk dihitung sekali). */
  totalMonths: number
  technicalMonths: number
  nonTechnicalMonths: number
  /** "Jabatan @ Perusahaan", urutan seperti masukan. */
  technicalRoles: string[]
  nonTechnicalRoles: string[]
  /** Peran tanpa tanggal mulai yang terbaca: tidak ikut dihitung. */
  skippedRoles: number
  /** Lowongan ini lowongan teknis (dari judul dan awal deskripsi). */
  jobIsTechnical: boolean
  /** profiles.experience_years yang diisi pengguna. Tidak terverifikasi, hanya dipakai bila tidak ada peran bertanggal. */
  declaredYears: number | null
  /** Paling banyak berapa bulan pengalaman yang boleh diklaim surat ini. */
  claimMonths: number
  basis: 'technical' | 'total' | 'declared' | 'none'
}

const DAY_MS = 86_400_000
/** Rata-rata hari dalam sebulan; bulan penuh = lantai dari hari / nilai ini. */
const DAYS_PER_MONTH = 30.4375

/** Tanggal 'YYYY-MM-DD', 'YYYY-MM', atau 'YYYY' ke hari sejak epoch (UTC). null bila tidak terbaca. */
export function parseDay(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const m = /^\s*(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?/.exec(value)
  if (!m) return null
  const y = Number(m[1])
  const mo = m[2] ? Number(m[2]) : 1
  const d = m[3] ? Number(m[3]) : 1
  if (y < 1950 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return Math.floor(Date.UTC(y, mo - 1, d) / DAY_MS)
}

interface Interval {
  start: number
  end: number
  technical: boolean
  label: string
}

const text = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')

// Jabatan yang jelas teknis. `\bweb\s?3\b` dan "technical" menutup "Web 3 Developer" dan "Technical Team".
const TECH_TITLE =
  /\b(?:developer|programmer|engineer|software|devops|sre|full[\s-]?stack|front[\s-]?end|back[\s-]?end|web\s?3|web3|blockchain|smart contract|data (?:analyst|scientist|engineer)|machine learning|ml engineer|qa|quality assurance|tester|sysadmin|system administrator|cyber ?security|security (?:analyst|engineer)|network engineer|technical|teknis|technology|teknologi|\bit\b|informatika|pemrogram\w*|pengembang(?:\s+(?:web|perangkat lunak|aplikasi|software))?)\b/i

// Jabatan yang sifatnya ditentukan isi pekerjaannya (asisten, magang, staf, relawan): deskripsi boleh menaikkannya
// menjadi teknis. Jabatan lain tidak pernah dinaikkan dari deskripsi, supaya "Fitness Coach" tidak menjadi teknis.
const FLEXIBLE_TITLE = /\b(?:assistant|asisten|intern|magang|staff|staf|volunteer|relawan|member|anggota|freelance|freelancer)\b/i
const TECH_DESCRIPTION =
  /\b(?:programming|pemrograman|coding|software|perangkat lunak|web development|pengembangan web|blockchain|smart contract|javascript|typescript|python|react|node\.?js|laravel|sql|java|golang|rust|solidity)\b/i

/** Peran teknis menurut jabatan dan nama organisasinya; deskripsi hanya untuk jabatan yang fleksibel. */
export function isTechnicalRole(row: WorkRowLike): boolean {
  const title = text(row.role_title)
  const company = text(row.company_name)
  if (TECH_TITLE.test(title)) return true
  if (/\b(?:blockchain|software|developer|coding|programming|tech)\b/i.test(company) && FLEXIBLE_TITLE.test(title)) return true
  if (FLEXIBLE_TITLE.test(title) && TECH_DESCRIPTION.test(text(row.description))) return true
  return false
}

const JOB_TECH_TITLE =
  /\b(?:developer|programmer|engineer|software|devops|sre|full[\s-]?stack|front[\s-]?end|back[\s-]?end|web\s?3|web3|blockchain|data (?:analyst|scientist|engineer)|machine learning|qa|quality assurance|tester|sysadmin|cyber ?security|technical|technology|\bit\b|pemrogram\w*|pengembang)\b/i

/** Lowongan teknis: judulnya jelas teknis, atau awal deskripsinya memuat sedikitnya dua istilah teknis berbeda. */
export function isTechnicalJob(title: unknown, description: unknown): boolean {
  if (JOB_TECH_TITLE.test(text(title))) return true
  const head = text(description).slice(0, 600).toLowerCase()
  const hits = new Set(head.match(new RegExp(TECH_DESCRIPTION.source, 'gi')) ?? [])
  return hits.size >= 2
}

function toIntervals(rows: unknown, today: number): { items: Interval[]; skipped: number } {
  const items: Interval[] = []
  let skipped = 0
  if (!Array.isArray(rows)) return { items, skipped }
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as WorkRowLike
    const start = parseDay(r.start_date)
    if (start === null || start > today) {
      skipped += 1
      continue
    }
    // Tanpa tanggal selesai berarti masih berjalan (is_current, atau kolom selesai dibiarkan kosong). Selesai di masa
    // depan dipotong ke hari ini. Selesai sebelum mulai berarti data rusak: dilewati.
    const open = r.is_current === true || !text(r.end_date)
    const end = open ? today : Math.min(parseDay(r.end_date) ?? today, today)
    if (end < start) {
      skipped += 1
      continue
    }
    const title = text(r.role_title)
    const company = text(r.company_name)
    items.push({ start, end, technical: isTechnicalRole(r), label: [title, company].filter(Boolean).join(' @ ') })
  }
  return { items, skipped }
}

/** Panjang gabungan interval dalam hari; interval yang bertumpuk dihitung sekali. */
function unionDays(intervals: { start: number; end: number }[]): number {
  const sorted = [...intervals].sort((a, b) => a.start - b.start)
  let total = 0
  let curStart = -1
  let curEnd = -1
  for (const it of sorted) {
    if (curEnd < 0 || it.start > curEnd) {
      if (curEnd >= 0) total += curEnd - curStart
      curStart = it.start
      curEnd = it.end
    } else if (it.end > curEnd) {
      curEnd = it.end
    }
  }
  if (curEnd >= 0) total += curEnd - curStart
  return total
}

const monthsOf = (days: number): number => Math.max(0, Math.floor(days / DAYS_PER_MONTH))

function declared(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value)
  return Number.isFinite(n) && n > 0 && n <= 60 ? n : null
}

/**
 * Lama pengalaman dari baris work_experiences. `jobText` adalah judul dan awal deskripsi lowongan; `declaredYears`
 * adalah profiles.experience_years. Batas klaim (`claimMonths`): untuk lowongan teknis hanya pengalaman teknis, untuk
 * lowongan lain semua peran bertanggal. Tanpa satu pun peran bertanggal, angka yang diisi pengguna dipakai apa adanya
 * (ditandai `basis: 'declared'`), karena tidak ada data lain untuk membantahnya.
 */
export function computeExperienceFacts(
  rows: unknown,
  opts: { now?: Date; jobTitle?: unknown; jobDescription?: unknown; declaredYears?: unknown } = {},
): ExperienceFacts {
  const now = opts.now ?? new Date()
  const today = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / DAY_MS)
  const { items, skipped } = toIntervals(rows, today)
  const technical = items.filter((i) => i.technical)
  const other = items.filter((i) => !i.technical)
  const jobIsTechnical = isTechnicalJob(opts.jobTitle, opts.jobDescription)
  const declaredYears = declared(opts.declaredYears)
  const totalMonths = monthsOf(unionDays(items))
  const technicalMonths = monthsOf(unionDays(technical))
  const nonTechnicalMonths = monthsOf(unionDays(other))

  let claimMonths = 0
  let basis: ExperienceFacts['basis'] = 'none'
  if (items.length > 0) {
    claimMonths = jobIsTechnical ? technicalMonths : totalMonths
    basis = jobIsTechnical ? 'technical' : 'total'
  } else if (declaredYears !== null) {
    claimMonths = Math.floor(declaredYears * 12)
    basis = 'declared'
  }
  return {
    totalMonths,
    technicalMonths,
    nonTechnicalMonths,
    technicalRoles: technical.map((i) => i.label).filter(Boolean),
    nonTechnicalRoles: other.map((i) => i.label).filter(Boolean),
    skippedRoles: skipped,
    jobIsTechnical,
    declaredYears,
    claimMonths,
    basis,
  }
}

/** "13 months (1 year 1 month)" untuk prompt berbahasa Inggris. */
export function monthsLabelEn(months: number): string {
  const m = Math.max(0, Math.floor(months))
  if (m === 0) return '0 months'
  const y = Math.floor(m / 12)
  const r = m % 12
  const parts = [y > 0 ? `${y} year${y === 1 ? '' : 's'}` : '', r > 0 ? `${r} month${r === 1 ? '' : 's'}` : ''].filter(Boolean)
  return m >= 12 ? `${m} months (${parts.join(' ')})` : `${m} month${m === 1 ? '' : 's'}`
}

/** "1 tahun 1 bulan" untuk catatan ke pengguna. */
export function monthsLabelId(months: number): string {
  const m = Math.max(0, Math.floor(months))
  if (m === 0) return '0 bulan'
  const y = Math.floor(m / 12)
  const r = m % 12
  return [y > 0 ? `${y} tahun` : '', r > 0 ? `${r} bulan` : ''].filter(Boolean).join(' ')
}

/**
 * Aturan tambahan untuk prompt surat: lama pengalaman, jabatan, perusahaan, dan fakta pribadi. Bahasa Inggris karena
 * prompt model berbahasa Inggris. Dipasang di samping GROUNDING_RULES.
 */
export const EXPERIENCE_CLAIM_RULES = [
  'Never write a number of years or months of experience, anywhere in the letter, except the verified figure given under VERIFIED EXPERIENCE. If that figure is 0 or small, do not state a duration at all: describe the roles, projects and skills instead.',
  'Write a job title or a company name only if it appears under "Current title" or "Recent experience" or "VERIFIED EXPERIENCE", exactly as written there. Never shorten, translate, upgrade or rename a title (for example "Web 3 Developer" is not "Web Developer" or "Senior Web Developer"), and never move a title to another company.',
  'Never invent a certificate, a licence, a rank, or an achievement figure (percentages, counts, users, revenue). Use only what the candidate data lists.',
  'Never state personal facts that are not in the candidate data: citizenship, visa or work authorisation, relatives of officials, previous employment at the target company, how you found the job, notice period, salary expectation, or availability for an internship duration. The candidate answers those himself or herself.',
]

/** Blok fakta pengalaman untuk prompt. Selalu ada, termasuk saat angkanya 0, supaya model tidak mengisi sendiri. */
export function experiencePromptBlock(f: ExperienceFacts): string {
  const roles = (list: string[]) => (list.length ? list.join('; ') : 'none')
  const lines = [
    'VERIFIED EXPERIENCE (computed by the system from the dated roles in the candidate data; these figures are the only durations you may state):',
    `- Technical roles: ${monthsLabelEn(f.technicalMonths)} - ${roles(f.technicalRoles)}`,
    `- Non-technical roles: ${monthsLabelEn(f.nonTechnicalMonths)} - ${roles(f.nonTechnicalRoles)}`,
  ]
  if (f.basis === 'declared') {
    lines.push(
      `- No dated roles are on file. The candidate declared ${f.declaredYears} year(s) of experience in the profile; this is unverified, so state it only as "${monthsLabelEn(f.claimMonths)}" at most.`,
    )
  } else if (f.claimMonths <= 0) {
    lines.push('- The most you may claim for this job is 0 months. Do not state any duration of experience.')
  } else if (f.basis === 'technical') {
    lines.push(
      `- This job is technical, so the most you may claim is ${monthsLabelEn(f.claimMonths)}, and only as technical experience. Never add non-technical roles to it.`,
    )
  } else {
    lines.push(`- The most you may claim for this job is ${monthsLabelEn(f.claimMonths)} across all roles.`)
  }
  lines.push('- Do not write any other number of years or months of experience.')
  return lines.join('\n')
}
