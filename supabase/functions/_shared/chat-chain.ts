// Menjalankan satu permintaan chat lewat rantai model (providers.ts): coba model pertama, bila gagal atau jawabannya
// ditolak coba model berikutnya. TypeScript murni tanpa API Deno, supaya bisa dites dengan node:test (fetch dan
// logger bisa diganti).
//
// Pola yang sama dengan loop di generate-application/index.ts: satu batas waktu per panggilan, satu baris log per
// kandidat, dan jawaban hanya dianggap berhasil bila lolos fungsi `accept`. Perbedaannya, kegagalan dicatat lewat
// console.error (dengan kode alasan pendek dan nama model), sehingga muncul di log Edge Function.
//
// Yang dicatat hanya nama model, kode alasan, dan lama panggilan. Isi prompt, isi jawaban, badan galat penyedia,
// dan kunci tidak pernah dicatat.
import { chatBody, postChat, type ResolvedModel } from "./providers.ts";
import { stripReasoning } from "./output-guard.ts";
import { NumesBudget } from "./numes-keys.ts";

export interface ChainAttempt {
  model: string;
  /** "accepted" atau kode alasan: network, timeout, http_<status>, bad_json, empty, rejected. */
  outcome: string;
  ms: number;
}

export type ChainResult<T> =
  | { ok: true; value: T; model: string; attempts: ChainAttempt[] }
  | { ok: false; attempts: ChainAttempt[] };

export interface ChainLogger {
  error(line: string): void;
  log(line: string): void;
}

export interface ChainOptions<T> {
  /** Awalan baris log, misalnya "[green-career-assessment]". */
  tag: string;
  messages: { role: string; content: string }[];
  temperature: number;
  maxTokens: number;
  /** Batas waktu satu panggilan. */
  timeoutMs: number;
  /** Total waktu rantai; kandidat berikutnya tidak dicoba bila sudah lewat. Tanpa batas bila kosong. */
  budgetMs?: number;
  /** Batas waktu satu percobaan Numes (ms), terpisah dari `timeoutMs`. Bawaan 12 detik (secret NUMES_TIMEOUT_MS). */
  numesTimeoutMs?: number;
  /** Ubah teks jawaban (tanpa rantai pikir) menjadi nilai, atau null bila tidak layak dipakai. */
  accept: (text: string) => T | null;
  fetchFn?: typeof fetch;
  logger?: ChainLogger;
  now?: () => number;
}

const consoleLogger: ChainLogger = {
  error: (line) => console.error(line),
  log: (line) => console.log(line),
};

/** Kode alasan pendek untuk galat jaringan: timeout bila dibatalkan oleh batas waktu, selain itu network. */
function networkReason(e: unknown): string {
  const name = String((e as { name?: unknown } | null)?.name ?? "");
  return name === "TimeoutError" || name === "AbortError" ? "timeout" : "network";
}

export async function runChain<T>(models: ResolvedModel[], opts: ChainOptions<T>): Promise<ChainResult<T>> {
  const doFetch = opts.fetchFn ?? fetch;
  const logger = opts.logger ?? consoleLogger;
  const now = opts.now ?? Date.now;
  const attempts: ChainAttempt[] = [];
  const chainStart = now();
  // Semua entri Numes berbagi satu jatah waktu (paling banyak 40% budgetMs dan 15 detik), supaya Numes yang lambat
  // tidak menghabiskan waktu yang dicadangkan untuk Gemini dan penyedia lain.
  const numesBudget = new NumesBudget({ totalBudgetMs: opts.budgetMs });

  for (const candidate of models) {
    if (opts.budgetMs !== undefined && attempts.length > 0 && now() - chainStart >= opts.budgetMs) {
      logger.error(`${opts.tag} chain_budget_exhausted after=${attempts.length} models`);
      break;
    }
    const started = now();
    const fail = (reason: string) => {
      const ms = now() - started;
      attempts.push({ model: candidate.entry, outcome: reason, ms });
      logger.error(`${opts.tag} provider_failed reason=${reason} model=${candidate.entry} ${ms}ms`);
    };

    let resp: Response;
    try {
      // Numes memakai kolam kunci: kunci berikutnya hanya dicoba untuk 401/402/403/429 selama anggaran rantai belum habis.
      // Batas waktu Numes melepas modelnya dan mendinginkannya (numes-keys.ts), lalu rantai lanjut ke kandidat berikutnya.
      resp = await postChat(candidate, {
        fetchFn: doFetch,
        timeoutMs: () => opts.timeoutMs,
        numesTimeoutMs: opts.numesTimeoutMs,
        numesBudget,
        canRetry: () => opts.budgetMs === undefined || now() - chainStart < opts.budgetMs,
        body: JSON.stringify(
          chatBody(candidate, opts.messages, { temperature: opts.temperature, maxTokens: opts.maxTokens }),
        ),
        log: (line) => logger.error(`${opts.tag} ${line.replace(/^\[AI\] /, "")}`),
      });
    } catch (e) {
      fail(networkReason(e));
      continue;
    }
    if (!resp.ok) {
      fail(`http_${resp.status}`);
      continue;
    }
    let payload: any;
    try {
      payload = await resp.json();
    } catch {
      fail("bad_json");
      continue;
    }
    const raw: unknown = payload?.choices?.[0]?.message?.content;
    const text = stripReasoning(typeof raw === "string" ? raw : "").text;
    if (!text) {
      fail("empty");
      continue;
    }
    const value = opts.accept(text);
    if (value === null) {
      fail("rejected");
      continue;
    }
    const ms = now() - started;
    attempts.push({ model: candidate.entry, outcome: "accepted", ms });
    logger.log(`${opts.tag} model accepted ${candidate.entry} ${ms}ms`);
    return { ok: true, value, model: candidate.entry, attempts };
  }
  return { ok: false, attempts };
}
