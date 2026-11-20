import { useRef, useState } from "react";
import { FileUp, Loader2, AlertCircle, Info } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { describeError } from "@/lib/authErrors";
import { automationApi } from "@/services/automationApi";
import { commitLinkedInImport } from "@/services/linkedinImportService";
import {
  LINKEDIN_PDF_HINT,
  LINKEDIN_PDF_PRIVACY,
  addedTotal,
  buildImportPlan,
  countSelected,
  defaultSelection,
  describeLinkedInImportError,
  hasPdfMagic,
  selectionFromPlan,
  selectionSize,
  setSectionSelection,
  summarizeCommit,
  toggleItem,
  validateLinkedInPdfFile,
  type CommitResult,
  type ExistingProfile,
  type ImportItem,
  type ImportPlan,
  type ImportPreview,
  type SectionKey,
} from "@/lib/linkedinImport";

interface Props {
  userId: string;
  /** Isi profil saat ini, untuk mendeteksi duplikat. */
  existing: ExistingProfile;
  /** Terisi bila impor sebaiknya tidak dipakai dulu (mis. profil belum termuat penuh, duplikat tidak bisa dicek). */
  disabledReason?: string;
  /** Dipanggil sesudah ada yang tersimpan, untuk menyegarkan data di halaman. Boleh melempar galat. */
  onImported: (result: CommitResult) => Promise<void> | void;
}

type Phase = "idle" | "reading" | "review" | "saving";

const SECTIONS: Array<{ key: SectionKey; title: string }> = [
  { key: "basic", title: "Profil dasar" },
  { key: "experiences", title: "Pengalaman kerja" },
  { key: "education", title: "Pendidikan" },
  { key: "certifications", title: "Sertifikasi" },
  { key: "achievements", title: "Penghargaan dan publikasi" },
  { key: "skills", title: "Skill dan bahasa" },
];

const btnBase = "min-h-11 px-4 rounded-lg border-2 text-sm font-medium inline-flex items-center justify-center gap-2 transition disabled:opacity-60 disabled:cursor-not-allowed";

// Kartu ini hidup di luar stepper, jadi tampil di semua langkah. PDF dikirim ke server hanya untuk dibaca; tidak
// ada yang ditulis sebelum pengguna mencentang item di dialog pratinjau dan menekan "Tambahkan ke profil".
export default function LinkedInImportCard({ userId, existing, disabledReason, onImported }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const heading = useRef<HTMLHeadingElement>(null);

  const reading = phase === "reading";
  const blocked = !!disabledReason;
  const focusHeading = () => window.setTimeout(() => heading.current?.focus(), 0);

  // Pratinjau dibiarkan sampai impor berikutnya supaya isi dialog tidak mendadak kosong saat animasi tutup.
  const close = () => {
    setPhase("idle");
    focusHeading();
  };

  const fail = (message: string) => {
    setError(message);
    toast.error(message);
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setPreview(null);
    setPlan(null);
    setSelected(new Set());

    const check = validateLinkedInPdfFile(file);
    if (!check.ok) return fail(check.reason);

    setPhase("reading");
    try {
      // Penanda %PDF diperiksa di browser supaya berkas yang salah ditolak tanpa menunggu server.
      if (!hasPdfMagic(await file.slice(0, 5).text())) {
        setPhase("idle");
        return fail("Berkas ini bukan PDF yang sah. Pakai PDF dari LinkedIn (Lainnya, Simpan ke PDF).");
      }
      const result = await automationApi.importLinkedInPdf(file);
      const nextPlan = buildImportPlan(result, existing);
      setPreview(result);
      setPlan(nextPlan);
      setSelected(defaultSelection(nextPlan));
      setPhase("review");
    } catch (err) {
      setPhase("idle");
      fail(describeLinkedInImportError(err));
    }
  };

  const onConfirm = async () => {
    if (!plan) return;
    const selection = selectionFromPlan(plan, selected);
    if (selectionSize(selection) === 0) return;
    setPhase("saving");
    let result: CommitResult;
    try {
      result = await commitLinkedInImport(userId, selection);
    } catch (err) {
      toast.error(describeError(err, "Data belum tersimpan. Coba lagi."));
      setPhase("review");
      return;
    }
    const summary = summarizeCommit(result);
    if (summary.kind === "failed") {
      // Tidak ada yang tersimpan: dialog tetap terbuka supaya pilihan tidak hilang dan bisa dicoba lagi.
      toast.error(summary.message);
      setPhase("review");
      return;
    }
    if (summary.kind === "partial") toast.warning(summary.message);
    else toast.success(summary.message);
    if (addedTotal(result) > 0) {
      try {
        await onImported(result);
      } catch {
        toast.warning("Data sudah tersimpan, tetapi tampilan belum diperbarui. Muat ulang halaman untuk melihatnya.");
      }
    }
    close();
  };

  const saving = phase === "saving";
  const total = plan ? selectionSize(selectionFromPlan(plan, selected)) : 0;
  const spinner = <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;

  return (
    <section aria-labelledby="li-import-heading" className="glass mb-6 rounded-2xl p-5 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h2 id="li-import-heading" ref={heading} tabIndex={-1} className="font-semibold flex items-center gap-2 focus:outline-none">
            <FileUp className="h-4 w-4 text-[#0A5BE0]" aria-hidden="true" /> Impor dari PDF LinkedIn
          </h2>
          <p id="li-import-hint" className="mt-1 text-sm text-muted-foreground">{LINKEDIN_PDF_HINT}</p>
          <p className="mt-1 text-xs text-muted-foreground">{LINKEDIN_PDF_PRIVACY}</p>
        </div>

        <div className="shrink-0" aria-busy={reading}>
          <input
            id="li-import-file"
            type="file"
            accept="application/pdf,.pdf"
            onChange={onPick}
            disabled={reading || blocked || phase !== "idle"}
            aria-describedby={error ? "li-import-hint li-import-error" : "li-import-hint"}
            className="peer sr-only"
          />
          <label
            htmlFor="li-import-file"
            className={`${btnBase} w-full md:w-auto border-[#0A5BE0]/30 bg-[#0A5BE0]/5 text-[#0A5BE0] hover:bg-[#0A5BE0]/10 peer-focus-visible:ring-2 peer-focus-visible:ring-[#0A5BE0] ${
              reading || blocked || phase !== "idle" ? "opacity-60 pointer-events-none" : "cursor-pointer"
            }`}
          >
            {reading ? spinner : <FileUp className="h-4 w-4" aria-hidden="true" />}
            {reading ? "Membaca PDF..." : "Pilih PDF LinkedIn"}
          </label>
        </div>
      </div>

      {reading && (
        <p className="mt-3 text-xs text-muted-foreground" role="status">
          PDF sedang dibaca. Ini bisa sampai satu menit; jangan tutup halaman ini.
        </p>
      )}
      {blocked && (
        <p className="mt-3 flex items-start gap-2 text-xs text-amber-800" role="status">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {disabledReason}
        </p>
      )}
      {error && (
        <p id="li-import-error" className="mt-3 flex items-start gap-2 text-xs text-red-600" role="alert">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {error}
        </p>
      )}

      <Dialog open={phase === "review" || phase === "saving"} onOpenChange={(open) => { if (!open && !saving) close(); }}>
        <DialogContent
          className="max-w-2xl max-h-[90vh] flex flex-col gap-4 rounded-2xl border-2 border-[#16150F]/15 bg-white p-0"
          onInteractOutside={(e) => { if (saving) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (saving) e.preventDefault(); }}
        >
          <DialogHeader className="px-6 pt-6 pr-12">
            <DialogTitle className="font-display text-xl text-[#16150F]">Periksa data dari PDF</DialogTitle>
            <DialogDescription className="text-sm text-[#16150F]/70">
              Centang yang mau ditambahkan. Belum ada yang tersimpan sampai kamu menekan Tambahkan ke profil.
            </DialogDescription>
          </DialogHeader>

          {/* Div biasa, bukan ScrollArea Radix: lihat catatan di ApprovalReviewModal soal tinggi viewport. */}
          <div className="flex-1 min-h-0 overflow-y-auto px-6" data-testid="linkedin-import-scroll">
            {preview && preview.warnings.length > 0 && (
              <ul className="mb-4 space-y-1 rounded-xl border-2 border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="status">
                {preview.warnings.map((w) => (
                  <li key={w} className="flex items-start gap-2">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {w}
                  </li>
                ))}
              </ul>
            )}
            {plan &&
              SECTIONS.map(({ key, title }) => (
                <ReviewSection
                  key={key}
                  title={title}
                  items={plan[key] as Array<ImportItem<unknown>>}
                  selected={selected}
                  disabled={saving}
                  note={
                    key === "skills"
                      ? "Tingkat skill diisi otomatis karena PDF LinkedIn tidak memuatnya. Ubah nanti di langkah Pendidikan dan skills."
                      : key === "achievements"
                        ? "Datanya tersimpan di akunmu, tetapi halaman Profil belum punya daftar untuk melihat atau mengubahnya."
                        : undefined
                  }
                  onToggle={(itemKey) => setSelected((prev) => toggleItem(plan, itemKey, prev))}
                  onAll={(on) => setSelected((prev) => setSectionSelection(plan, key, prev, on))}
                />
              ))}
            {plan && countSelected(plan, defaultSelection(plan)) === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Tidak ada data baru di PDF ini. Semuanya sudah ada di profilmu atau tidak bisa ditambahkan.</p>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-black/[6%] px-6 pb-6 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground" role="status">{total} item dipilih</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button type="button" onClick={close} disabled={saving} className={`${btnBase} border-black/[8%] bg-black/[4%] hover:bg-black/[7%]`}>
                Batal
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={saving || total === 0}
                className="min-h-11 px-5 rounded-xl bg-[#0A5BE0] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-[#0A5BE0]/90 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving && spinner}
                {saving ? "Menambahkan..." : "Tambahkan ke profil"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ReviewSection({
  title,
  items,
  selected,
  disabled,
  note,
  onToggle,
  onAll,
}: {
  title: string;
  items: Array<ImportItem<unknown>>;
  selected: ReadonlySet<string>;
  disabled: boolean;
  note?: string;
  onToggle: (key: string) => void;
  onAll: (on: boolean) => void;
}) {
  if (items.length === 0) return null;
  const selectable = items.filter((i) => i.status === "new");
  const allOn = selectable.length > 0 && selectable.every((i) => selected.has(i.key));
  const headingId = `li-import-sec-${title.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <section aria-labelledby={headingId} className="mb-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 id={headingId} className="text-sm font-semibold">
          {title} <span className="font-normal text-muted-foreground">({items.length})</span>
        </h3>
        {selectable.length > 1 && (
          <button
            type="button"
            onClick={() => onAll(!allOn)}
            disabled={disabled}
            className="min-h-11 rounded-lg px-3 text-xs font-medium text-[#0A5BE0] hover:bg-[#0A5BE0]/10 disabled:opacity-60"
          >
            {allOn ? "Kosongkan" : "Pilih semua"}
          </button>
        )}
      </div>
      {note && selectable.length > 0 && <p className="mb-2 text-xs text-muted-foreground">{note}</p>}
      <ul className="space-y-2">
        {items.map((item) => {
          const selectableItem = item.status === "new";
          return (
            <li key={item.key}>
              <label
                className={`flex min-h-11 items-start gap-3 rounded-xl border-2 p-3 transition ${
                  selectableItem ? "cursor-pointer border-black/[8%] bg-black/[4%] hover:bg-black/[7%]" : "border-black/[6%] bg-black/[2%] opacity-80"
                }`}
              >
                <Checkbox
                  checked={selectableItem && selected.has(item.key)}
                  disabled={!selectableItem || disabled}
                  onCheckedChange={() => onToggle(item.key)}
                  className="mt-0.5"
                />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium break-words">{item.title}</span>
                    {item.status === "duplicate" && <span className="rounded-full bg-black/[6%] px-2 py-0.5 text-xs font-medium text-muted-foreground">Sudah ada</span>}
                    {item.status === "invalid" && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Tidak bisa ditambahkan</span>}
                  </span>
                  <span className="block break-words text-xs text-muted-foreground">{item.detail}</span>
                  {item.status === "invalid" && <span className="block text-xs text-red-700">{item.reason}</span>}
                  {selectableItem && item.notes.map((n) => (
                    <span key={n} className="block text-xs text-amber-800">{n}</span>
                  ))}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
