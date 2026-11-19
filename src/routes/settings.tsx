import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import { ErrorState } from "@/components/ErrorState";
import { useSubscription } from "@/hooks/useSubscription";
import { isBillingEnabled } from "@/lib/appConfig";
import { PLAN_PRICE } from "@/lib/subscriptionStore";
import { Chrome, Bell, CreditCard, Lock, Sparkles, Gauge, Linkedin, ChevronRight, Loader2, ShieldAlert } from "lucide-react";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

export const Route = createFileRoute("/settings")({
  beforeLoad: async () => {
    if (isMockMode()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Pengaturan — Applify" }] }),
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

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Pengaturan</h1>
        <p className="text-muted-foreground text-sm mt-1">Kelola kuota, notifikasi, dan privasi akunmu</p>
      </header>
      <div className="space-y-4 max-w-3xl">
        {/* Kuota: dibaca dari database, bukan dari penyimpanan browser */}
        <Card icon={Gauge} title="Kuota Draf AI" color="#059669"
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

        <Card icon={Chrome} title="Ekstensi Browser" color="#0A5BE0"
          desc="Ekstensi untuk membantu mengisi formulir lamaran langsung di browser. Belum tersedia.">
          <div className="flex flex-wrap gap-2 mt-4">
            <SoonButton>Pasang untuk Chrome</SoonButton>
            <SoonButton>Pasang untuk Firefox</SoonButton>
          </div>
        </Card>

        <Card icon={Bell} title="Notifikasi" color="#8A9A00"
          desc="Pengaturan notifikasi per jenis belum tersedia, jadi belum ada yang bisa diubah di sini.">
          <div className="mt-4"><SoonButton icon={Bell}>Atur notifikasi</SoonButton></div>
        </Card>

        {/* Tagihan hanya tampil bila VITE_ENABLE_BILLING=true */}
        {billing && (
          <Card icon={CreditCard} title="Paket & Tagihan" color="#059669"
            desc={plan.tier === "free" ? "Kamu saat ini di paket Gratis." : `Paket ${TIER_LABEL[plan.tier]} · ${PLAN_PRICE[plan.tier].label}${PLAN_PRICE[plan.tier].period}`}>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/subscription" className="inline-flex min-h-11 items-center gap-1.5 px-4 rounded-lg bg-[#0A5BE0] text-white text-sm font-semibold hover:bg-[#0256d3] transition">
                <Sparkles className="h-4 w-4" aria-hidden="true" /> {plan.tier === "free" ? "Lihat paket" : "Kelola paket"}
              </Link>
            </div>
          </Card>
        )}

        <Card icon={Lock} title="Privasi & Keamanan" color="#6366F1"
          desc="Lihat data apa yang disimpan dan siapa yang menerimanya.">
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/terms" className="inline-flex min-h-11 items-center gap-1.5 px-4 rounded-lg border-2 border-black/[8%] bg-black/[4%] text-sm hover:bg-black/[7%] transition">
              Baca Ketentuan &amp; Privasi <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <SoonButton icon={Lock}>Ekspor data</SoonButton>
          </div>
        </Card>

        {/* Fitur lanjutan: dikeluarkan dari menu utama karena berisiko dan tidak dibutuhkan untuk fitur inti */}
        <Card icon={Linkedin} title="Lanjutan (opsional): Sesi LinkedIn" color="#0A66C2"
          desc="Hanya untuk pengguna yang paham risikonya. Fitur inti Applify tidak membutuhkan ini.">
          <p className="mt-3 flex items-start gap-2 rounded-xl border-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Memasukkan cookie LinkedIn memberi agen akses ke akun LinkedIn-mu seolah-olah kamu sendiri. Cara ini bisa melanggar
              ketentuan LinkedIn dan berisiko akunmu dibatasi. Cookie disimpan terenkripsi, tetapi tetap perlakukan seperti kata sandi.
            </span>
          </p>
          <div className="mt-3">
            <Link to="/linkedin-session" className="inline-flex min-h-11 items-center gap-1.5 px-4 rounded-lg border-2 border-black/[8%] bg-black/[4%] text-sm hover:bg-black/[7%] transition">
              Buka pengaturan sesi LinkedIn <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function Card({ icon: Icon, title, desc, children, color = '#0A5BE0' }: { icon: typeof Lock; title: string; desc: string; children?: React.ReactNode; color?: string }) {
  return (
    <section aria-label={title} className="glass rounded-2xl p-5 hover:shadow-md transition-all duration-200">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg grid place-items-center text-white shrink-0" style={{ backgroundColor: color }} aria-hidden="true">
          <Icon className="h-5 w-5"/>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{desc}</p>
          {children}
        </div>
      </div>
    </section>
  );
}
