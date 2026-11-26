import { useEffect, useRef, useState } from "react";
import { ChevronDown, ExternalLink, Image as ImageIcon, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  SCREENSHOT_LOAD_FAILED_TEXT,
  fieldValueText,
  formatAttemptTime,
  type AgentFilledField,
  type AgentScreenshots,
} from "@/lib/agentEvidence";
import { signAgentScreenshot } from "@/services/agentScreenshotService";

type ShotKind = "filled" | "after";

const SHOT_BUTTON: Record<ShotKind, string> = {
  filled: "Lihat formulir yang diisi agen",
  after: "Lihat halaman setelah kirim",
};
const SHOT_TITLE: Record<ShotKind, string> = {
  filled: "Formulir yang diisi agen",
  after: "Halaman setelah kirim",
};
const SHOT_ALT: Record<ShotKind, string> = {
  filled: "Tangkapan layar formulir lowongan yang diisi agen",
  after: "Tangkapan layar halaman lowongan setelah agen menekan kirim",
};

interface Props {
  screenshots?: AgentScreenshots | null;
  filledFields?: AgentFilledField[];
  /** application_logs.created_at percobaan itu */
  loggedAt?: string | null;
  /** Tulisan di halaman konfirmasi yang dikenali worker; ditampilkan bila diberikan. */
  confirmationPhrase?: string | null;
  /**
   * Percobaan lama yang bukan sumber lamaran terkirim (lib/staleAttempt.ts): judulnya tidak boleh "Bukti dari agen",
   * supaya pengguna tidak mengira agen yang mengirim.
   */
  stale?: boolean;
}

/**
 * Bukti dari agen: tangkapan layar formulir yang diisi (dan halaman setelah kirim bila ada), daftar isian yang
 * diisi, dan waktu percobaan. Tangkapan layar ada di bucket privat, jadi tautannya dibuat dengan sesi pengguna
 * saat tombol ditekan (berlaku satu jam) dan gambar dibuka di jendela di halaman ini. Hanya membaca.
 */
export default function AgentEvidence({ screenshots, filledFields, loggedAt, confirmationPhrase, stale = false }: Props) {
  const fields = filledFields ?? [];
  const shots: ShotKind[] = (["filled", "after"] as const).filter((k) => !!screenshots?.[k]);
  const time = formatAttemptTime(loggedAt);
  const [busy, setBusy] = useState<ShotKind | null>(null);
  const [error, setError] = useState("");
  const [viewer, setViewer] = useState<{ kind: ShotKind; url: string } | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  if (shots.length === 0 && fields.length === 0) return null;

  const open = async (kind: ShotKind) => {
    const ref = screenshots?.[kind];
    if (!ref || busy) return;
    setBusy(kind);
    setError("");
    const res = await signAgentScreenshot(ref);
    if (!alive.current) return;
    setBusy(null);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setImageFailed(false);
    setViewer({ kind, url: res.url });
  };

  return (
    <div className="mt-3 space-y-2.5" data-testid="agent-evidence">
      <p className="text-xs font-semibold">{stale ? "Catatan percobaan lama" : "Bukti dari agen"}</p>
      {time && <p className="text-xs text-muted-foreground">Percobaan agen: {time}</p>}
      {confirmationPhrase && (
        <p className="text-xs text-muted-foreground">Tulisan di halaman konfirmasi: &quot;{confirmationPhrase}&quot;</p>
      )}

      {shots.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {shots.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => open(kind)}
              disabled={busy !== null}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border-2 border-[#16150F]/15 bg-white px-3 text-xs font-semibold hover:border-[#0A5BE0] hover:text-[#0A5BE0] transition disabled:opacity-60"
            >
              {busy === kind ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ImageIcon className="h-4 w-4" aria-hidden="true" />}
              {SHOT_BUTTON[kind]}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-lg border-2 border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      {fields.length > 0 && (
        <details className="group rounded-lg border-2 border-[#16150F]/10 bg-white">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-xs font-semibold">
            {stale ? "Isian percobaan lama" : "Isian yang diisi agen"} ({fields.length})
            <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden="true" />
          </summary>
          <ul className="divide-y divide-[#16150F]/10 border-t-2 border-[#16150F]/10">
            {fields.map((f, i) => (
              <li key={i} className="px-3 py-2 text-xs">
                <span className="block break-words font-medium">{f.label}</span>
                <span className="block break-words text-muted-foreground">{fieldValueText(f)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Dialog open={!!viewer} onOpenChange={(o) => { if (!o) setViewer(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {viewer && (
            <>
              <DialogHeader>
                <DialogTitle>{SHOT_TITLE[viewer.kind]}</DialogTitle>
                <DialogDescription>
                  {time ? `Percobaan agen: ${time}. ` : ""}Tautan gambar berlaku satu jam; buka lagi bila perlu.
                </DialogDescription>
              </DialogHeader>
              {imageFailed ? (
                <p role="alert" className="rounded-lg border-2 border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {SCREENSHOT_LOAD_FAILED_TEXT}
                </p>
              ) : (
                <img
                  src={viewer.url}
                  alt={SHOT_ALT[viewer.kind]}
                  onError={() => setImageFailed(true)}
                  className="w-full rounded-lg border-2 border-[#16150F]/10 object-contain"
                />
              )}
              <a
                href={viewer.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#0A5BE0] underline underline-offset-4"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" /> Buka di tab baru
              </a>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
