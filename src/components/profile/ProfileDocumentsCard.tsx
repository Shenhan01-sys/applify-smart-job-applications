import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, FileCheck2, FolderOpen, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { describeError } from "@/lib/authErrors";
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_KINDS,
  DOCUMENT_LABEL,
  DOCUMENTS_UNAVAILABLE,
  documentFileLabel,
  type DocumentKind,
  type DocumentRef,
} from "@/lib/profileDocuments";
import {
  DocumentsUnavailableError,
  ProfileDocumentError,
  getProfileDocuments,
  openProfileDocument,
  removeProfileDocument,
  uploadProfileDocument,
  type ProfileDocuments,
} from "@/services/profileDocumentService";

type CardState = "loading" | "ready" | "unavailable" | "failed";
type SlotBusy = "" | "upload" | "view" | "remove";

const btnBase = "min-h-11 px-4 rounded-lg border-2 text-sm font-medium inline-flex items-center justify-center gap-2 transition disabled:opacity-60 disabled:cursor-not-allowed";
const actionBtn = `${btnBase} border-black/[8%] bg-black/[4%] hover:bg-black/[7%]`;
const spinner = <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;

/**
 * Kartu "Dokumen tambahan (opsional)": transkrip nilai dan berkas portofolio. Tampilannya mengikuti kartu CV
 * (ResumeCard di routes/profile.tsx). Berkas disimpan di bucket privat `resumes` dan path-nya di kolom profil
 * (services/profileDocumentService.ts). Agen hanya melampirkannya bila formulir lowongan punya kolom unggah yang cocok.
 * Bila kolomnya belum ada di database, kartu menampilkan pemberitahuan dan halaman profil tetap jalan.
 */
export default function ProfileDocumentsCard({ userId }: { userId: string }) {
  const [docs, setDocs] = useState<ProfileDocuments>({ transcript: null, portfolio: null });
  const [state, setState] = useState<CardState>("loading");
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setLoadError("");
    getProfileDocuments(userId)
      .then((found) => {
        if (cancelled) return;
        setDocs(found);
        setState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof DocumentsUnavailableError) {
          setState("unavailable");
          return;
        }
        setLoadError(err instanceof ProfileDocumentError ? err.message : describeError(err, "Dokumen tambahan belum bisa dimuat. Coba lagi."));
        setState("failed");
      });
    return () => { cancelled = true; };
  }, [userId, reloadKey]);

  const setOne = useCallback((kind: DocumentKind, value: DocumentRef | null) => setDocs((prev) => ({ ...prev, [kind]: value })), []);
  const markUnavailable = useCallback(() => setState("unavailable"), []);

  return (
    <section aria-labelledby="docs-heading" className="glass rounded-2xl p-5 md:p-6">
      <h2 id="docs-heading" className="font-semibold flex items-center gap-2">
        <FolderOpen className="h-4 w-4 text-[#0A5BE0]" aria-hidden="true" /> Dokumen tambahan (opsional)
      </h2>
      <p id="docs-hint" className="mt-1 text-xs text-muted-foreground">
        Opsional. Agen hanya melampirkannya bila formulir lowongan memintanya.
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">PDF, DOC, atau DOCX, maksimal 5 MB.</p>

      <div className="mt-4" aria-busy={state === "loading"}>
        {state === "loading" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            {spinner} Memuat dokumen...
          </p>
        )}

        {state === "unavailable" && (
          <p className="rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">
            {DOCUMENTS_UNAVAILABLE}
          </p>
        )}

        {state === "failed" && (
          <div className="space-y-3">
            <p className="text-xs text-red-600" role="alert">{loadError}</p>
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className={actionBtn}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Muat ulang
            </button>
          </div>
        )}

        {state === "ready" && (
          <div className="space-y-4">
            {DOCUMENT_KINDS.map((kind) => (
              <DocumentSlot key={kind} userId={userId} kind={kind} value={docs[kind]} onChange={(v) => setOne(kind, v)} onUnavailable={markUnavailable} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function DocumentSlot({ userId, kind, value, onChange, onUnavailable }: {
  userId: string;
  kind: DocumentKind;
  value: DocumentRef | null;
  onChange: (value: DocumentRef | null) => void;
  onUnavailable: () => void;
}) {
  const label = DOCUMENT_LABEL[kind];
  const lower = label.toLowerCase();
  const [busy, setBusy] = useState<SlotBusy>("");
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const inputId = `doc-file-${kind}`;
  const headingId = `doc-heading-${kind}`;
  const errorId = `doc-error-${kind}`;

  const fail = (err: unknown, fallback: string) => {
    if (err instanceof DocumentsUnavailableError) {
      onUnavailable();
      return;
    }
    const message = err instanceof ProfileDocumentError ? err.message : describeError(err, fallback);
    setError(message);
    toast.error(message);
  };

  // Input berkas disembunyikan saat dokumen sudah ada; fokus dipindah ke judul slot supaya tidak hilang.
  const focusHeading = () => window.setTimeout(() => heading.current?.focus(), 0);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setBusy("upload");
    try {
      onChange(await uploadProfileDocument(userId, kind, file));
      toast.success(`${label} tersimpan`);
      focusHeading();
    } catch (err) {
      fail(err, `${label} belum terunggah. Coba lagi.`);
    } finally {
      setBusy("");
    }
  };

  const onView = async () => {
    if (!value) return;
    setError("");
    setBusy("view");
    // Tab dibuka saat klik, sebelum await, supaya Safari tidak memblokirnya sebagai popup. Alamatnya diisi
    // setelah signed URL jadi; opener diputus supaya berkasnya tidak bisa mengakses tab Applify.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    try {
      const url = await openProfileDocument(kind, value.path);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
    } catch (err) {
      tab?.close();
      fail(err, `${label} belum bisa dibuka. Coba lagi.`);
    } finally {
      setBusy("");
    }
  };

  const onRemove = async () => {
    setError("");
    setBusy("remove");
    try {
      await removeProfileDocument(userId, kind);
      onChange(null);
      toast.success(`${label} dihapus`);
      focusHeading();
    } catch (err) {
      fail(err, `${label} belum terhapus. Coba lagi.`);
    } finally {
      setBusy("");
    }
  };

  const working = busy !== "";
  const describedBy = error ? `docs-hint ${errorId}` : "docs-hint";

  return (
    <div role="group" aria-labelledby={headingId} aria-busy={working} className="rounded-xl border border-black/[8%] bg-black/[2%] p-3">
      <h3 id={headingId} ref={heading} tabIndex={-1} className="text-sm font-medium focus:outline-none">{label}</h3>

      <div className="mt-2">
        <input
          ref={fileInput}
          id={inputId}
          type="file"
          accept={DOCUMENT_ACCEPT}
          onChange={onPick}
          disabled={working}
          aria-describedby={describedBy}
          aria-label={value ? `Pilih berkas ${lower} pengganti` : `Pilih berkas ${lower}`}
          className={value ? "hidden" : "peer sr-only"}
        />

        {!value && (
          <label
            htmlFor={inputId}
            className={`${btnBase} w-full sm:w-auto border-[#0A5BE0]/30 bg-[#0A5BE0]/5 text-[#0A5BE0] hover:bg-[#0A5BE0]/10 peer-focus-visible:ring-2 peer-focus-visible:ring-[#0A5BE0] ${working ? "opacity-60 pointer-events-none" : "cursor-pointer"}`}
          >
            {busy === "upload" ? spinner : <Upload className="h-4 w-4" aria-hidden="true" />}
            {busy === "upload" ? "Mengunggah..." : "Unggah"}
          </label>
        )}

        {value && (
          <div className="space-y-3">
            <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
              <FileCheck2 className="h-4 w-4 shrink-0 text-green-700" aria-hidden="true" />
              <span className="truncate" title={documentFileLabel(value.path)}>{documentFileLabel(value.path)}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={onView} disabled={working} aria-label={`Lihat ${lower}`} className={actionBtn}>
                {busy === "view" ? spinner : <Eye className="h-4 w-4" aria-hidden="true" />} Lihat
              </button>
              <button type="button" onClick={() => fileInput.current?.click()} disabled={working} aria-label={`Ganti ${lower}`} className={actionBtn}>
                {busy === "upload" ? spinner : <RefreshCw className="h-4 w-4" aria-hidden="true" />} Ganti
              </button>
              <button type="button" onClick={onRemove} disabled={working} aria-label={`Hapus ${lower}`} className={`${actionBtn} text-red-700`}>
                {busy === "remove" ? spinner : <Trash2 className="h-4 w-4" aria-hidden="true" />} Hapus
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <p id={errorId} className="mt-3 text-xs text-red-600" role="alert">{error}</p>}
    </div>
  );
}
