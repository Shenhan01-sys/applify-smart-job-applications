import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Sparkles, Zap, Brain, Radar, EyeOff, ArrowRight, Check, Bot, LogIn, UserPlus, Search,
  Leaf, ShieldCheck, FileText, UserCog, Mail,
} from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { FREE_FEATURES, PRO_FEATURES } from "@/lib/planInfo";
import { isBillingEnabled } from "@/lib/appConfig";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Applify — Asisten AI untuk Menyiapkan Lamaran Kerja" }] }),
  component: Landing,
});

// Halaman ini hanya boleh memuat klaim yang sesuai dengan kode. Tidak ada testimoni, jumlah pengguna, atau
// persentase keberhasilan, karena belum ada datanya. Fitur yang belum dibangun berlabel "Segera hadir".
// Sumber lowongan mengikuti backend/services/mcp-registry.ts.

/* ─────────────────────────  Motion helper  ───────────────────────── */

function ScrollReveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.style.transitionDelay = `${delay}ms`;
          el.classList.add("scroll-reveal-visible");
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <div ref={ref} className={`scroll-reveal ${className}`}>
      {children}
    </div>
  );
}

function AgentMark({ size = 32 }: { size?: number }) {
  return (
    <div
      aria-hidden="true"
      className="grid place-items-center rounded-xl font-display font-extrabold"
      style={{ width: size, height: size, background: "#D2F801", color: "#16150F", fontSize: size * 0.6, lineHeight: 1 }}
    >
      A
    </div>
  );
}

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && !loading) {
      navigate({ to: "/dashboard" });
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" role="status" aria-live="polite">
        <div className="animate-spin h-8 w-8 border-4 border-[#0A5BE0] border-t-transparent rounded-full" aria-hidden="true" />
        <span className="ml-3 text-muted-foreground">Memuat...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden">
      <a
        href="#konten-utama"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:shadow-lg"
      >
        Lewati ke konten utama
      </a>
      <Navbar />
      <main id="konten-utama" tabIndex={-1} className="focus:outline-none">
        <Hero />
        <HowItWorks />
        <Capabilities />
        <ComingSoon />
        <GreenCareerSpotlight />
        {isBillingEnabled() ? <Pricing /> : <TrialNote />}
        <FinalCTA />
      </main>
      <Footer />
      <MobileStickyBar />
    </div>
  );
}

/* ─────────────────────────  Navbar  ───────────────────────── */

function Navbar() {
  const { user, signOut } = useAuth();
  return (
    <header className="sticky top-0 z-40 glass-strong">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8">
        <Link to="/" className="flex items-center gap-2.5 min-h-11">
          <AgentMark size={32} />
          <span className="text-lg font-display font-extrabold tracking-tight">Applify</span>
        </Link>
        <nav aria-label="Bagian halaman" className="hidden md:flex items-center gap-7 text-sm font-medium text-muted-foreground">
          <a href="#cara-kerja" className="hover:text-foreground transition">Cara Kerja</a>
          <a href="#fitur" className="hover:text-foreground transition">Fitur</a>
          <a href="#segera-hadir" className="hover:text-foreground transition">Segera Hadir</a>
          {isBillingEnabled() && <a href="#harga" className="hover:text-foreground transition">Harga</a>}
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <button type="button" onClick={signOut} className="hidden md:inline-flex min-h-11 items-center rounded-lg border-2 border-[color:var(--border)] bg-black/[3%] px-4 text-sm font-medium hover:bg-black/[6%] transition">
                Keluar
              </button>
              <Link to="/dashboard" className="inline-flex min-h-11 items-center rounded-lg bg-[#0A5BE0] px-4 text-sm font-semibold text-white hover:opacity-90 transition">
                Buka Aplikasi
              </Link>
            </>
          ) : (
            <>
              <Link to="/login" className="hidden md:inline-flex min-h-11 items-center gap-1.5 px-3 text-sm font-medium text-muted-foreground hover:text-foreground">
                <LogIn className="h-4 w-4" aria-hidden="true" /> Masuk
              </Link>
              {/* Daftar Gratis membuka formulir daftar, bukan formulir masuk */}
              <Link to="/login" search={{ mode: "daftar" }} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[#16150F] px-4 text-sm font-semibold text-[#F4F1E8] hover:bg-black transition">
                <UserPlus className="h-4 w-4" aria-hidden="true" /> Daftar Gratis
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/* ─────────────────────────  Hero  ───────────────────────── */

const FLOW = [
  { icon: UserCog, t: "Isi profilmu", d: "Nama, jabatan, skill, pengalaman, dan pendidikan. Cukup sekali." },
  { icon: Search, t: "Pilih lowongan", d: "Cari di daftar lowongan dari sumber yang didukung." },
  { icon: FileText, t: "AI menulis draf", d: "Surat lamaran ditulis dari profilmu dan isi lowongan. Kamu bebas menyuntingnya." },
  { icon: ShieldCheck, t: "Kamu menyetujui", d: "Tidak ada lamaran yang dikirim sebelum kamu menyetujuinya." },
];

function Hero() {
  return (
    <section className="relative grid-bg">
      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-16 md:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 md:px-8">
        <div className="flex flex-col justify-center animate-fade-up">
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#D2F801] px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-[#16150F]">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Tahap uji coba
          </span>
          <h1 className="mt-6 font-display text-[2.4rem] font-extrabold leading-[1.02] tracking-tight md:text-6xl">
            Asisten AI yang <span className="text-[#0A5BE0]">menyiapkan</span> lamaran kerjamu.
          </h1>
          <p className="mt-7 max-w-xl text-base md:text-lg text-muted-foreground leading-relaxed">
            Applify membantu mencari lowongan, menulis draf surat lamaran dari profilmu, dan menyiapkan isian formulir.
            <b className="text-foreground font-semibold"> Kamu yang memeriksa dan menyetujui</b>; tidak ada yang dikirim tanpa persetujuanmu.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/login" search={{ mode: "daftar" }} className="inline-flex min-h-12 items-center rounded-xl bg-[#16150F] px-6 text-sm font-semibold text-[#F4F1E8] hover:bg-black transition">
              Daftar Gratis <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
            <a href="#cara-kerja" className="inline-flex min-h-12 items-center rounded-xl border-2 border-[color:var(--border)] bg-white px-6 text-sm font-semibold hover:bg-black/[3%] transition">
              Lihat cara kerja
            </a>
          </div>
          <p className="mt-6 max-w-xl text-sm text-muted-foreground">
            Applify sedang diuji sebagai bagian dari penelitian skripsi. Fitur bisa berubah, dan draf yang ditulis AI perlu kamu baca ulang sebelum dipakai.
          </p>
        </div>

        <div className="relative">
          <ol aria-label="Alur memakai Applify" className="glass-panel rounded-3xl p-6 md:p-8 space-y-4">
            {FLOW.map((s, i) => (
              <li key={s.t} className="flex items-start gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#16150F] text-[#D2F801]" aria-hidden="true">
                  <s.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-display font-bold"><span className="mr-1.5 text-[#0A5BE0]">{i + 1}.</span>{s.t}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground leading-snug">{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────  Cara kerja  ───────────────────────── */

function HowItWorks() {
  const steps = [
    { id: "1", title: "Lengkapi profil", desc: "Isi nama, jabatan, skill, pengalaman, dan pendidikan. AI memakai data ini untuk menulis lamaran yang sesuai denganmu." },
    { id: "2", title: "Cari lowongan", desc: "Buka AI Job Scanner untuk mengumpulkan lowongan dari sumber yang didukung, lalu simpan yang menarik." },
    { id: "3", title: "Buat draf dengan AI", desc: "Pilih lowongan, lalu minta AI menulis surat lamaran dan ringkasan skill yang disorot. Setiap draf memakai satu kuota bulanan." },
    { id: "4", title: "Setujui, lalu kirim", desc: "Periksa draf di halaman Persetujuan. Setelah kamu setuju, lamaran bisa dikirim lewat email dari akun Gmail-mu bila Gmail terhubung, atau kamu kirim sendiri." },
  ];
  return (
    <ScrollReveal>
      <section id="cara-kerja" className="mx-auto max-w-7xl px-4 py-20 md:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xs uppercase tracking-[0.22em] text-[#D9741A] font-bold">Cara kerja</p>
          <h2 className="mt-3 font-display text-3xl md:text-5xl font-extrabold tracking-tight">Empat langkah, semuanya lewat klik.</h2>
        </div>
        <ol className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <li key={s.id} className="glass rounded-3xl p-6">
              <span className="font-mono text-3xl font-extrabold text-[#0A5BE0]" aria-hidden="true">{s.id}</span>
              <h3 className="mt-2 font-display text-lg font-bold">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground leading-snug">{s.desc}</p>
            </li>
          ))}
        </ol>
      </section>
    </ScrollReveal>
  );
}

/* ─────────────────────────  Fitur yang sudah ada  ───────────────────────── */

function Capabilities() {
  return (
    <ScrollReveal delay={50}>
      <section id="fitur" className="mx-auto max-w-7xl px-4 py-20 md:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xs uppercase tracking-[0.22em] text-[#1C9656] font-bold">Fitur yang sudah ada</p>
          <h2 className="mt-3 font-display text-3xl md:text-5xl font-extrabold tracking-tight">Yang bisa kamu pakai sekarang.</h2>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <BentoCard icon={Search} badge="Lowongan" badgeTone="#0A5BE0" title="Cari lowongan dari banyak sumber" desc="Mengumpulkan lowongan dari JobStreet, Glints, Kalibrr, LinkedIn (butuh sesi), serta perusahaan yang memakai Greenhouse, Lever, Ashby, Workable, dan SmartRecruiters." accent="#0A5BE0" />
          <BentoCard icon={FileText} badge="Draf AI" badgeTone="#16150F" title="Surat lamaran yang bisa kamu sunting" desc="AI menulis draf dari profilmu dan isi lowongan, lalu menandai skill yang diminta lowongan tetapi belum ada di profilmu. Kuota draf dihitung per bulan." accent="#16150F" />
          <BentoCard icon={ShieldCheck} badge="Kendali di tanganmu" badgeTone="#1C9656" title="Persetujuan sebelum kirim" desc="Setiap draf masuk ke halaman Persetujuan. Jawaban formulir yang kurang pasti ditandai supaya kamu cek dulu." accent="#1C9656" />
          <BentoCard icon={Mail} badge="Email" badgeTone="#0A5BE0" title="Kirim lewat Gmail" desc="Setelah disetujui, lamaran bisa dikirim lewat email dari akun Gmail-mu. Perlu menghubungkan Gmail lebih dulu." accent="#D9741A" />
          <BentoCard icon={Radar} badge="Skill" badgeTone="#16150F" title="Peta Skill" desc="Membandingkan skill di profilmu dengan nilai pembanding tetap. Ini perkiraan kasar, bukan pengukuran pasar." accent="#6D4AFF" />
          <BentoCard icon={EyeOff} badge="Pratinjau" badgeTone="#16150F" title="Mode Anonim" desc="Di halaman Profil, pratinjau CV bisa menyamarkan nama dan sebagian riwayat untuk melihat CV tanpa identitas. Hanya tampilan; datamu tidak berubah." accent="#1C9656" />
        </div>
      </section>
    </ScrollReveal>
  );
}

/* ─────────────────────────  Segera hadir  ───────────────────────── */

function ComingSoon() {
  return (
    <ScrollReveal delay={50}>
      <section id="segera-hadir" className="mx-auto max-w-7xl px-4 py-12 md:px-8">
        <div className="rounded-3xl border-2 border-dashed border-[color:var(--border)] bg-[#FBF9F2] p-6 md:p-8">
          <p className="text-xs uppercase tracking-[0.22em] text-[#0A5BE0] font-bold">Segera hadir</p>
          <h2 className="mt-2 font-display text-2xl md:text-3xl font-extrabold tracking-tight">Masih rencana, belum bisa dipakai.</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <BentoCard icon={Zap} badge="Segera hadir" badgeTone="#0A5BE0" title="Golden Window Sniper" desc="Rencana fitur: memantau lowongan baru agar kamu bisa melamar lebih awal. Belum tersedia." accent="#D9741A" />
            <BentoCard icon={Brain} badge="Segera hadir" badgeTone="#0A5BE0" title="ATS Collective Intelligence" desc="Rencana fitur: belajar dari pola lowongan untuk menyarankan kata kunci. Belum tersedia dan belum ada datanya." accent="#16150F" />
          </div>
        </div>
      </section>
    </ScrollReveal>
  );
}

function BentoCard({ icon: Icon, badge, badgeTone, title, desc, accent }: { icon: typeof Zap; badge: string; badgeTone: string; title: string; desc: string; accent: string }) {
  return (
    <div className="glass rounded-3xl p-6 overflow-hidden hover:-translate-y-1 transition-transform duration-300">
      <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold text-white" style={{ background: badgeTone }}>{badge}</span>
      <div className="mt-3.5 h-11 w-11 rounded-xl grid place-items-center text-white" style={{ background: accent }} aria-hidden="true">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-3.5 font-display text-lg font-bold leading-tight">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground leading-snug">{desc}</p>
    </div>
  );
}

/* ─────────────────────────  Green Career  ───────────────────────── */

function GreenCareerSpotlight() {
  return (
    <ScrollReveal>
      <section className="mx-auto max-w-7xl px-4 py-12 md:px-8">
        <div className="relative overflow-hidden rounded-3xl border-2 border-[color:var(--border)] text-white p-8 md:p-12" style={{ background: "linear-gradient(135deg, #1C7A4A 0%, #0F6B3D 100%)" }}>
          <div className="absolute -top-16 -right-16 h-56 w-56 rounded-full bg-[#D2F801]/20 blur-3xl" aria-hidden="true" />
          <div className="relative max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wider">
              <Leaf className="h-3.5 w-3.5" aria-hidden="true" /> Karier Hijau
            </span>
            <h2 className="mt-5 font-display text-3xl md:text-4xl font-extrabold leading-tight">Asesmen untuk lowongan Karier Hijau</h2>
            <p className="mt-4 text-white/90 leading-relaxed">
              Untuk lowongan yang ditandai Karier Hijau, AI menyusun beberapa pertanyaan, menilai jawabanmu, lalu memberi umpan balik:
              kekuatan, hal yang perlu diperkuat, dan saran pengembangan. Hasilnya perkiraan model bahasa untuk membantumu bersiap, bukan keputusan perusahaan.
            </p>
            <ul className="mt-6 flex flex-wrap gap-3">
              {["Soal dibuat AI untuk tiap lowongan", "Umpan balik tertulis", "Gratis selama uji coba"].map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-medium">
                  <Check className="h-3.5 w-3.5 text-[#D2F801]" aria-hidden="true" /> {t}
                </li>
              ))}
            </ul>
            <Link to="/login" search={{ mode: "daftar" }} className="mt-8 inline-flex min-h-11 items-center rounded-xl bg-[#D2F801] px-6 text-sm font-semibold text-[#16150F] hover:opacity-90 transition">
              Daftar untuk mencoba <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </ScrollReveal>
  );
}

/* ─────────────────────────  Harga (hanya bila VITE_ENABLE_BILLING=true)  ───────────────────────── */

function Pricing() {
  const tiers = [
    { name: "Free", price: "Gratis", per: "selamanya", features: FREE_FEATURES },
    { name: "Pro", price: "Rp 69.000", per: "/bulan", popular: true, features: PRO_FEATURES },
    { name: "Kampus", price: "Rp 50jt", per: "/semester", features: ["Lisensi B2B2C kampus", "Dashboard karier kampus", "Semua fitur Pro untuk mahasiswa", "Laporan penempatan kerja", "Onboarding & pelatihan", "Co-branding"] },
  ];
  return (
    <ScrollReveal>
      <section id="harga" className="mx-auto max-w-7xl px-4 py-20 md:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xs uppercase tracking-[0.22em] text-[#0A5BE0] font-bold">Harga</p>
          <h2 className="mt-3 font-display text-3xl md:text-5xl font-extrabold tracking-tight">Pilih paket.</h2>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3 items-stretch">
          {tiers.map((t) => (
            <div key={t.name} className={`relative glass rounded-3xl p-7 flex flex-col ${t.popular ? "ring-2 ring-[#0A5BE0]" : ""}`}>
              <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t.name}</p>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-display text-4xl font-extrabold">{t.price}</span>
                <span className="text-sm text-muted-foreground">{t.per}</span>
              </div>
              <ul className="mt-5 space-y-2.5 text-sm flex-1">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2"><Check className="h-4 w-4 mt-0.5 text-[#1C9656] shrink-0" aria-hidden="true" /> {f}</li>
                ))}
              </ul>
              <Link to="/subscription" className="mt-7 inline-flex min-h-11 justify-center items-center rounded-xl border-2 border-[color:var(--border)] text-sm font-semibold hover:bg-black/[3%] transition">
                {t.name === "Free" ? "Mulai Gratis" : t.name === "Kampus" ? "Hubungi Kami" : "Pilih Paket"}
              </Link>
            </div>
          ))}
        </div>
      </section>
    </ScrollReveal>
  );
}

function TrialNote() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-12 md:px-8 text-center">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Selama masa uji coba, semua fitur di atas bisa dipakai tanpa biaya. Kuota draf AI dihitung per bulan dan akan direset bulan depan.
      </p>
    </section>
  );
}

/* ─────────────────────────  CTA akhir, footer, bilah bawah  ───────────────────────── */

function FinalCTA() {
  return (
    <section className="relative mx-auto max-w-7xl px-4 py-20 md:px-8">
      <div className="relative overflow-hidden rounded-3xl bg-[#16150F] p-10 md:p-16 text-center">
        <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-[#0A5BE0]/25 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-[#D2F801]/15 blur-3xl" aria-hidden="true" />
        <div className="relative">
          <Bot className="mx-auto h-10 w-10 text-[#D2F801]" aria-hidden="true" />
          <h2 className="mt-6 font-display text-3xl md:text-5xl font-extrabold tracking-tight max-w-2xl mx-auto text-[#F4F1E8]">
            Coba siapkan satu lamaran dengan Applify.
          </h2>
          <p className="mt-4 text-[#C9C4B2] max-w-xl mx-auto">Daftar, isi profil, lalu minta AI menulis draf untuk satu lowongan. Kamu yang menentukan apakah draf itu dipakai.</p>
          <Link to="/login" search={{ mode: "daftar" }} className="mt-8 inline-flex min-h-14 items-center rounded-2xl bg-[#D2F801] px-8 text-base font-semibold text-[#16150F] hover:opacity-90 transition">
            Daftar Gratis <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const linkClass = "inline-flex min-h-11 items-center hover:text-foreground transition";
  return (
    <footer className="border-t border-[color:var(--border)] mt-10 pb-24 md:pb-10">
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-8 grid gap-8 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-2.5">
            <AgentMark size={28} />
            <span className="font-display font-extrabold">Applify</span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground max-w-xs">Asisten AI untuk menyiapkan lamaran kerja. Sedang dalam tahap uji coba untuk penelitian skripsi.</p>
        </div>
        <nav aria-label="Halaman ini">
          <p className="text-sm font-bold">Halaman ini</p>
          <ul className="mt-2 text-sm text-muted-foreground">
            <li><a className={linkClass} href="#cara-kerja">Cara kerja</a></li>
            <li><a className={linkClass} href="#fitur">Fitur</a></li>
            <li><a className={linkClass} href="#segera-hadir">Segera hadir</a></li>
          </ul>
        </nav>
        <nav aria-label="Akun dan informasi">
          <p className="text-sm font-bold">Akun dan informasi</p>
          <ul className="mt-2 text-sm text-muted-foreground">
            <li><Link className={linkClass} to="/login">Masuk</Link></li>
            <li><Link className={linkClass} to="/login" search={{ mode: "daftar" }}>Daftar gratis</Link></li>
            <li><Link className={linkClass} to="/forgot-password">Lupa kata sandi</Link></li>
            <li><Link className={linkClass} to="/terms">Ketentuan &amp; Privasi</Link></li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}

function MobileStickyBar() {
  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-40 glass-strong border-t border-black/[8%] flex gap-2 px-3 py-2">
      <Link to="/login" className="flex-1 min-h-11 rounded-xl border-2 border-[color:var(--border)] bg-white grid place-items-center text-sm font-semibold hover:bg-black/[3%] transition">Masuk</Link>
      <Link to="/login" search={{ mode: "daftar" }} className="flex-[2] min-h-11 rounded-xl bg-[#16150F] grid place-items-center text-sm font-semibold text-[#F4F1E8] hover:bg-black transition">Daftar Gratis</Link>
    </div>
  );
}
