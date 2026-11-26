import type { Page, Route } from "@playwright/test";
import { API_PREFIX, SUPABASE_PREFIX, TEST_USER_EMAIL, TEST_USER_ID } from "./constants";

/**
 * Tiruan backend Fastify (/mock-api/*) dan Supabase (/mock-supabase/auth|rest/*), dipasang dengan page.route.
 * Aplikasi menjalankan kode sungguhan; hanya jaringannya yang palsu. Jalur dan bentuk badan permintaan mengikuti
 * src/services/automationApi.ts, jadi bila kontraknya berubah, tes ikut gagal.
 *
 * Permintaan yang tidak dikenal TIDAK dijawab diam-diam: dicatat di `unmocked`, dijawab 501, dan tes gagal
 * lewat assertClean().
 */

let callSeq = 0;

export interface RecordedCall {
  /** Urutan global panggilan (API dan penulisan PostgREST), untuk menguji urutan. */
  seq: number;
  method: string;
  /** jalur tanpa awalan, misalnya /api/approvals/apr-1/rerun */
  path: string;
  search: string;
  body: unknown;
  authorization: string | null;
}

type Row = Record<string, any>;

export interface BackendState {
  pending: Row[];
  history: Row[];
  /** automation_queue */
  queue: Row[];
  /** application_logs */
  logs: Row[];
  jobs: Row[];
  /** profiles (nama, CV, dokumen opsional). Kosong: profil tanpa berkas. */
  profiles: Row[];
  /** user_form_answers */
  answers: Row[];
  /** ai_applications, dengan `jobs` tertanam seperti hasil select("*, jobs(*)") */
  applications: Row[];
  /** GET /api/approvals/:id */
  approvalDetail: Record<string, Row>;
  gmail: boolean;
  /** Connected Gmail sender returned by GET /api/oauth/status; never inferred from TEST_USER_EMAIL. */
  gmailEmail?: string | null;
  /** Bidang tambahan di jawaban POST /api/approvals/:id/approve, mis. { apply_channel: "extension", extension_consent_required: true }. */
  approveExtra: Row;
  /** Pengaturan agen (GET dan PUT /api/automation/settings). */
  settings: Row;
  /** GET /api/llm-keys. Bawaan: fitur kunci sendiri mati. */
  llmKeys: Row;
  /** GET /api/notifications/status dan /preferences. */
  notificationStatus: Row;
  notificationPrefs: Row;
  /** subscriptions (baca) dan jawaban RPC get_quota_status. */
  subscriptions: Row[];
  /** Tabel profil yang dibaca dan ditulis halaman Profil. Penulisan (POST dan PATCH) mengubah isinya, seperti PostgREST. */
  workExperiences: Row[];
  education: Row[];
  certifications: Row[];
  achievements: Row[];
  userSkills: Row[];
  projects: Row[];
  /** Objek Storage yang diunggah (`bucket/path`). */
  storage: string[];
  /** Jawaban POST /api/profile/import/linkedin-pdf. null = tidak ditiru (tercatat sebagai panggilan yang tidak ditiru). */
  importPreview: Row | null;
  /** Jawaban POST /api/jobs/off-portal/parse dan /save untuk tes E2E impor off-portal. */
  offPortalParse: Row | null;
  offPortalSave: Row | null;
  /** saved_jobs */
  savedJobs: Row[];
}

export interface Override {
  status: number;
  body?: unknown;
}

const json = (status: number, body: unknown) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});

/** Nilai kolom untuk filter PostgREST, termasuk jalur JSON satu tingkat (`details->>queue_job_id`). */
function columnValue(row: Row, key: string): unknown {
  const [col, path] = key.split("->>");
  const value = row[col];
  if (path === undefined) return value;
  return value && typeof value === "object" ? value[path] : undefined;
}

const isSupportedOperator = (key: string, expr: string): boolean => {
  if (key === "or") return expr.startsWith("(") && expr.endsWith(")");
  return expr.startsWith("eq.") || (expr.startsWith("in.(") && expr.endsWith(")"));
};

function splitTopLevelCommas(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      parts.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(inner.slice(start));
  return parts;
}

function matchesOrClause(row: Row, clause: string): boolean {
  const firstDot = clause.indexOf(".");
  if (firstDot <= 0) return false;
  const col = clause.slice(0, firstDot);
  const rest = clause.slice(firstDot + 1);
  const actual = columnValue(row, col);
  if (rest === "is.null") return actual === null || actual === undefined;
  if (rest === "not.is.null") return actual !== null && actual !== undefined;
  if (rest.startsWith("gte.")) return actual !== null && actual !== undefined && String(actual) >= rest.slice(4);
  if (rest.startsWith("eq.")) return String(actual) === rest.slice(3);
  if (rest.startsWith("in.(") && rest.endsWith(")")) {
    const list = rest
      .slice(4, -1)
      .split(",")
      .map((s) => s.replace(/^"|"$/g, ""));
    return list.includes(String(actual));
  }
  throw new Error(`Operator PostgREST belum ditiru: or=${clause}`);
}

/**
 * Hanya operator yang dipakai aplikasi: eq, in, dan or. Operator lain dianggap kontrak berubah dan dilempar,
 * juga saat tabelnya kosong (diperiksa lebih dulu di selectRows, tanpa menunggu ada baris yang dicocokkan).
 */
function matchesFilter(row: Row, key: string, expr: string): boolean {
  if (key === "or" && expr.startsWith("(") && expr.endsWith(")")) {
    const clauses = splitTopLevelCommas(expr.slice(1, -1));
    return clauses.some((c) => matchesOrClause(row, c));
  }
  const actual = columnValue(row, key);
  if (expr.startsWith("eq.")) return String(actual) === expr.slice(3);
  if (expr.startsWith("in.(") && expr.endsWith(")")) {
    const list = expr
      .slice(4, -1)
      .split(",")
      .map((s) => s.replace(/^"|"$/g, ""));
    return list.includes(String(actual));
  }
  throw new Error(`Operator PostgREST belum ditiru: ${key}=${expr}`);
}

const NON_FILTER_PARAMS = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

/** Tabel yang ditulis halaman Profil (tulisan dan impor PDF). */
const PROFILE_TABLES = new Set(["profiles", "work_experiences", "education", "certifications", "achievements", "user_skills"]);

export class MockBackend {
  readonly state: BackendState;
  /** Panggilan ke backend Fastify. */
  readonly apiCalls: RecordedCall[] = [];
  /** Panggilan tulis ke PostgREST (POST, PATCH, DELETE). */
  readonly restWrites: RecordedCall[] = [];
  /** Panggilan baca ke PostgREST (GET): tabel dan filter yang dikirim aplikasi, untuk memeriksa bentuk kueri. */
  readonly restReads: RecordedCall[] = [];
  /** Semua panggilan yang tidak dikenal. Harus kosong di akhir tes. */
  readonly unmocked: string[] = [];
  private readonly overrides = new Map<string, Override>();

  constructor(initial?: Partial<BackendState>) {
    this.state = {
      pending: [],
      history: [],
      queue: [],
      logs: [],
      jobs: [],
      profiles: [],
      answers: [],
      applications: [],
      approvalDetail: {},
      gmail: false,
      gmailEmail: null,
      approveExtra: {},
      settings: {},
      llmKeys: { enabled: false, providers: [], keys: [] },
      notificationStatus: { telegram: false, notificationsEnabled: true, whatsappKapso: true, email: true },
      notificationPrefs: {
        userId: "11111111-1111-4111-8111-111111111111",
        whatsappPhone: null,
        whatsappVerified: false,
        whatsappEnabled: false,
        whatsappLastInboundAt: null,
        emailAddress: "penguji@example.test",
        emailEnabled: false,
        notifyEvents: { ready: true, submitted: true, awaiting_code: true, follow_up: true, locked_claim: true },
      },
      subscriptions: [],
      workExperiences: [],
      education: [],
      certifications: [],
      achievements: [],
      userSkills: [],
      projects: [],
      storage: [],
      importPreview: null,
      offPortalParse: null,
      offPortalSave: null,
      savedJobs: [],
      ...initial,
    };
  }

  /** Paksa jawaban untuk satu panggilan, misalnya "POST /api/approvals/apr-1/rerun" -> 409. */
  override(methodAndPath: string, response: Override): void {
    this.overrides.set(methodAndPath, response);
  }

  /**
   * Filter kueri baca PostgREST ke satu tabel, sebagai pasangan kunci-nilai (misalnya `details->>channel` -> `eq.extension`),
   * satu objek per panggilan. Kunci select, order, dan limit ikut dicatat apa adanya.
   */
  readsOf(table: string): Array<Record<string, string>> {
    return this.restReads
      .filter((c) => c.path === `/rest/v1/${table}`)
      .map((c) => Object.fromEntries(new URLSearchParams(c.search).entries()));
  }

  /** Panggilan ke jalur tertentu, sesuai urutan terjadinya. */
  callsTo(method: string, path: string): RecordedCall[] {
    return this.apiCalls.filter((c) => c.method === method && c.path === path);
  }

  async install(page: Page): Promise<void> {
    await page.route(`**${API_PREFIX}/**`, (route) => this.handleApi(route));
    await page.route(`**${SUPABASE_PREFIX}/**`, (route) => this.handleSupabase(route));
  }

  // ---------------------------------------------------------------- backend Fastify

  private async handleApi(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice(API_PREFIX.length);
    const method = request.method();
    let body: unknown = undefined;
    const raw = request.postData();
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
    }
    this.apiCalls.push({ seq: ++callSeq, method, path, search: url.search, body, authorization: request.headers()["authorization"] ?? null });

    const forced = this.overrides.get(`${method} ${path}`);
    if (forced) {
      await route.fulfill(json(forced.status, forced.body ?? {}));
      return;
    }

    const s = this.state;
    if (method === "GET" && path === "/api/approvals/pending") return route.fulfill(json(200, s.pending));
    if (method === "GET" && path === "/api/approvals/history") return route.fulfill(json(200, s.history));
    if (method === "GET" && path === "/api/oauth/status") return route.fulfill(json(200, { gmail: s.gmail, email: s.gmailEmail ?? null }));
    if (method === "GET" && path === "/api/llm-keys") return route.fulfill(json(200, s.llmKeys));
    if (method === "GET" && path === "/api/notifications/status") return route.fulfill(json(200, s.notificationStatus));
    if (method === "GET" && path === "/api/notifications/preferences") return route.fulfill(json(200, s.notificationPrefs));
    if (method === "POST" && path === "/api/extension/token") {
      return route.fulfill(json(200, { token: "ext_tok_v1.e2e-test-token-value.e2e-signature", expiresAt: new Date(Date.now() + 4 * 3600_000).toISOString(), scope: "extension:apply", ttlSeconds: 14400 }));
    }
    if (path === "/api/automation/settings") {
      if (method === "GET") return route.fulfill(json(200, s.settings));
      if (method === "PUT") {
        s.settings = { ...s.settings, ...(body as Row) };
        return route.fulfill(json(200, s.settings));
      }
    }
    // v2: halaman Persetujuan menanyakan status klaim kirim untuk banner klaim macet. Tidak ada klaim macet di fixture.
    if (method === "POST" && path === "/api/approvals/claim-statuses") return route.fulfill(json(200, { claims: {} }));

    const detail = path.match(/^\/api\/approvals\/([^/]+)$/);
    if (method === "GET" && detail) {
      const row = s.approvalDetail[decodeURIComponent(detail[1])];
      return row ? route.fulfill(json(200, row)) : route.fulfill(json(404, { error: "not_found" }));
    }

    // Izin Ekstensi Browser: mengantre tugas extension_apply untuk persetujuan itu, seperti backend sungguhan.
    const consent = path.match(/^\/api\/approvals\/([^/]+)\/extension-consent$/);
    if (method === "POST" && consent) {
      const id = decodeURIComponent(consent[1]);
      const queueJobId = `queue-ext-${id}`;
      this.state.queue.unshift({
        id: queueJobId,
        job_type: "extension_apply",
        status: "pending",
        error_message: null,
        created_at: new Date().toISOString(),
        payload: { approval_request_id: id },
      });
      return route.fulfill(json(200, { queued: true, queue_job_id: queueJobId }));
    }

    const action = path.match(/^\/api\/approvals\/([^/]+)\/(approve|reject|rerun|mark-sent)$/);
    if (method === "POST" && action) {
      const id = decodeURIComponent(action[1]);
      const kind = action[2];
      if (kind === "approve" || kind === "reject") this.settle(id, kind, body);
      if (kind === "rerun") return route.fulfill(json(200, { success: true, queue_job_id: `queue-rerun-${id}` }));
      if (kind === "mark-sent") return route.fulfill(json(200, { success: true }));
      return route.fulfill(json(200, { success: true, id, status: kind === "approve" ? "approved" : "rejected", ...(kind === "approve" ? this.state.approveExtra : {}) }));
    }

    if (method === "POST" && path === "/api/agent/security-code") return route.fulfill(json(202, { accepted: true }));

    // Impor profil dari PDF: hanya mengembalikan pratinjau, seperti backend sungguhan (tidak menulis apa pun).
    if (method === "POST" && path === "/api/profile/import/linkedin-pdf" && s.importPreview) {
      return route.fulfill(json(200, { success: true, preview: s.importPreview }));
    }

    // Impor lowongan off-portal (Gelombang 3): pratinjau & simpan privat aman-migrasi.
    if (method === "POST" && path === "/api/jobs/off-portal/parse" && s.offPortalParse) {
      return route.fulfill(json(200, s.offPortalParse));
    }
    if (method === "POST" && path === "/api/jobs/off-portal/save" && s.offPortalSave) {
      return route.fulfill(json(200, s.offPortalSave));
    }

    this.unmocked.push(`API ${method} ${path}`);
    return route.fulfill(json(501, { error: "not_mocked", path }));
  }

  /** Setujui atau tolak memindahkan baris dari daftar pending ke daftar history backend, seperti backend sungguhan. */
  private settle(id: string, kind: "approve" | "reject", body: unknown): void {
    const idx = this.state.pending.findIndex((a) => a.id === id);
    if (idx < 0) return;
    const [row] = this.state.pending.splice(idx, 1);
    const reason = kind === "reject" && body && typeof body === "object" ? (body as Row).reason : undefined;
    this.state.history.unshift({
      ...row,
      status: kind === "approve" ? "approved" : "rejected",
      reviewed_at: new Date().toISOString(),
      ...(reason ? { rejection_reason: reason } : {}),
    });
  }

  // ---------------------------------------------------------------- Supabase

  private async handleSupabase(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice(SUPABASE_PREFIX.length);
    const method = request.method();

    if (path === "/auth/v1/user" && method === "GET") {
      return route.fulfill(json(200, authUser()));
    }

    // Jawaban paksa untuk jalur Supabase tertentu, misalnya "GET /rest/v1/profiles" -> 500.
    const forced = this.overrides.get(`${method} ${path}`);
    if (forced) {
      await route.fulfill(json(forced.status, forced.body ?? {}));
      return;
    }

    // Kuota draf AI bulan ini (halaman Pengaturan): RPC, bukan tabel.
    if (path === "/rest/v1/rpc/get_quota_status" && method === "POST") {
      return route.fulfill(json(200, [{ limit_qty: 10, used: 2, remaining: 8, allowed: true }]));
    }

    // Storage: unggah dan hapus berkas CV. Isinya tidak disimpan; hanya jalurnya dicatat.
    const object = path.match(/^\/storage\/v1\/object\/([a-z_]+)\/(.+)$/);
    if (object && method === "POST") {
      const key = `${object[1]}/${decodeURIComponent(object[2])}`;
      this.state.storage.push(key);
      this.restWrites.push({ seq: ++callSeq, method, path, search: url.search, body: key, authorization: request.headers()["authorization"] ?? null });
      return route.fulfill(json(200, { Key: key, Id: `obj-${this.state.storage.length}` }));
    }
    if (/^\/storage\/v1\/object\/[a-z_]+$/.test(path) && method === "DELETE") {
      this.restWrites.push({ seq: ++callSeq, method, path, search: url.search, body: this.parseBody(request.postData()), authorization: request.headers()["authorization"] ?? null });
      return route.fulfill(json(200, []));
    }

    const table = path.match(/^\/rest\/v1\/([a-z_]+)$/)?.[1];
    if (!table) {
      this.unmocked.push(`SUPABASE ${method} ${path}`);
      return route.fulfill(json(501, { message: "not_mocked", path }));
    }

    if (method === "GET") {
      this.restReads.push({ seq: ++callSeq, method, path, search: url.search, body: undefined, authorization: request.headers()["authorization"] ?? null });
      return this.selectRows(route, table, url);
    }

    if ((method === "POST" || method === "PATCH") && PROFILE_TABLES.has(table)) return this.writeProfileTable(route, table, url);

    if (method === "POST" && table === "user_form_answers") {
      let body: unknown = undefined;
      try {
        body = JSON.parse(request.postData() ?? "null");
      } catch {
        body = request.postData();
      }
      this.restWrites.push({ seq: ++callSeq, method, path, search: url.search, body, authorization: request.headers()["authorization"] ?? null });
      // Upsert: ganti baris dengan kunci yang sama, tambah yang baru.
      for (const r of Array.isArray(body) ? (body as Row[]) : []) {
        this.state.answers = [
          { id: `ans-${r.question_key}`, ...r },
          ...this.state.answers.filter((a) => a.question_key !== r.question_key),
        ];
      }
      return route.fulfill({ status: 201, body: "" });
    }

    this.unmocked.push(`SUPABASE ${method} ${path}`);
    return route.fulfill(json(501, { message: "not_mocked", path }));
  }

  private parseBody(raw: string | null): unknown {
    if (!raw) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  /**
   * POST (insert atau upsert) dan PATCH (update) ke tabel profil. Baris disimpan di state, jadi bacaan berikutnya
   * (getFullProfile sesudah impor) melihat hasilnya. `.select().single()` menerima satu objek, `.select("id")` daftar.
   */
  private async writeProfileTable(route: Route, table: string, url: URL): Promise<void> {
    const request = route.request();
    const method = request.method();
    const body = this.parseBody(request.postData());
    this.restWrites.push({ seq: ++callSeq, method, path: `/rest/v1/${table}`, search: url.search, body, authorization: request.headers()["authorization"] ?? null });
    const rows = this.profileTableRows(table);
    const wantsObject = (request.headers()["accept"] ?? "").includes("vnd.pgrst.object+json");
    const returnsRows = (request.headers()["prefer"] ?? "").includes("return=representation");

    let touched: Row[] = [];
    if (method === "PATCH") {
      const filters = [...url.searchParams.entries()].filter(([k]) => !NON_FILTER_PARAMS.has(k));
      touched = rows.filter((r) => filters.every(([k, expr]) => matchesFilter(r, k, expr)));
      for (const r of touched) Object.assign(r, body as Row);
    } else {
      for (const item of Array.isArray(body) ? (body as Row[]) : [body as Row]) {
        const existing = table === "profiles" ? rows.find((r) => r.id === item.id) : undefined;
        if (existing) {
          Object.assign(existing, item);
          touched.push(existing);
        } else {
          const row = { id: `${table}-${rows.length + 1}`, ...item };
          rows.unshift(row);
          touched.push(row);
        }
      }
    }
    if (!returnsRows) return route.fulfill({ status: method === "POST" ? 201 : 204, body: "" });
    const status = method === "POST" ? 201 : 200;
    return route.fulfill(json(status, wantsObject ? (touched[0] ?? null) : touched));
  }

  private profileTableRows(table: string): Row[] {
    const s = this.state;
    const map: Record<string, Row[]> = {
      profiles: s.profiles,
      work_experiences: s.workExperiences,
      education: s.education,
      certifications: s.certifications,
      achievements: s.achievements,
      user_skills: s.userSkills,
    };
    return map[table];
  }

  private async selectRows(route: Route, table: string, url: URL): Promise<void> {
    const s = this.state;
    const sources: Record<string, Row[] | undefined> = {
      automation_queue: s.queue,
      application_logs: s.logs,
      jobs: s.jobs,
      saved_jobs: s.savedJobs,
      profiles: s.profiles,
      user_form_answers: s.answers,
      ai_applications: s.applications,
      // Dibaca halaman Lamaran untuk menyaring skill yang disorot, dan halaman Profil (getFullProfile).
      user_skills: s.userSkills,
      work_experiences: s.workExperiences,
      education: s.education,
      certifications: s.certifications,
      achievements: s.achievements,
      projects: s.projects,
      events_activities: [],
      subscriptions: s.subscriptions,
    };
    const rows = sources[table];
    if (!rows) {
      this.unmocked.push(`SUPABASE GET ${table}`);
      return route.fulfill(json(501, { message: "not_mocked", table }));
    }

    let out: Row[];
    try {
      for (const [key, expr] of url.searchParams.entries()) {
        if (!NON_FILTER_PARAMS.has(key) && !isSupportedOperator(key, expr)) throw new Error(`Operator PostgREST belum ditiru: ${key}=${expr}`);
      }
      out = rows.filter((row) => {
        for (const [key, expr] of url.searchParams.entries()) {
          if (NON_FILTER_PARAMS.has(key)) continue;
          // Sesi uji hanya punya satu pengguna: baris tanpa user_id dianggap milik pengguna itu.
          if (key === "user_id" && row.user_id === undefined) continue;
          if (!matchesFilter(row, key, expr)) return false;
        }
        return true;
      });
    } catch (err) {
      this.unmocked.push(`SUPABASE GET ${table}: ${(err as Error).message}`);
      return route.fulfill(json(501, { message: (err as Error).message }));
    }

    const order = url.searchParams.get("order");
    const orderMatch = order?.match(/^([a-z_]+)\.(asc|desc)/);
    if (orderMatch) {
      const [, col, dir] = orderMatch;
      out = [...out].sort((a, b) => String(a[col] ?? "").localeCompare(String(b[col] ?? "")) * (dir === "desc" ? -1 : 1));
    }
    const limit = Number(url.searchParams.get("limit"));
    if (Number.isFinite(limit) && limit > 0) out = out.slice(0, limit);

    const wantsObject = (route.request().headers()["accept"] ?? "").includes("vnd.pgrst.object+json");
    return route.fulfill(json(200, wantsObject ? (out[0] ?? null) : out));
  }
}

/** Isi GET /auth/v1/user: pengguna uji. */
export function authUser() {
  return {
    id: TEST_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: TEST_USER_EMAIL,
    email_confirmed_at: "2026-01-01T00:00:00Z",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}
