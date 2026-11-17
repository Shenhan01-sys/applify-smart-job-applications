/**
 * Helpers for the form answers shown on the approval screen (approval_requests.answers).
 * The backend prepares them from FormAutofillService (backend/services/approval-answers.service.ts)
 * with a confidence 0..1, a needs_review flag and the source of each answer.
 *
 * Plain TypeScript with no imports, so it runs under `node --test` without a bundler.
 */

export type ConfidenceLevel = "high" | "medium" | "low";
export type AnswerSource = "rule" | "ai" | "default";

export interface ApprovalAnswer {
  question: string;
  answer: string;
  /** 0..1 */
  confidence: number;
  needs_review: boolean;
  source?: AnswerSource;
}

/** Same cut-offs as the backend: above 0.8 high, 0.5 to 0.8 medium, below 0.5 low. */
export const CONFIDENCE_HIGH_ABOVE = 0.8;
export const CONFIDENCE_LOW_BELOW = 0.5;

export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (!(confidence >= 0)) return "low";
  if (confidence > CONFIDENCE_HIGH_ABOVE) return "high";
  if (confidence < CONFIDENCE_LOW_BELOW) return "low";
  return "medium";
}

export const LEVEL_LABEL: Record<ConfidenceLevel, string> = {
  high: "Tinggi",
  medium: "Sedang",
  low: "Rendah",
};

export const SOURCE_LABEL: Record<AnswerSource, string> = {
  rule: "Dari Pengaturan Otomasi",
  ai: "Ditulis AI",
  default: "Belum ada data",
};

/** An answer the user should look at before approving. */
export function needsAttention(a: ApprovalAnswer): boolean {
  return a.needs_review || confidenceLevel(a.confidence) !== "high" || a.answer.trim() === "";
}

export function countNeedingAttention(list: ApprovalAnswer[]): number {
  return list.filter(needsAttention).length;
}

/**
 * Accept whatever the API returned for `answers` (jsonb: array, JSON string, null, rows from before this
 * feature without confidence) and return a clean list. Unknown shapes become an empty list.
 */
export function normalizeAnswers(raw: unknown): ApprovalAnswer[] {
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const out: ApprovalAnswer[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || typeof (item as any).question !== "string") continue;
    const c = Number((item as any).confidence);
    const src = (item as any).source;
    out.push({
      question: (item as any).question,
      answer: String((item as any).answer ?? ""),
      // Older rows have no number: unknown is treated as low, so they get checked.
      confidence: Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0,
      needs_review: (item as any).needs_review !== false,
      source: src === "rule" || src === "ai" || src === "default" ? src : undefined,
    });
  }
  return out;
}
