import { useState } from "react";
import { automationApi } from "@/services/automationApi";
import { getApiBaseUrl, isMockMode } from "@/lib/appConfig";
import { describeApiError } from "@/lib/apiErrors";
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
  const [error, setError] = useState("");
  const [issued, setIssued] = useState<ExtensionTokenState | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const serverUrl = isMockMode() ? "" : (() => {
    try {
      return getApiBaseUrl();
    } catch {
      return "";
    }
  })();

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    setCopiedToken(false);
    try {
      const res = await automationApi.createExtensionToken(14400);
      setIssued({ token: res.token, expiresAt: res.expiresAt, scope: res.scope });
    } catch (err) {
      setError(describeApiError(err, "Gagal membuat token ekstensi."));
    } finally {
      setLoading(false);
    }
  };

  const copyText = async (text: string, which: "token" | "url") => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    if (which === "token") {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    } else {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-xl border border-black/[8%] bg-[#F7F6F2] p-3 text-xs text-muted-foreground space-y-1.5">
        <p className="font-medium text-[#16150F]">
          Untuk portal yang butuh masuk (JobStreet, Kalibrr, Glints, Workday):
        </p>
        <p>
          Ekstensi berjalan di tab Chrome/Edge milikmu sendiri. Kata sandi dan cookie portal tetap tinggal di browser-mu,
          dan setiap kiriman tetap meminta persetujuan di Applify. Lowongan LinkedIn tetap manual-only.
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {issued ? (
        <div className="rounded-xl border-2 border-[#0A5BE0]/30 bg-white p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-[#16150F]">Token Koneksi Aktif (scope: {issued.scope})</span>
            <span className="text-muted-foreground">
              Berlaku s.d. {new Date(issued.expiresAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg bg-[#F5F5F5] px-2.5 py-2 text-xs font-mono truncate" title="Token koneksi ekstensi">
              {maskToken(issued.token)}
            </code>
            <button
              type="button"
              onClick={() => copyText(issued.token, "token")}
              className="min-h-10 px-3 rounded-lg bg-[#0A5BE0] text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-90 transition"
            >
              {copiedToken ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
              {copiedToken ? "Tersalin" : "Salin Token"}
            </button>
          </div>
          {serverUrl && (
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground pt-1 border-t border-black/[6%]">
              <span className="truncate">Server API: <code className="font-mono">{serverUrl}</code></span>
              <button
                type="button"
                onClick={() => copyText(serverUrl, "url")}
                className="shrink-0 underline underline-offset-4 hover:text-[#16150F]"
              >
                {copiedUrl ? "Tersalin" : "Salin URL"}
              </button>
            </div>
          )}
          <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-2.5 py-1.5">
            Tempel token ini hanya ke popup Ekstensi Browser Applify (Chrome/Edge), jangan pernah ke situs lain.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="min-h-11 px-4 rounded-lg bg-[#0A5BE0] text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-60 inline-flex items-center gap-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
          {issued ? "Buat Ulang Token Ekstensi Chrome/Edge" : "Hubungkan Ekstensi Chrome/Edge"}
        </button>
      </div>
    </div>
  );
}
