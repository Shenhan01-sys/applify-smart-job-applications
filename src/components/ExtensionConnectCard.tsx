import { useState } from "react";
import { automationApi } from "@/services/automationApi";
import { describeApiError } from "@/lib/apiErrors";
import {
  EXTENSION_COPY_FAILED_TEXT,
  EXTENSION_GUIDE_HREF,
  EXTENSION_GUIDE_LINK_LABEL,
  EXTENSION_INSTALL_STEPS,
  EXTENSION_TOKEN_PASTE_WARNING,
  copyToClipboard,
  describeTokenExpiry,
} from "@/lib/extensionConnect";
import { Check, Copy, KeyRound, Loader2, ShieldAlert } from "lucide-react";

interface ExtensionTokenState {
  token: string;
  expiresAt: string;
  scope: string;
}

const maskToken = (token: string) =>
  token.length > 24 ? `${token.slice(0, 16)}...${token.slice(-8)}` : token;

/**
 * Panel pengaturan untuk menghubungkan Ekstensi Browser Chrome/Edge Applify menggunakan token pendek scoped
 * (`extension:apply`) tanpa menyimpan kata sandi atau cookie portal pihak ketiga di server Applify.
 */
export function ExtensionConnectCard() {
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [issued, setIssued] = useState<ExtensionTokenState | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  // Peramban menolak menyalin otomatis (halaman non-HTTPS, izin ditolak): token tampil utuh di kotak yang bisa dipilih.
  const [copyFailed, setCopyFailed] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    setNotice("");
    setCopiedToken(false);
    setCopyFailed(false);
    try {
      const res = await automationApi.createExtensionToken(14400);
      setIssued({ token: res.token, expiresAt: res.expiresAt, scope: res.scope });
    } catch (err) {
      setError(
        describeApiError(
          err,
          "Token ekstensi belum bisa dibuat. Periksa koneksi internetmu lalu tekan tombol hubungkan lagi. Pengaturan dan token lamamu tidak hilang.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeAll = async () => {
    setRevoking(true);
    setError("");
    setNotice("");
    try {
      await automationApi.revokeAllExtensionTokens();
      setIssued(null);
      setNotice("Semua token ekstensi lama telah dicabut. Perangkat lama harus terhubung ulang dengan token baru.");
    } catch (err) {
      setError(
        describeApiError(
          err,
          "Token ekstensi lama belum bisa dicabut. Periksa koneksi internetmu lalu coba lagi. Pengaturan perangkatmu belum berubah.",
        ),
      );
    } finally {
      setRevoking(false);
    }
  };

  // Alamat server sudah tertanam di ekstensi, jadi pengguna hanya menyalin token.
  const copyToken = async (text: string) => {
    if (!text) return;
    const ok = await copyToClipboard(text, typeof navigator === "undefined" ? null : navigator);
    setCopyFailed(!ok);
    setCopiedToken(ok);
    if (ok) setTimeout(() => setCopiedToken(false), 2000);
  };

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-xl border border-black/[8%] bg-[#F7F6F2] p-3 text-xs text-muted-foreground space-y-1.5">
        <p className="font-medium text-[#16150F]">
          Untuk portal yang butuh masuk akun pelamar (JobStreet, Glints, Kalibrr, Dealls, Workday):
        </p>
        <p>
          Ekstensi berjalan khusus laptop (Chrome atau Edge) dan tidak bisa dipasang di HP. Ekstensi membantu mengisi formulir di tabmu lalu berhenti sebelum kirim sehingga kamu yang menekan Kirim Sekarang di panel ekstensi. Kata sandi dan cookie portal tetap tinggal di browser-mu, dan setiap lamaran tetap meminta persetujuan di Applify. Lowongan LinkedIn tetap harus dilamar manual.
        </p>
        <ol data-testid="extension-install-steps" className="list-decimal space-y-0.5 pl-4 pt-0.5">
          {EXTENSION_INSTALL_STEPS.map((step, index) => (
            <li key={step}>
              {step}
              {index === 0 && (
                <>
                  {" "}
                  <a
                    href={EXTENSION_GUIDE_HREF}
                    className="font-semibold text-[#0A5BE0] underline underline-offset-2"
                  >
                    {EXTENSION_GUIDE_LINK_LABEL}
                  </a>
                </>
              )}
            </li>
          ))}
        </ol>
      </div>

      {notice && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          {notice}
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {issued ? (
        <div className="rounded-xl border-2 border-[#0A5BE0]/30 bg-white p-3.5 space-y-2.5">
          <div className="space-y-0.5 text-xs">
            <p className="font-semibold text-[#16150F]">Token koneksi aktif</p>
            <p data-testid="extension-token-expiry" className="text-muted-foreground">{describeTokenExpiry(issued.expiresAt)}</p>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg bg-[#F5F5F5] px-2.5 py-2 text-xs font-mono truncate" title="Token koneksi ekstensi">
              {maskToken(issued.token)}
            </code>
            <button
              type="button"
              onClick={() => copyToken(issued.token)}
              className="min-h-10 px-3 rounded-lg bg-[#0A5BE0] text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-90 transition"
            >
              {copiedToken ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
              {copiedToken ? "Tersalin" : "Salin Token"}
            </button>
          </div>
          {copyFailed && (
            <div role="status" data-testid="extension-token-fallback" className="space-y-1.5">
              <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-2.5 py-1.5">{EXTENSION_COPY_FAILED_TEXT}</p>
              <input
                type="text"
                readOnly
                value={issued.token}
                aria-label="Token koneksi ekstensi (pilih lalu salin)"
                onFocus={(e) => e.currentTarget.select()}
                onClick={(e) => e.currentTarget.select()}
                className="w-full rounded-lg border-2 border-black/[10%] bg-[#F5F5F5] px-2.5 py-2 text-xs font-mono"
              />
            </div>
          )}
          <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-2.5 py-1.5">{EXTENSION_TOKEN_PASTE_WARNING}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading || revoking}
          className="min-h-11 px-4 rounded-lg bg-[#0A5BE0] text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-60 inline-flex items-center gap-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
          {issued ? "Buat Ulang Token Ekstensi Chrome/Edge" : "Hubungkan Ekstensi Chrome/Edge"}
        </button>
        <button
          type="button"
          onClick={handleRevokeAll}
          disabled={loading || revoking}
          className="min-h-11 px-4 rounded-lg border-2 border-red-200 text-red-700 text-sm font-semibold hover:bg-red-50 transition disabled:opacity-60 inline-flex items-center gap-2"
        >
          {revoking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Putuskan semua perangkat
        </button>
      </div>
    </div>
  );
}
