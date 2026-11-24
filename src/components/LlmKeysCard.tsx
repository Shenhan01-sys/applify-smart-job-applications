import { useEffect, useId, useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, Info, KeyRound, Loader2, MinusCircle, RefreshCw, Trash2 } from "lucide-react";
import {
  LLM_KEYS_DISABLED_DELETE_TEXT,
  LLM_KEYS_DISABLED_TEXT,
  LLM_KEYS_LOAD_ERROR_TEXT,
  LLM_KEYS_QUOTA_NOTE,
  LLM_KEYS_STORAGE_NOTE,
  LLM_KEYS_UNAVAILABLE_TEXT,
  LLM_KEYS_UNAVAILABLE_TITLE,
  LLM_KEY_STATUS_LABEL,
  LLM_MODEL_HINT,
  LLM_MODEL_REQUIRED_HINT,
  LLM_PROVIDER_SOON_LABEL,
  LLM_PROVIDER_SOON_TEXT,
  MODEL_MAX_LENGTH,
  byokUnavailable,
  canSaveLlmKey,
  describeLlmKeyApiError,
  describeTestResult,
  formatKeyDate,
  isByokUnavailableError,
  llmConsentText,
  llmKeyView,
  llmModelLabel,
  maskLast4,
  precheckLlmKey,
  precheckLlmModel,
  removeKey,
  upsertKey,
  visibleProviders,
  type LlmKeyRow,
  type LlmKeyView,
  type LlmKeysResponse,
  type LlmProvider,
  type LlmProviderInfo,
  type Notice,
} from "@/lib/llmKeys";
import { automationApi } from "@/services/automationApi";

const INPUT_CLASS =
  "mt-1 w-full rounded-lg bg-white border-2 border-black/[10%] px-3 font-mono text-base tracking-wider md:text-sm focus:border-[#0A5BE0]/50 focus:outline-none focus:ring-2 focus:ring-[#0A5BE0]/10 aria-[invalid=true]:border-red-400 disabled:cursor-not-allowed disabled:opacity-60";
const PRIMARY_BUTTON =
  "inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[#0A5BE0] px-4 text-sm font-semibold text-white transition hover:bg-[#0256d3] disabled:cursor-not-allowed disabled:opacity-60";
const SECONDARY_BUTTON =
  "inline-flex min-h-11 items-center gap-1.5 rounded-lg border-2 border-black/[8%] bg-black/[4%] px-3 text-sm transition hover:bg-black/[7%] disabled:cursor-not-allowed disabled:opacity-60";
const DANGER_BUTTON =
  "inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60";

const STATUS_STYLE: Record<LlmKeyView, string> = {
  valid: "border-green-300 bg-green-50 text-green-900",
  invalid: "border-red-300 bg-red-50 text-red-800",
  none: "border-black/[10%] bg-black/[4%] text-muted-foreground",
};

const NOTICE_STYLE: Record<Notice["tone"], string> = {
  ok: "border-green-300 bg-green-50 text-green-900",
  warn: "border-amber-300 bg-amber-50 text-amber-900",
  error: "border-red-100 bg-red-50 text-red-700",
};

/**
 * Kunci API LLM milik pengguna sendiri (BYOK), satu baris per penyedia dari registri di lib/llmKeys.ts.
 * Kunci hanya hidup di kolom isian: dikosongkan begitu tombol ditekan, apa pun hasilnya, dan tidak masuk
 * penyimpanan browser, alamat halaman, catatan, atau teks pemberitahuan. Server hanya menjawab dengan 4
 * karakter terakhir. Setiap penyimpanan butuh centang persetujuan baru (data CV dan profil dikirim ke
 * penyedia pilihan, tagihan ditanggung pengguna). Penyedia yang belum diperiksa tampil mati ("Segera hadir").
 * Penyedia tanpa model bawaan (requiresModel di registri) mewajibkan nama model sebelum Simpan aktif.
 */
export default function LlmKeysCard() {
  const [data, setData] = useState<LlmKeysResponse | null>(null);
  const [loadError, setLoadError] = useState("");

  const load = () => {
    setLoadError("");
    setData(null);
    automationApi
      .getLlmKeys()
      .then(setData)
      .catch((err) => {
        // Fitur tidak ada di server: keadaan "Belum tersedia", bukan galat merah. Gangguan sungguhan tetap bisa dicoba lagi.
        if (isByokUnavailableError(err)) setData({ enabled: false, providers: [], keys: [] });
        else setLoadError(LLM_KEYS_LOAD_ERROR_TEXT);
      });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  if (loadError) {
    return (
      <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 text-sm text-red-700">
        <span className="inline-flex items-center gap-1.5"><AlertCircle className="h-4 w-4" aria-hidden="true" /> {loadError}</span>
        <button type="button" onClick={load} className={SECONDARY_BUTTON}>Coba lagi</button>
      </div>
    );
  }
  if (data === null) {
    return (
      <p role="status" className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Memuat kunci...
      </p>
    );
  }

  if (byokUnavailable(data)) {
    return (
      <div role="status" data-testid="llm-keys-unavailable" className="mt-4 rounded-xl border border-black/[8%] bg-[#F7F6F2] p-3.5">
        <p className="text-xs font-semibold text-[#16150F]">{LLM_KEYS_UNAVAILABLE_TITLE}</p>
        <p className="mt-1 text-xs text-muted-foreground">{LLM_KEYS_UNAVAILABLE_TEXT}</p>
      </div>
    );
  }

  const { enabled, keys } = data;
  // Pembaruan fungsional: permintaan penyedia lain bisa selesai belakangan, daftar tidak boleh ditimpa data lama.
  const setKeys = (update: (current: LlmKeyRow[]) => LlmKeyRow[]) =>
    setData((d) => (d ? { ...d, keys: update(d.keys) } : d));

  return (
    <div className="mt-4">
      {!enabled && (
        <p role="status" className="mb-3 flex items-start gap-1.5 rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{LLM_KEYS_DISABLED_TEXT}{keys.length > 0 && LLM_KEYS_DISABLED_DELETE_TEXT}</span>
        </p>
      )}
      <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
        <p>{LLM_KEYS_STORAGE_NOTE}</p>
        <p>{LLM_KEYS_QUOTA_NOTE}</p>
      </div>
      <ul className="mt-3 space-y-2">
        {visibleProviders(data.providers).map((info) => (
          <ProviderRow
            key={info.id}
            info={info}
            row={keys.find((k) => k.provider === info.id) ?? null}
            enabled={enabled}
            onSaved={(saved) => setKeys((current) => upsertKey(current, saved))}
            onRemoved={() => setKeys((current) => removeKey(current, info.id))}
          />
        ))}
      </ul>
    </div>
  );
}

type Busy = null | "save" | "test" | "delete";

function StatusBadge({ view }: { view: LlmKeyView }) {
  const Icon = view === "valid" ? CheckCircle2 : view === "invalid" ? AlertCircle : MinusCircle;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[view]}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {LLM_KEY_STATUS_LABEL[view]}
    </span>
  );
}

function SoonBadge() {
  return (
    <span className="rounded-full bg-black/[8%] px-2.5 py-1 text-xs font-medium">{LLM_PROVIDER_SOON_LABEL}</span>
  );
}

function ProviderRow({
  info,
  row,
  enabled,
  onSaved,
  onRemoved,
}: {
  info: LlmProviderInfo;
  row: LlmKeyRow | null;
  enabled: boolean;
  onSaved: (row: LlmKeyRow) => void;
  onRemoved: () => void;
}) {
  const uid = useId();
  const inputId = `${uid}-key`;
  const hintId = `${uid}-hint`;
  const modelId = `${uid}-model`;
  const modelHintId = `${uid}-model-hint`;
  const [value, setValue] = useState("");
  const [model, setModel] = useState(row?.model ?? "");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirming, setConfirming] = useState(false);
  const provider: LlmProvider = info.id;
  // Kunci baru hanya bisa disimpan bila fitur aktif dan penyedianya sudah diperiksa (verified di registri).
  const usable = enabled && info.verified;
  const view = llmKeyView(row);
  const validatedOn = row ? formatKeyDate(row.lastValidatedAt) : "";
  const working = busy !== null;
  const showForm = info.verified || row !== null;
  const requiresModel = info.requiresModel === true;
  // Gerbang tombol Simpan: penyedia aktif, persetujuan dicentang, kunci terisi, dan model sah bila wajib.
  const canSave = canSaveLlmKey({ usable, consent, key: value, requiresModel, model });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (working || !canSave) return;
    // Kolom kunci dan centang dikosongkan sekarang juga, sebelum ada permintaan dan apa pun hasilnya. Kunci
    // hanya dipegang variabel lokal ini sampai permintaan selesai. Persetujuan berlaku untuk satu penyimpanan.
    const typed = value;
    setValue("");
    setConsent(false);
    setNotice(null);
    setConfirming(false);
    const check = precheckLlmKey(provider, typed);
    if (!check.ok) {
      setNotice({ tone: "error", text: check.message });
      return;
    }
    const modelCheck = precheckLlmModel(model, { required: requiresModel });
    if (!modelCheck.ok) {
      setNotice({ tone: "error", text: modelCheck.message });
      return;
    }
    setBusy("save");
    try {
      const saved = await automationApi.saveLlmKey(provider, check.key, { consent: true, model: modelCheck.model });
      onSaved(saved);
      setModel(saved.model ?? "");
      setNotice({ tone: "ok", text: "Kunci tersimpan dan valid." });
    } catch (err) {
      setNotice({ tone: "error", text: describeLlmKeyApiError(err) });
    } finally {
      setBusy(null);
    }
  }

  async function retest() {
    if (working || !usable) return;
    setBusy("test");
    setNotice(null);
    setConfirming(false);
    try {
      const res = await automationApi.testLlmKey(provider);
      if (res.key) onSaved(res.key);
      setNotice(describeTestResult(res.result));
    } catch (err) {
      setNotice({ tone: "error", text: describeLlmKeyApiError(err) });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (working) return;
    setBusy("delete");
    setNotice(null);
    try {
      await automationApi.deleteLlmKey(provider);
      onRemoved();
      setModel("");
      setConfirming(false);
      setNotice({ tone: "ok", text: "Kunci dihapus." });
    } catch (err) {
      setNotice({ tone: "error", text: describeLlmKeyApiError(err) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className={`rounded-xl border-2 border-black/[8%] bg-white px-3 py-3 ${info.verified ? "" : "opacity-70"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="h-4 w-4 text-[#0A5BE0]" aria-hidden="true" /> {info.label}
        </h3>
        {info.verified || row ? <StatusBadge view={view} /> : <SoonBadge />}
      </div>
      {row && (
        <p className="mt-1 text-xs text-muted-foreground">
          Kunci <span className="font-mono">{maskLast4(row.last4)}</span>
          {validatedOn && <>, terakhir diperiksa {validatedOn}</>}
          {row.model && <>, model <span className="font-mono">{row.model}</span></>}
        </p>
      )}
      {!showForm && <p className="mt-1 text-xs text-muted-foreground">{LLM_PROVIDER_SOON_TEXT}</p>}

      {showForm && (
        <form onSubmit={submit} noValidate className="mt-2">
          {info.verified && (
            <>
              <label htmlFor={inputId} className="block text-xs font-semibold leading-snug">
                {row ? "Ganti kunci API" : "Kunci API"} {info.label}
              </label>
              <input
                id={inputId}
                type="password"
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                data-1p-ignore="true"
                data-lpignore="true"
                value={value}
                disabled={working || !usable}
                aria-describedby={info.keyUrl ? hintId : undefined}
                placeholder={usable ? "Tempel kunci API di sini" : "Belum aktif"}
                onChange={(e) => {
                  setValue(e.target.value);
                  if (notice?.tone === "error") setNotice(null);
                }}
                className={`${INPUT_CLASS} min-h-11`}
              />
              {info.keyUrl && (
                <p id={hintId} className="mt-1 text-xs text-muted-foreground">
                  <a
                    href={info.keyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
                  >
                    Dapatkan kunci di {info.keyUrlLabel} <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    <span className="sr-only">(buka di tab baru)</span>
                  </a>
                </p>
              )}

              <label htmlFor={modelId} className="mt-3 block text-xs font-semibold leading-snug">{llmModelLabel(requiresModel)}</label>
              <input
                id={modelId}
                type="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={MODEL_MAX_LENGTH}
                value={model}
                disabled={working || !usable}
                aria-describedby={modelHintId}
                aria-required={requiresModel}
                placeholder="Nama model"
                onChange={(e) => {
                  setModel(e.target.value);
                  if (notice?.tone === "error") setNotice(null);
                }}
                className={`${INPUT_CLASS} min-h-11`}
              />
              <p id={modelHintId} className="mt-1 text-xs text-muted-foreground">
                {requiresModel ? LLM_MODEL_REQUIRED_HINT : LLM_MODEL_HINT}
              </p>

              <label htmlFor={`${uid}-consent`} className="mt-3 flex min-h-11 cursor-pointer items-start gap-2 text-xs leading-relaxed">
                <input
                  id={`${uid}-consent`}
                  type="checkbox"
                  checked={consent}
                  disabled={working || !usable}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[#0A5BE0] disabled:cursor-not-allowed"
                />
                <span>{llmConsentText(info.label)}</span>
              </label>
            </>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {confirming ? (
              <>
                <span className="text-xs">Hapus kunci {info.label}?</span>
                <button type="button" onClick={remove} disabled={working} aria-busy={busy === "delete"} className={DANGER_BUTTON}>
                  {busy === "delete" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Ya, hapus
                </button>
                <button type="button" onClick={() => setConfirming(false)} disabled={working} className={SECONDARY_BUTTON}>Batal</button>
              </>
            ) : (
              <>
                {info.verified && (
                  <button
                    type="submit"
                    disabled={working || !canSave}
                    aria-busy={busy === "save"}
                    className={PRIMARY_BUTTON}
                  >
                    {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    {busy === "save" ? "Menyimpan..." : "Simpan dan uji"}
                  </button>
                )}
                {row && (
                  <>
                    {info.verified && (
                      <button type="button" onClick={retest} disabled={working || !usable} aria-busy={busy === "test"} className={SECONDARY_BUTTON}>
                        {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
                        {busy === "test" ? "Menguji..." : "Uji ulang"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setConfirming(true); setNotice(null); }}
                      disabled={working}
                      aria-label={`Hapus kunci ${info.label}`}
                      className={SECONDARY_BUTTON}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" /> Hapus
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </form>
      )}

      {notice && (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={`mt-2 flex items-start gap-1.5 rounded-lg border-2 px-3 py-2 text-xs font-semibold ${NOTICE_STYLE[notice.tone]}`}
        >
          {notice.tone === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
          <span>{notice.text}</span>
        </p>
      )}
    </li>
  );
}
