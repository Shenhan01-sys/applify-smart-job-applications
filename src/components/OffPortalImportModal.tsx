import { useRef, useState } from "react";
import {
  AlertTriangle,
  BookmarkPlus,
  CheckCircle2,
  ExternalLink,
  FileImage,
  Info,
  Link2,
  Loader2,
  Mail,
  MessageCircle,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { automationApi } from "@/services/automationApi";
import { describeApiError } from "@/lib/apiErrors";
import { safeExternalHref } from "@/lib/jobCardData";
import {
  describeOffPortalChannel,
  savedRowToJobData,
  validatePosterUpload,
  type OffPortalParseResponse,
  type SaveOffPortalResponse,
} from "@/lib/offPortal";
import type { JobData } from "@/components/JobCard";

interface OffPortalImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dipanggil setelah lowongan pribadi berhasil disimpan agar daftar halaman Lowongan ikut dimuat ulang. */
  onSaved: () => void;
  /** Buka AIApplyModal langsung untuk satu lowongan pribadi yang baru disimpan. */
  onApplySavedJob: (job: JobData) => void;
}

async function fileToBase64DataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Berkas gambar belum bisa dibaca."));
    reader.readAsDataURL(file);
  });
}

/** Bantu baca kode QR di browser bila BarcodeDetector tersedia (best-effort; server tetap memvalidasi semua URL). */
async function detectBrowserQrUrls(file: File): Promise<string[]> {
  try {
    const Detector = (globalThis as { BarcodeDetector?: new (opts?: { formats?: string[] }) => { detect: (src: unknown) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;
    if (!Detector || typeof createImageBitmap !== "function") return [];
    const bitmap = await createImageBitmap(file);
    try {
      const detector = new Detector({ formats: ["qr_code"] });
      const codes = await detector.detect(bitmap);
      return codes
        .map((c) => (typeof c.rawValue === "string" ? c.rawValue.trim() : ""))
        .filter((v) => /^https?:\/\//i.test(v));
    } finally {
      bitmap.close?.();
    }
  } catch {
    return [];
  }
}

export function OffPortalImportModal({ open, onOpenChange, onSaved, onApplySavedJob }: OffPortalImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [rawText, setRawText] = useState("");
  const [posterName, setPosterName] = useState("");
  const [posterBase64, setPosterBase64] = useState("");
  const [clientQrUrls, setClientQrUrls] = useState<string[]>([]);
  const [fileError, setFileError] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [preview, setPreview] = useState<OffPortalParseResponse | null>(null);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveResult, setSaveResult] = useState<SaveOffPortalResponse | null>(null);

  const resetPreview = () => {
    setPreview(null);
    setSelectedIndexes(new Set());
    setSaveResult(null);
    setSaveError("");
    setParseError("");
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError("");
    resetPreview();
    const file = e.target.files?.[0];
    if (!file) {
      setPosterName("");
      setPosterBase64("");
      setClientQrUrls([]);
      return;
    }
    try {
      const headBuf = await file.slice(0, 12).arrayBuffer();
      const check = validatePosterUpload({ size: file.size, headBytes: new Uint8Array(headBuf) });
      if (!check.ok) {
        setFileError(check.error);
        setPosterName("");
        setPosterBase64("");
        setClientQrUrls([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      const [dataUrl, qrUrls] = await Promise.all([fileToBase64DataUrl(file), detectBrowserQrUrls(file)]);
      setPosterName(file.name);
      setPosterBase64(dataUrl);
      setClientQrUrls(qrUrls);
    } catch {
      setFileError("Berkas gambar belum bisa dibaca. Coba pilih ulang gambar poster.");
      setPosterName("");
      setPosterBase64("");
      setClientQrUrls([]);
    }
  };

  const clearPoster = () => {
    setPosterName("");
    setPosterBase64("");
    setClientQrUrls([]);
    setFileError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    resetPreview();
  };

  const handleAnalyze = async () => {
    if (!rawText.trim() && !sourceUrl.trim() && !posterBase64) {
      setParseError("Tempel caption, isi tautan lowongan, atau unggah gambar poster terlebih dahulu.");
      return;
    }
    setParsing(true);
    setParseError("");
    setSaveError("");
    setSaveResult(null);
    try {
      const res = await automationApi.parseOffPortal({
        rawText: rawText.trim() || undefined,
        sourceUrl: sourceUrl.trim() || undefined,
        imageBase64: posterBase64 || undefined,
        qrUrls: clientQrUrls.length > 0 ? clientQrUrls : undefined,
        sourceType: posterBase64 ? "off_portal_poster" : rawText.trim() ? "off_portal_caption" : "off_portal_link",
      });
      setPreview(res);
      setSelectedIndexes(new Set(res.jobs.map((_, idx) => idx)));
    } catch (err) {
      setParseError(describeApiError(err, "Lowongan belum bisa dibaca saat ini. Periksa isi masukan lalu coba lagi."));
    } finally {
      setParsing(false);
    }
  };

  const toggleIndex = (idx: number) => {
    setSelectedIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleSavePrivate = async () => {
    if (!preview) return;
    const chosen = preview.jobs.filter((_, idx) => selectedIndexes.has(idx));
    if (chosen.length === 0) {
      setSaveError("Pilih minimal satu kandidat lowongan untuk disimpan.");
      return;
    }
    setSaving(true);
    setSaveError("");
    setSaveResult(null);
    try {
      const res = await automationApi.saveOffPortalJobs(chosen);
      setSaveResult(res);
      if (res.saved) {
        onSaved();
      }
    } catch (err) {
      setSaveError(describeApiError(err, "Lowongan pribadi belum bisa disimpan saat ini. Coba lagi nanti."));
    } finally {
      setSaving(false);
    }
  };

  const pillClass = (tone: "ats" | "email" | "extension" | "manual") =>
    tone === "ats"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : tone === "email"
        ? "bg-blue-50 text-blue-800 border-blue-200"
        : tone === "extension"
          ? "bg-[#EEF4FF] text-[#0A5BE0] border-[#0A5BE0]/20"
          : "bg-amber-50 text-amber-900 border-amber-200";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-[#E0E0E0] shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <BookmarkPlus className="h-5 w-5 text-[#0A5BE0]" aria-hidden="true" />
            Impor Lowongan dari Poster, Caption, atau Link
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Tempel caption media sosial, tautan lowongan, atau unggah poster/tangkapan layar (termasuk kode QR). Applify memeriksa kanal lamaran dan indikasi risiko sebelum kamu menyimpannya sebagai lowongan pribadi.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-5">
          {/* Masukan tautan, caption, dan unggah poster */}
          <div className="space-y-4">
            <div>
              <label htmlFor="offportal-url" className="block text-sm font-medium mb-1.5">
                Tautan lowongan (opsional)
              </label>
              <div className="relative">
                <Link2 className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <input
                  id="offportal-url"
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => {
                    setSourceUrl(e.target.value);
                    resetPreview();
                  }}
                  placeholder="https://forms.gle/... atau tautan situs karier / WhatsApp"
                  className="w-full rounded-xl border-2 border-[#999999] pl-10 pr-4 h-11 text-base md:text-sm focus:outline-none focus:border-[#0A5BE0] bg-white"
                />
              </div>
            </div>

            <div>
              <label htmlFor="offportal-caption" className="block text-sm font-medium mb-1.5">
                Teks caption atau deskripsi lowongan (opsional)
              </label>
              <textarea
                id="offportal-caption"
                rows={4}
                value={rawText}
                onChange={(e) => {
                  setRawText(e.target.value);
                  resetPreview();
                }}
                placeholder="Tempel caption Instagram, X, LinkedIn, grup WhatsApp, atau teks lowongan (boleh beberapa posisi sekaligus)..."
                className="w-full rounded-xl border-2 border-[#999999] p-3 text-base md:text-sm focus:outline-none focus:border-[#0A5BE0] bg-white"
              />
            </div>

            <div>
              <label htmlFor="offportal-image" className="block text-sm font-medium mb-1.5">
                Unggah gambar poster atau tangkapan layar (PNG, JPG, WebP, maks 5 MB)
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={fileInputRef}
                  id="offportal-image"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileChange}
                  className="block text-sm text-muted-foreground file:mr-3 file:min-h-11 file:rounded-xl file:border-2 file:border-[#0A5BE0] file:bg-[#0A5BE0]/5 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#0A5BE0] hover:file:bg-[#0A5BE0]/10"
                />
                {posterName && (
                  <button
                    type="button"
                    onClick={clearPoster}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#CCCCCC] px-3 text-xs font-medium text-muted-foreground hover:text-red-700 hover:border-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Hapus gambar
                  </button>
                )}
              </div>
              {posterName && (
                <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-[#0A5BE0]">
                  <FileImage className="h-3.5 w-3.5" aria-hidden="true" />
                  Siap dibaca: {posterName}
                  {clientQrUrls.length > 0 && ` (${clientQrUrls.length} tautan QR terdeteksi di browser)`}
                </p>
              )}
              {fileError && (
                <p role="alert" className="mt-1.5 text-xs text-red-700">
                  {fileError}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={parsing || (!rawText.trim() && !sourceUrl.trim() && !posterBase64)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0A5BE0] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition disabled:opacity-50"
              >
                {parsing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
                {parsing ? "Membaca teks dan kode QR..." : "Analisis & Pratinjau"}
              </button>
              <span className="text-xs text-muted-foreground">
                Hanya membuat pratinjau dulu, belum menyimpan ke database.
              </span>
            </div>

            {parseError && (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {parseError}
              </div>
            )}
          </div>

          {/* Hasil pratinjau */}
          {preview && (
            <div className="space-y-4 border-t border-[#E0E0E0] pt-4" data-testid="offportal-preview">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold">
                  Pratinjau Kandidat Lowongan ({preview.jobs.length})
                </h3>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {preview.ocr?.ran && (
                    <span className="rounded-full bg-[#F5F5F5] px-2.5 py-1">
                      OCR: {preview.ocr.status === "ok" ? `${preview.ocr.textLength} karakter` : preview.ocr.status}
                    </span>
                  )}
                  {Array.isArray(preview.qr?.decodedUrls) && preview.qr.decodedUrls.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 font-medium">
                      <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
                      {preview.qr.decodedUrls.length} URL QR terbaca
                    </span>
                  )}
                </div>
              </div>

              {preview.warnings && preview.warnings.length > 0 && (
                <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
                  {preview.warnings.map((w, i) => (
                    <p key={i} className="flex items-start gap-2">
                      <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{w}</span>
                    </p>
                  ))}
                </div>
              )}

              {Array.isArray(preview.rejectedUrls) && preview.rejectedUrls.length > 0 && (
                <p className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
                  {preview.rejectedUrls.length} tautan tidak aman atau bukan alamat publik ditolak otomatis.
                </p>
              )}

              {preview.jobs.length === 0 ? (
                <p className="rounded-xl border border-[#E0E0E0] bg-[#FAFAFA] p-4 text-sm text-muted-foreground">
                  Belum ada kandidat lowongan yang bisa diekstrak. Tempel teks caption atau tautan lowongan secara manual lalu coba lagi.
                </p>
              ) : (
                <ul className="space-y-3">
                  {preview.jobs.map((job, idx) => {
                    const ch = describeOffPortalChannel(job);
                    const safeUrl = safeExternalHref(job.applyUrl);
                    const safeWa = safeExternalHref(job.whatsappUrl);
                    const highFlags = job.safety.flags.filter((f) => f.severity === "high");
                    const cautionFlags = job.safety.flags.filter((f) => f.severity === "caution");
                    const checked = selectedIndexes.has(idx);

                    return (
                      <li key={`${job.publicationFingerprint}-${idx}`} className="rounded-xl border-2 border-[#E0E0E0] p-4 space-y-2.5 bg-white">
                        <div className="flex items-start gap-3">
                          <input
                            id={`offportal-pick-${idx}`}
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleIndex(idx)}
                            className="mt-1 h-4 w-4 accent-[#0A5BE0]"
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <label htmlFor={`offportal-pick-${idx}`} className="block font-bold text-sm cursor-pointer">
                              {job.title}
                            </label>
                            <p className="text-xs text-muted-foreground">
                              {job.company} · {job.location}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              <span className={`text-xs font-medium border px-2.5 py-0.5 rounded-full ${pillClass(ch.tone)}`} title={ch.detail}>
                                {ch.label}
                              </span>
                              {job.safety.riskLevel === "high" ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium border border-red-200 bg-red-50 text-red-800 px-2.5 py-0.5 rounded-full">
                                  <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                                  Risiko tinggi ({highFlags.length})
                                </span>
                              ) : job.safety.riskLevel === "caution" ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium border border-amber-200 bg-amber-50 text-amber-900 px-2.5 py-0.5 rounded-full">
                                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                                  Perlu cek ({cautionFlags.length})
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-medium border border-emerald-200 bg-emerald-50 text-emerald-800 px-2.5 py-0.5 rounded-full">
                                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                  Tidak ada indikasi scam
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Tautan / Email / WhatsApp terdeteksi */}
                        <div className="flex flex-wrap items-center gap-3 pl-7 text-xs">
                          {safeUrl && (
                            <a
                              href={safeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex min-h-11 items-center gap-1 text-[#0A5BE0] font-medium underline underline-offset-2"
                            >
                              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                              Buka tautan lamaran
                            </a>
                          )}
                          {job.applyEmail && (
                            <span className="inline-flex items-center gap-1 text-blue-800 font-medium">
                              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                              {job.applyEmail}
                            </span>
                          )}
                          {safeWa && (
                            <a
                              href={safeWa}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex min-h-11 items-center gap-1 text-emerald-800 font-medium underline underline-offset-2"
                            >
                              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                              Buka WhatsApp
                            </a>
                          )}
                        </div>

                        {/* Rincian laporan anti-scam */}
                        {(highFlags.length > 0 || cautionFlags.length > 0) && (
                          <ul className="pl-7 space-y-1 text-xs">
                            {[...highFlags, ...cautionFlags].map((flag, fi) => (
                              <li
                                key={fi}
                                className={flag.severity === "high" ? "text-red-800" : "text-amber-900"}
                              >
                                <strong>{flag.label}:</strong> {flag.detail}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Tombol simpan privat */}
              {preview.jobs.length > 0 && !saveResult?.saved && (
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleSavePrivate}
                    disabled={saving || selectedIndexes.size === 0}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#16150F] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <BookmarkPlus className="h-4 w-4" aria-hidden="true" />}
                    {saving ? "Menyimpan..." : `Simpan ${selectedIndexes.size} Lowongan Pribadi`}
                  </button>
                </div>
              )}

              {saveError && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {saveError}
                </div>
              )}

              {/* Migrasi belum ada: tampilkan pesan tenang & jelas tanpa error */}
              {saveResult && saveResult.migrationRequired && (
                <div role="status" data-testid="offportal-migration-notice" className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 space-y-1.5">
                  <p className="font-semibold flex items-center gap-2">
                    <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Penyimpanan Lowongan Pribadi Belum Aktif di Database
                  </p>
                  <p className="text-xs leading-relaxed">{saveResult.message}</p>
                </div>
              )}

              {/* Tersimpan sukses: langsung tawarkan buat draf & persetujuan */}
              {saveResult && saveResult.saved && (
                <div role="status" data-testid="offportal-saved-panel" className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 space-y-3">
                  <p className="text-sm font-semibold text-emerald-900 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {saveResult.message}
                  </p>
                  <ul className="space-y-2">
                    {saveResult.jobs.map((saved) => (
                      <li key={saved.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white border border-emerald-200 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{saved.title}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {saved.company} · {saved.location}
                            {saved.alreadySaved ? " (sudah tersimpan)" : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            onOpenChange(false);
                            onApplySavedJob(savedRowToJobData(saved));
                          }}
                          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#0A5BE0] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition"
                        >
                          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                          Buat Draf &amp; Persetujuan
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
