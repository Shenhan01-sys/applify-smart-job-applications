import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import { useLinkedInSession } from "@/hooks/useAutomation";
import { mockLinkedInStatus } from "@/mocks/mockData";
import { parseCookieInput } from "@/lib/linkedinCookies";
import { isMockMode } from "@/lib/appConfig";
import {
  Shield, ShieldCheck, ShieldAlert, RefreshCw, Clock,
  CheckCircle2, AlertCircle, AlertTriangle, Loader2, Linkedin, BookOpen,
  Lock, KeyRound, LogOut, ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/linkedin-session")({
  // Disembunyikan sejak 23 November 2026: cookie li_at tidak dipakai pencarian maupun pengisian formulir, dan
  // memakainya dari server berisiko akun LinkedIn pengguna dibatasi. Tautan dari Pengaturan sudah dihapus; alamat
  // langsung dialihkan ke Pengaturan. Kodenya dibiarkan agar mudah diaktifkan lagi bila kebijakan berubah.
  beforeLoad: async () => {
    throw redirect({ to: "/settings" });
  },
  head: () => ({ meta: [{ title: "Sesi LinkedIn (Lanjutan) — Applify" }] }),
  component: LinkedInSessionPage,
});

type Tab = "manual" | "guide";

function LinkedInSessionPage() {
  const { sessionStatus, sessionError, checkSession, importSession, verifySession } = useLinkedInSession();
  const [cookiesText, setCookiesText] = useState("");
  const [importing, setImporting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("manual");
  const [status, setStatus] = useState(sessionStatus);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (isMockMode()) {
      setStatus(mockLinkedInStatus);
      return;
    }
    setStatus(sessionStatus);
  }, [sessionStatus]);

  // Status sesi hanya dibaca sekali saat halaman dibuka.
  useEffect(() => {
    if (!isMockMode()) void checkSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleImport = async () => {
    setFormError("");
    const parsed = parseCookieInput(cookiesText);
    if (!parsed.ok) {
      setFormError(parsed.message);
      return;
    }
    try {
      setImporting(true);
      if (isMockMode()) {
        setStatus({ hasSession: true, isValid: true, lastUsed: new Date().toISOString(), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });
        toast.success("Sesi berhasil diimpor (mode demo).");
        setCookiesText("");
      } else {
        // Isian tetap ada bila impor gagal (konfigurasi server atau sesi), supaya tidak perlu menempel ulang.
        const imported = await importSession(parsed.cookies);
        if (imported) setCookiesText("");
      }
    } finally {
      setImporting(false);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      if (isMockMode()) {
        await new Promise((r) => setTimeout(r, 1500));
        toast.success("Sesi valid (mode demo).");
      } else {
        await verifySession();
      }
    } catch {
      toast.error("Sesi belum bisa diperiksa. Coba lagi.");
    } finally {
      setVerifying(false);
    }
  };

  const getSessionConfig = () => {
    if (!status?.hasSession) {
      return { icon: ShieldAlert, color: "text-red-600", bg: "bg-red-50", border: "border-red-200", badge: "bg-red-100 text-red-800 border-red-200", text: "Belum ada sesi" };
    }
    if (status?.isValid) {
      return { icon: ShieldCheck, color: "text-green-700", bg: "bg-green-50", border: "border-green-200", badge: "bg-green-100 text-green-800 border-green-200", text: "Aktif" };
    }
    return { icon: Shield, color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", badge: "bg-amber-100 text-amber-800 border-amber-200", text: "Kedaluwarsa" };
  };

  const config = getSessionConfig();
  const StatusIcon = config.icon;

  const infoCards = [
    { icon: CheckCircle2, color: "text-green-700", title: "Disimpan terenkripsi", desc: "Cookie dienkripsi dengan AES-256-GCM sebelum disimpan di server Applify." },
    { icon: Clock, color: "text-amber-700", title: "Masa berlaku", desc: "Sesi berlaku 30 hari sejak diimpor, lalu harus diimpor ulang." },
    { icon: LogOut, color: "text-red-700", title: "Mengakhiri akses", desc: "Keluar (logout) dari LinkedIn di browsermu. Halaman ini belum punya tombol hapus sesi." },
  ];

  const tabs: { key: Tab; label: string; icon: typeof KeyRound }[] = [
    { key: "manual", label: "Tempel cookie", icon: KeyRound },
    { key: "guide", label: "Panduan", icon: BookOpen },
  ];

  return (
    <AppShell>
      <header className="mb-6">
        <Link to="/settings" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Kembali ke Pengaturan
        </Link>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <Linkedin className="h-7 w-7 text-[#0A66C2]" aria-hidden="true" /> Sesi LinkedIn
          <span className="rounded-full border-2 border-neutral-300 px-2.5 py-0.5 text-xs font-semibold text-neutral-700">Lanjutan, opsional</span>
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Hanya diperlukan bila kamu ingin agen membuka LinkedIn atas namamu. Aplikasi tetap bisa dipakai penuh tanpa ini.
        </p>
      </header>

      <div role="note" className="mb-6 flex items-start gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
        <div className="text-sm text-amber-900">
          <p className="font-semibold">Baca dulu risikonya</p>
          <p className="mt-1">
            Cookie LinkedIn berfungsi seperti kunci masuk ke akunmu. Siapa pun yang memegangnya bisa bertindak sebagai kamu.
            Penggunaan otomatis juga dapat bertentangan dengan ketentuan LinkedIn, sehingga akunmu berisiko dibatasi.
            Jangan lanjut kalau kamu tidak yakin.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* KIRI: pengelolaan sesi */}
        <div className="space-y-5">
          <div className={`rounded-2xl border-2 ${config.border} ${config.bg} p-5 transition-all duration-300`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`h-12 w-12 rounded-xl ${config.bg} grid place-items-center border-2 ${config.border}`}>
                  <StatusIcon className={`h-6 w-6 ${config.color}`} aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-bold">Status sesi</p>
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium border ${config.badge}`}>
                    {config.text}
                  </span>
                </div>
              </div>
              {status?.hasSession && (
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={verifying}
                  className="min-h-11 px-4 rounded-lg border-2 border-black/[8%] bg-white text-sm font-medium hover:bg-black/[4%] transition inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${verifying ? "animate-spin" : ""}`} aria-hidden="true" />
                  {verifying ? "Memeriksa..." : "Periksa sesi"}
                </button>
              )}
            </div>

            {status?.hasSession ? (
              <dl className="mt-4 pt-4 border-t border-black/[6%] space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Terakhir dipakai</dt>
                  <dd className="font-medium">{status.lastUsed ? new Date(status.lastUsed).toLocaleDateString("id-ID") : "Belum pernah"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Berlaku sampai</dt>
                  <dd className="font-medium">{status.expiresAt ? new Date(status.expiresAt).toLocaleDateString("id-ID") : "Tidak diketahui"}</dd>
                </div>
              </dl>
            ) : (
              <div className="mt-4 flex items-start gap-2 text-amber-800 bg-amber-100 p-3 rounded-xl text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                <p>Belum ada sesi LinkedIn yang aktif. Tempel cookie di bawah bila kamu memang memerlukannya.</p>
              </div>
            )}
          </div>

          <div className="glass rounded-2xl p-5">
            <div role="tablist" aria-label="Cara memasukkan sesi" className="flex gap-2 mb-4">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    id={`tab-${tab.key}`}
                    aria-selected={activeTab === tab.key}
                    aria-controls={`panel-${tab.key}`}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex min-h-11 items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                      activeTab === tab.key
                        ? "bg-[#0A5BE0] text-white shadow-lg shadow-[#0A5BE0]/20"
                        : "bg-black/[4%] text-muted-foreground border-2 border-black/[8%] hover:bg-black/[7%]"
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" /> {tab.label}
                  </button>
                );
              })}
            </div>

            {sessionError && (
              <div role="alert" className="mb-4 rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm text-red-700 flex gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>{sessionError.message}</span>
              </div>
            )}

            {activeTab === "manual" && (
              <div role="tabpanel" id="panel-manual" aria-labelledby="tab-manual" className="space-y-4">
                <div>
                  <label htmlFor="cookies-linkedin" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Cookie LinkedIn</label>
                  <textarea
                    id="cookies-linkedin"
                    rows={6}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={formError ? true : undefined}
                    aria-describedby={formError ? "cookies-error" : undefined}
                    className="mt-1.5 w-full rounded-xl bg-black/[4%] border-2 border-black/[8%] p-3 font-mono text-base md:text-sm focus:border-[#0A5BE0]/40 focus:outline-none focus:ring-2 focus:ring-[#0A5BE0]/10 transition-all resize-y"
                    placeholder={`Tempel cookie di sini. Boleh JSON dari ekstensi cookie:\n[\n  {"name": "li_at", "value": "..."}\n]\natau teks: li_at=...; JSESSIONID=...`}
                    value={cookiesText}
                    onChange={(e) => setCookiesText(e.target.value)}
                  />
                  {formError && <p id="cookies-error" role="alert" className="mt-1.5 text-sm text-red-700">{formError}</p>}
                </div>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importing || !cookiesText.trim()}
                  className="min-h-11 px-5 rounded-xl bg-[#0A5BE0] text-white text-sm font-semibold hover:bg-[#0256d3] transition inline-flex items-center gap-2 disabled:opacity-60 shadow-lg shadow-[#0A5BE0]/20"
                >
                  {importing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
                  {importing ? "Menyimpan..." : "Simpan sesi"}
                </button>
              </div>
            )}

            {activeTab === "guide" && (
              <div role="tabpanel" id="panel-guide" aria-labelledby="tab-guide" className="space-y-3 text-sm">
                <h2 className="font-semibold">Cara mengambil cookie LinkedIn</h2>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>Buka LinkedIn di browser dan masuk ke akunmu.</li>
                  <li>Buka Developer Tools (tombol F12, atau Ctrl+Shift+I).</li>
                  <li>Pilih tab Application, lalu Cookies, lalu https://www.linkedin.com.</li>
                  <li>Salin cookie <code>li_at</code> (wajib), serta <code>JSESSIONID</code> dan <code>bcookie</code> bila ada.</li>
                  <li>Tempel di tab Tempel cookie.</li>
                </ol>
                <div className="mt-3 p-3 rounded-xl bg-blue-50 border-2 border-blue-200 text-blue-900">
                  <p className="font-medium text-sm">Catatan keamanan</p>
                  <p className="text-sm mt-1">
                    Cookie dienkripsi sebelum disimpan dan dipakai agen hanya untuk membuka LinkedIn atas namamu.
                    Untuk mengakhiri akses, keluar dari LinkedIn di browsermu.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* KANAN: keamanan */}
        <div className="space-y-5">
          <div className="glass rounded-2xl p-5">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Lock className="h-5 w-5 text-[#0A5BE0]" aria-hidden="true" /> Informasi keamanan
            </h2>
            <ul className="space-y-4">
              {infoCards.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.title} className="flex items-start gap-3 p-3 rounded-xl bg-black/[2%] border-2 border-black/[6%]">
                    <Icon className={`h-5 w-5 ${item.color} shrink-0 mt-0.5`} aria-hidden="true" />
                    <div>
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">{item.desc}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="glass rounded-2xl p-5">
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-700" aria-hidden="true" /> Tips
            </h2>
            <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5">
              <li>Jangan bagikan cookie ini kepada siapa pun.</li>
              <li>Impor ulang bila muncul galat saat agen bekerja.</li>
              <li>Pastikan kamu masuk dengan akun LinkedIn yang benar.</li>
              <li>Periksa sesi secara berkala untuk memastikan masih berlaku.</li>
            </ul>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default LinkedInSessionPage;
