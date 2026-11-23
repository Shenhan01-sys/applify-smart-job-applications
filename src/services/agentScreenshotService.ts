import { supabase } from "@/lib/supabase";
import {
  AGENT_SCREENSHOT_BUCKET,
  SIGNED_URL_TTL_SECONDS,
  signedUrlOutcome,
  type AgentScreenshotRef,
} from "@/lib/agentEvidence";

/**
 * Tautan bertanda tangan untuk satu tangkapan layar agen. Bucket `agent-screenshots` privat; kebijakan RLS
 * storage mengizinkan pengguna yang masuk membaca objek di folder `<user_id>/` miliknya sendiri, jadi tautan
 * dibuat di sini dengan sesi pengguna dan berlaku satu jam. Tautan yang ditulis worker di log kedaluwarsa
 * setelah 7 hari dan hanya dipakai sebagai cadangan. Hanya membaca: tidak menulis ke Storage maupun tabel.
 * Tidak melempar galat; hasilnya tautan atau pesan galat singkat.
 */
export async function signAgentScreenshot(ref: AgentScreenshotRef): Promise<{ url: string; fallback: boolean } | { error: string }> {
  try {
    const res = await supabase.storage.from(AGENT_SCREENSHOT_BUCKET).createSignedUrl(ref.path, SIGNED_URL_TTL_SECONDS);
    return signedUrlOutcome(res, ref.url);
  } catch (err) {
    console.warn("[agentEvidence] signed URL failed:", err);
    return signedUrlOutcome({ data: null, error: { message: err instanceof Error ? err.message : "" } }, ref.url);
  }
}
