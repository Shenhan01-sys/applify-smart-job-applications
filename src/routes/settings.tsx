import { useEffect, useState } from "react";
import { createFileRoute, redirect, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import { ErrorState } from "@/components/ErrorState";
import { useSubscription } from "@/hooks/useSubscription";
import { isBillingEnabled } from "@/lib/appConfig";
import { PLAN_PRICE } from "@/lib/subscriptionStore";
import SavedAnswers from "@/components/SavedAnswers";
import { ExtensionConnectCard } from "@/components/ExtensionConnectCard";
import { NotificationSettingsCard } from "@/components/NotificationSettingsCard";
import LlmKeysCard from "@/components/LlmKeysCard";
import { gmailBanner, parseGmailCallback, validateGmailSearch, type GmailBanner } from "@/lib/gmailCallback";
import { Chrome, Bell, CreditCard, Lock, Sparkles, Gauge, ChevronRight, Loader2, ClipboardList, KeyRound } from "lucide-react";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

export const Route = createFileRoute("/settings")({
  beforeLoad: async () => {
    if (isMockMode()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Pengaturan — Applify" }] }),
  // Backend mengarahkan balik ke /settings?gmail=connected atau ?gmail=error&reason=... sesudah sambungan Gmail.
  validateSearch: validateGmailSearch,
  component: SettingsPage,
});

const TIER_LABEL = { free: "Gratis", pro: "Pro", kampus: "Kampus" } as const;

/** Tombol untuk fitur yang belum dibangun: terlihat, tetapi mati dan berlabel, bukan tombol yang diam saat ditekan. */
function SoonButton({ icon: Icon, children }: { icon?: typeof Lock; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title="Fitur ini belum tersedia"
      className="min-h-11 px-4 rounded-lg border-2 border-black/[8%] bg-black/[4%] text-sm opacity-70 cursor-not-allowed inline-flex items-center gap-2"
    >
      {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
      {children}
      <span className="rounded-full bg-black/[8%] px-2 py-0.5 text-xs font-medium">Segera hadir</span>
    </button>
  );
}

function SettingsPage() {
  const plan = useSubscription();
  const billing = isBillingEnabled();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [gmail, setGmail] = useState<GmailBanner | null>(null);

  // Hasil sambungan Gmail dibaca dari alamat sekali, ditampilkan sebagai kabar di halaman, lalu alamatnya dibersihkan
  // supaya muat ulang halaman tidak mengulang kabar yang sama.
  useEffect(() => {
    const callback = parseGmailCallback(search);
    if (!callback) return;
    setGmail(gmailBanner(callback));
    navigate({ to: "/settings", search: {}, hash: window.location.hash.replace(/^#/, "") || undefined, replace: true });
  }, [search, navigate]);

  return (
    <AppShell>
      <header className="mb-6 max-w-5xl sm:mb-8">
        <h1 className="text-2xl font-bold sm:text-3xl">Pengaturan</h1>
        <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">Kelola kuota, notifikasi, dan privasi akunmu</p>
      </header>
      {/* Ponsel: judul bagian lalu panelnya. Layar lebar: judul dan penjelasan di kolom kiri (ikut menempel saat
          digulir), panel isian di kolom kanan, dipisah garis tipis antarbagian. */}
      <div className="max-w-5xl divide-y divide-black/[7%]">
        {gmail && (
          <div
            role={gmail.tone === "error" ? "alert" : "status"}
            data-testid="gmail-banner"
            className={`mb-6 flex items-start justify-between gap-3 rounded-xl border-2 p-3 text-sm ${gmail.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-800"}`}
          >
            <span>
              {gmail.text}
              {gmail.tone === "success" && (
                <> <Link to="/approvals" className="font-semibold underline">Buka Persetujuan</Link></>
              )}
            </span>
            <button type="button" onClick={() => setGmail(null)} aria-label="Tutup kabar Gmail" className="shrink-0 min-h-8 px-2 text-xs font-semibold underline">
              Tutup
            </button>
          </div>
        )}
        {/* Kuota: dibaca dari database, bukan dari penyimpanan browser */}
        <Card icon={Gauge} title="Kuota Draf AI"
          desc="Berapa draf lamaran yang masih bisa dibuat AI bulan ini.">
          <div className="mt-4" aria-live="polite">
            {plan.loading ? (
              <p className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Memuat kuota...</p>
            ) : plan.error ? (
              <ErrorState title="Kuota belum bisa dimuat" message={plan.error} onRetry={plan.reload} />
            ) : (
              <div className="space-y-2 text-sm">
                <p>
                  {plan.quota
                    ? <>Terpakai <b>{plan.quota.used}</b> dari <b>{plan.quota.quota}</b> draf bulan ini. Sisa <b>{plan.quota.remaining}</b>.</>
                    : "Kuota belum diketahui."}
                </p>
                <p className="text-muted-foreground">Kuota dihitung per bulan dan akan direset bulan depan. Model AI yang dipakai: {plan.tier === "pro" ? "model Pro" : "model gratis"}.</p>
              </div>
            )}
          </div>
        </Card>

        {/* Kunci LLM milik pengguna: dikirim hanya lewat badan permintaan, tidak disimpan di browser */}
        <Card icon={KeyRound} title="Kunci API Sendiri"
          desc="Pakai kunci API LLM milikmu sendiri untuk membuat draf lamaran. Pilih penyedia, tempel kuncinya, lalu simpan.">
          <LlmKeysCard />
        </Card>

        <Card icon={ClipboardList} title="Jawaban formulir tersimpan"
          desc="Jawaban yang kamu berikan untuk pertanyaan agen. Agen memakainya lagi saat menemui pertanyaan yang sama di lowongan lain.">
          <SavedAnswers />
        </Card>

        <Card id="ekstensi" icon={Chrome} title="Ekstensi Browser (Chrome & Edge)"
          desc="Gunakan Ekstensi Browser Applify di Chrome atau Edge untuk membantu mengisi formulir pada portal yang butuh masuk dengan akunmu sendiri.">
          <ExtensionConnectCard />
          <div className="mt-3">
            <SoonButton>Pasang untuk Firefox</SoonButton>
          </div>
        </Card>

        <Card icon={Bell} title="Notifikasi WhatsApp"
          desc="Terima kabar status lamaran, permintaan kode keamanan, dan pengingat tindak lanjut lewat WhatsApp terverifikasi atau email.">
          <NotificationSettingsCard />
        </Card>

        {/* Tagihan hanya tampil bila VITE_ENABLE_BILLING=true */}
        {billing && (
          <Card icon={CreditCard} title="Paket & Tagihan"
            desc={plan.tier === "free" ? "Kamu saat ini di paket Gratis." : `Paket ${TIER_LABEL[plan.tier]} · ${PLAN_PRICE[plan.tier].label}${PLAN_PRICE[plan.tier].period}`}>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/subscription" className="inline-flex min-h-11 items-center gap-1.5 px-4 rounded-lg bg-[#0A5BE0] text-white text-sm font-semibold hover:bg-[#0256d3] transition">
                <Sparkles className="h-4 w-4" aria-hidden="true" /> {plan.tier === "free" ? "Lihat paket" : "Kelola paket"}
              </Link>
            </div>
          </Card>
        )}

        <Card icon={Lock} title="Privasi & Keamanan"
          desc="Lihat data apa yang disimpan dan siapa yang menerimanya.">
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/terms" className="inline-flex min-h-11 items-center gap-1.5 px-4 rounded-lg border-2 border-black/[8%] bg-black/[4%] text-sm hover:bg-black/[7%] transition">
              Baca Ketentuan &amp; Privasi <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link to="/privacy" className="inline-flex min-h-11 items-center gap-1.5 px-4 rounded-lg border-2 border-black/[8%] bg-black/[4%] text-sm hover:bg-black/[7%] transition">
              Kebijakan Privasi <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <SoonButton icon={Lock}>Ekspor data</SoonButton>
          </div>
        </Card>

      </div>
    </AppShell>
  );
}

function Card({ id, icon: Icon, title, desc, children }: { id?: string; icon: typeof Lock; title: string; desc: string; children?: React.ReactNode }) {
  return (
    <section
      id={id}
      aria-label={title}
      className="scroll-mt-6 py-6 first:pt-0 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-10 lg:py-8 xl:grid-cols-[18rem_minmax(0,1fr)]"
    >
      <div className="flex items-start gap-3 lg:sticky lg:top-6 lg:flex-col lg:self-start">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
          <Icon className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-snug sm:text-lg">{title}</h2>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">{desc}</p>
        </div>
      </div>
      {/* Isi kartu: jarak atas bawaan komponen anak dihapus karena panel sudah punya bantalan sendiri. */}
      {children && <div className="glass mt-4 rounded-2xl p-4 sm:p-5 lg:mt-0 lg:self-start [&>*:first-child]:mt-0">{children}</div>}
    </section>
  );
}
