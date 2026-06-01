import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Sparkles, Zap, Brain, Radar, EyeOff, ArrowRight, Check, Rocket, Bot,
  CalendarCheck, Star, LogIn, UserPlus, Search, Send, Leaf, Target,
  TrendingUp, Scale, Globe, Clock, BadgeCheck, Quote, Briefcase, GraduationCap,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/")({
  component: Landing,
});

/* ─────────────────────────  Motion helpers  ───────────────────────── */

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

function CountUp({ to, suffix = "", prefix = "", duration = 1500, decimals = 0 }: { to: number; suffix?: string; prefix?: string; duration?: number; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [val, setVal] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let started = false;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !started) {
          started = true;
          const start = performance.now();
          const tick = (now: number) => {
            const p = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            setVal(to * eased);
            if (p < 1) raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
          obs.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    obs.observe(el);
    return () => { obs.disconnect(); cancelAnimationFrame(raf); };
  }, [to, duration]);
  return (
    <span ref={ref}>
      {prefix}
      {val.toLocaleString("id-ID", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

/* ─────────────────────────  Brand marks  ───────────────────────── */

function AgentMark({ size = 32 }: { size?: number }) {
  return (
    <div
      className="grid place-items-center rounded-xl font-display font-extrabold"
      style={{ width: size, height: size, background: "#D2F801", color: "#16150F", fontSize: size * 0.6, lineHeight: 1 }}
    >
      A
    </div>
  );
}

function AgentMascot({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden="true">
      <line x1="48" y1="15" x2="48" y2="7" stroke="#16150F" strokeWidth="3" strokeLinecap="round" />
      <circle cx="48" cy="5" r="4" fill="#D2F801" stroke="#16150F" strokeWidth="2" />
      <rect x="20" y="16" width="56" height="50" rx="15" fill="#D2F801" stroke="#16150F" strokeWidth="3" />
      <rect x="14" y="34" width="6" height="15" rx="3" fill="#16150F" />
      <rect x="76" y="34" width="6" height="15" rx="3" fill="#16150F" />
      <rect x="31" y="33" width="13" height="10" rx="3.5" fill="#16150F" />
      <rect x="52" y="33" width="13" height="10" rx="3.5" fill="#16150F" />
      <circle cx="35" cy="36.5" r="1.6" fill="#D2F801" />
      <circle cx="56" cy="36.5" r="1.6" fill="#D2F801" />
      <path d="M35 51 Q48 61 61 51" stroke="#16150F" strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect x="41" y="66" width="14" height="8" rx="3" fill="#16150F" />
      <rect x="30" y="74" width="36" height="6" rx="3" fill="#4A4840" />
    </svg>
  );
}

/* ─────────────────────────  Data  ───────────────────────── */

const platforms = ["LinkedIn", "Jobstreet", "Glints", "KitaLulus", "Kalibrr", "Dealls", "Facebook Groups"];

const platformMeta: Record<string, { color: string; bg: string; emoji: string }> = {
  LinkedIn:          { color: "#FFFFFF", bg: "#0A66C2", emoji: "💼" },
  Jobstreet:         { color: "#FFFFFF", bg: "#E8192C", emoji: "🔍" },
  Glints:            { color: "#16150F", bg: "#0BD461", emoji: "✨" },
  KitaLulus:         { color: "#FFFFFF", bg: "#FF6B00", emoji: "🎓" },
  Kalibrr:           { color: "#FFFFFF", bg: "#2563EB", emoji: "📋" },
  Dealls:            { color: "#FFFFFF", bg: "#6366F1", emoji: "🤝" },
  "Facebook Groups": { color: "#FFFFFF", bg: "#1877F2", emoji: "👥" },
};

/* ─────────────────────────  Page  ───────────────────────── */

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const authLink = user ? "/dashboard" : "/login";

  useEffect(() => {
    if (user && !loading) {
      navigate({ to: "/dashboard" });
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-[#0A5BE0] border-t-transparent rounded-full" />
        <span className="ml-3 text-muted-foreground">Memuat...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden">
      <Navbar authLink={authLink} />
      <Hero authLink={authLink} />
      <PlatformMarquee />
      <StatBand />
      <Manifesto />
      <ProblemSolution />
      <HowItWorks />
      <CapabilitiesBento />
      <ImpactPillars />
      <GreenCareerSpotlight authLink={authLink} />
      <Testimonials />
      <Pricing authLink={authLink} />
      <BehindApplify />
      <FinalCTA authLink={authLink} />
      <Footer />
      <MobileStickyBar authLink={authLink} />
    </div>
  );
}

/* ─────────────────────────  Navbar  ───────────────────────── */

function Navbar({ authLink }: { authLink: string }) {
  const { user, signOut } = useAuth();
  return (
    <header className="sticky top-0 z-40 glass-strong">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <AgentMark size={32} />
          <span className="text-lg font-display font-extrabold tracking-tight">Applify</span>
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-muted-foreground">
          <a href="#tentang" className="hover:text-foreground transition">Tentang</a>
          <a href="#cara-kerja" className="hover:text-foreground transition">Cara Kerja</a>
          <a href="#fitur" className="hover:text-foreground transition">Fitur</a>
          <a href="#dampak" className="hover:text-foreground transition">Dampak</a>
          <a href="#harga" className="hover:text-foreground transition">Harga</a>
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <button onClick={signOut} className="hidden md:inline-flex h-9 items-center rounded-lg border border-[color:var(--border)] bg-black/[3%] px-4 text-sm font-medium hover:bg-black/[6%] transition">
                Logout
              </button>
              <Link to="/dashboard" className="inline-flex h-9 items-center rounded-lg bg-[#0A5BE0] px-4 text-sm font-semibold text-white hover:opacity-90 transition">
                Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link to={authLink} className="hidden md:inline-flex h-9 items-center gap-1.5 px-3 text-sm font-medium text-muted-foreground hover:text-foreground">
                <LogIn className="h-3.5 w-3.5" /> Masuk
              </Link>
              <Link to={authLink} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#16150F] px-4 text-sm font-semibold text-[#F4F1E8] hover:bg-black transition">
                <UserPlus className="h-3.5 w-3.5" /> Daftar Gratis
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/* ─────────────────────────  Hero  ───────────────────────── */

function Hero({ authLink }: { authLink: string }) {
  return (
    <section className="relative grid-bg">
      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-16 md:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 md:px-8">
        <div className="flex flex-col justify-center animate-fade-up">
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#D2F801] px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-[#16150F]">
            <Sparkles className="h-3.5 w-3.5" /> Autonomous AI Career Agent
          </span>
          <h1 className="mt-6 font-display text-[2.6rem] font-extrabold leading-[0.98] tracking-tight md:text-6xl lg:text-[4.5rem]">
            Agen AI <span className="text-[#0A5BE0]">Otonom</span><br />
            yang <span className="relative inline-block">Melamar Kerja
              <svg className="absolute -bottom-2 left-0 w-full" height="10" viewBox="0 0 300 10" preserveAspectRatio="none" aria-hidden="true">
                <path d="M2 7 Q150 1 298 6" stroke="#D2F801" strokeWidth="6" fill="none" strokeLinecap="round" />
              </svg>
            </span><br />untukmu.
          </h1>
          <p className="mt-7 max-w-xl text-base md:text-lg text-muted-foreground leading-relaxed">
            Applify memindai LinkedIn, Jobstreet, Glints, dan 4 platform lain sekaligus — lalu <b className="text-foreground font-semibold">menulis, melamar, dan menyiapkan interview</b> atas namamu. Otomatis. 24/7.
          </p>
          <div className="mt-4 font-display text-lg font-semibold text-[#16150F]">
            Apply Smarter. <span className="text-[#0A5BE0]">Fairer.</span> Together.
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to={authLink} className="inline-flex h-12 items-center rounded-xl bg-[#16150F] px-6 text-sm font-semibold text-[#F4F1E8] hover:bg-black transition">
              Aktifkan Agen Gratis <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <a href="#cara-kerja" className="inline-flex h-12 items-center rounded-xl border border-[color:var(--border)] bg-white px-6 text-sm font-semibold hover:bg-black/[3%] transition">
              Lihat Cara Kerja →
            </a>
          </div>
          <div className="mt-9 flex items-center gap-4">
            <div className="flex -space-x-2">
              {["#0A5BE0", "#D9741A", "#1C9656", "#16150F"].map((c, i) => (
                <div key={i} className="h-9 w-9 rounded-full border-2 border-[#F4F1E8] grid place-items-center text-white text-xs font-bold" style={{ background: c }}>
                  {["RZ", "DW", "AP", "FH"][i]}
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground"><span className="font-mono font-bold text-foreground"><CountUp to={12400} suffix="+" /></span> pencari kerja sudah bergabung</p>
          </div>
        </div>

        <div className="relative">
          <AgentLivePanel />
        </div>
      </div>
    </section>
  );
}

/* The "transparency layer" — show what the autonomous agent is doing right now */
function AgentLivePanel() {
  const log = [
    { icon: Search, t: "Memindai 7 platform…", s: "342 lowongan baru", tone: "eco" },
    { icon: Brain, t: "Mencocokkan & menulis CV", s: "12 lamaran disiapkan", tone: "soc" },
    { icon: Send, t: "Mengirim lamaran (ATS-ready)", s: "47 terkirim hari ini", tone: "eco" },
    { icon: CalendarCheck, t: "Menyiapkan interview", s: "8 callback diterima", tone: "grn" },
  ];
  return (
    <div className="relative">
      <div className="relative glass rounded-3xl p-6 animate-fade-up">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <AgentMascot className="h-10 w-10" />
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Agen Applify</p>
              <p className="text-sm font-semibold">Bekerja untukmu</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#1C9656] animate-pulse-glow" />
            <span className="text-xs text-[#1C9656] font-mono font-semibold">LIVE</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <MiniStat label="Terkirim" value="47" tone="eco" />
          <MiniStat label="ATS Lolos" value="91%" tone="grn" />
          <MiniStat label="Callback" value="8" tone="soc" />
          <MiniStat label="⚡ Golden" value="3" tone="eco" />
        </div>

        <div className="mt-5 space-y-2">
          {log.map((it, i) => {
            const ic = it.tone === "eco" ? "#0A5BE0" : it.tone === "soc" ? "#D9741A" : "#1C9656";
            return (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[#FBF9F2] p-3">
                <div className="h-8 w-8 rounded-lg grid place-items-center text-white shrink-0" style={{ background: ic }}>
                  <it.icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{it.t}</p>
                  <p className="text-xs text-muted-foreground truncate">{it.s}</p>
                </div>
                <Check className="h-4 w-4 text-[#1C9656]" />
              </div>
            );
          })}
        </div>
      </div>

      <div className="absolute -top-4 -right-3 glass rounded-xl px-4 py-3 animate-float hidden sm:block">
        <p className="text-xs text-muted-foreground">Hari ini</p>
        <p className="text-sm font-bold">🎯 47 lamaran terkirim</p>
      </div>
      <div className="absolute -bottom-4 -left-3 glass rounded-xl px-4 py-3 animate-float hidden sm:block" style={{ animationDelay: "1s" }}>
        <p className="text-xs text-muted-foreground">Lolos ATS</p>
        <p className="text-sm font-bold text-[#1C9656]">91% akurasi</p>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: "eco" | "soc" | "grn" }) {
  const color = tone === "eco" ? "text-[#0A5BE0]" : tone === "soc" ? "text-[#D9741A]" : "text-[#1C9656]";
  return (
    <div className="rounded-xl border border-[color:var(--border)] bg-[#FBF9F2] p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`font-mono text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

/* ─────────────────────────  Platform marquee  ───────────────────────── */

function PlatformMarquee() {
  const items = [...platforms, ...platforms];
  return (
    <section className="border-y border-[color:var(--border)] bg-white py-12 overflow-hidden">
      <p className="text-center text-xs uppercase tracking-[0.22em] text-muted-foreground font-semibold">Satu agen. Semua platform kerja Indonesia.</p>
      <div className="mt-8 flex animate-marquee gap-4 whitespace-nowrap">
        {items.map((p, i) => {
          const meta = platformMeta[p] ?? { color: "#FFFFFF", bg: "#8B92B4", emoji: "🔗" };
          return (
            <div key={i} className="flex items-center gap-2.5 rounded-2xl px-5 py-3 shrink-0" style={{ background: meta.bg }}>
              <span className="text-xl">{meta.emoji}</span>
              <span className="text-base font-bold" style={{ color: meta.color }}>{p}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ─────────────────────────  Stat band  ───────────────────────── */

function StatBand() {
  const stats = [
    { v: <CountUp to={91} suffix="%" />, l: "Lolos screening ATS" },
    { v: <><CountUp to={4} suffix="x" /></>, l: "Callback lebih cepat" },
    { v: <CountUp to={7} />, l: "Platform terindeks" },
    { v: <CountUp to={12400} suffix="+" />, l: "Pencari kerja" },
  ];
  return (
    <section className="bg-[#16150F] text-[#F4F1E8]">
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-8 grid grid-cols-2 md:grid-cols-4 gap-8">
        {stats.map((s, i) => (
          <div key={i} className="text-center md:text-left">
            <p className="font-display text-4xl md:text-5xl font-extrabold text-[#D2F801] tracking-tight">{s.v}</p>
            <p className="mt-1.5 text-sm text-[#C9C4B2]">{s.l}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────  Manifesto / Tentang  ───────────────────────── */

function Manifesto() {
  return (
    <ScrollReveal>
      <section id="tentang" className="mx-auto max-w-7xl px-4 py-20 md:py-28 md:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-[#0A5BE0] font-bold">Tentang Applify</p>
            <h2 className="mt-4 font-display text-3xl md:text-5xl font-extrabold tracking-tight leading-[1.05]">
              Melamar kerja seharusnya soal <span className="text-[#0A5BE0]">kemampuan</span> — bukan soal waktu, koneksi, atau keberuntungan.
            </h2>
            <p className="mt-6 text-muted-foreground leading-relaxed md:text-lg max-w-xl">
              Applify lahir dari satu keresahan: proses melamar kerja di Indonesia melelahkan, tidak setara, dan sering menutup pintu sebelum kemampuan sempat terlihat. Kami membangun <b className="text-foreground">agen AI otonom</b> yang mengambil alih kerja berat — agar setiap orang punya peluang yang adil.
            </p>
            <div className="mt-8 grid sm:grid-cols-2 gap-4 max-w-xl">
              <MissionCard icon={Target} tone="#0A5BE0" title="Misi" body="Mendemokratisasi akses ke kerja layak lewat otomasi AI yang terjangkau bagi semua." />
              <MissionCard icon={Globe} tone="#1C9656" title="Visi" body="Pasar kerja Indonesia di mana skill berbicara lebih dulu, tanpa hambatan struktural." />
            </div>
          </div>
          <div className="relative">
            <div className="glass rounded-3xl p-7">
              <div className="flex items-center gap-3 border-b border-[color:var(--border)] pb-4">
                <AgentMascot className="h-12 w-12" />
                <div>
                  <p className="font-display font-bold text-lg">Prinsip kami</p>
                  <p className="text-xs text-muted-foreground">Apa yang membuat Applify berbeda</p>
                </div>
              </div>
              <ul className="mt-5 space-y-4">
                {[
                  { icon: Bot, t: "Otonom, bukan sekadar asisten", d: "Agen bertindak sendiri — mencari, melamar, menyiapkan interview." },
                  { icon: Scale, t: "Adil sejak desain", d: "Blind Merit Mode menyembunyikan bias kampus & latar belakang." },
                  { icon: Leaf, t: "Berdampak", d: "Green Career Track memprioritaskan perusahaan berdampak positif." },
                ].map((p) => (
                  <li key={p.t} className="flex gap-3.5">
                    <div className="h-9 w-9 rounded-xl bg-[#16150F] grid place-items-center text-[#D2F801] shrink-0">
                      <p.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{p.t}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{p.d}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="absolute -z-10 -inset-3 rounded-[2rem] bg-[#D2F801]/30 blur-2xl" aria-hidden="true" />
          </div>
        </div>
      </section>
    </ScrollReveal>
  );
}

function MissionCard({ icon: Icon, tone, title, body }: { icon: any; tone: string; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-white p-5">
      <div className="h-10 w-10 rounded-xl grid place-items-center text-white" style={{ background: tone }}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 font-display font-bold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}

/* ─────────────────────────  Problem → Solution  ───────────────────────── */

function ProblemSolution() {
  return (
    <ScrollReveal>
      <section className="bg-white border-y border-[color:var(--border)]">
        <div className="mx-auto max-w-7xl px-4 py-20 md:px-8">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-xs uppercase tracking-[0.22em] text-[#D9741A] font-bold">Masalahnya nyata</p>
            <h2 className="mt-3 font-display text-3xl md:text-5xl font-extrabold tracking-tight">Mencari kerja itu melelahkan & timpang.</h2>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-2 items-stretch">
            {/* Problem */}
            <div className="rounded-3xl border-2 border-dashed border-[#D9741A]/40 bg-[#FBF9F2] p-7">
              <span className="inline-flex items-center gap-2 rounded-full bg-[#D9741A]/12 px-3 py-1 text-xs font-bold text-[#A8560F] uppercase tracking-wider">
                Tanpa Applify
              </span>
              <div className="mt-6 space-y-5">
                {[
                  { n: <CountUp to={100} suffix="+" />, l: "lamaran rata-rata sebelum diterima kerja", icon: Briefcase },
                  { n: <CountUp to={75} suffix="%" />, l: "CV ditolak ATS sebelum dibaca manusia", icon: EyeOff },
                  { n: <>berminggu</>, l: "waktu terbuang menyalin data form yang sama", icon: Clock },
                ].map((p, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-white border border-[color:var(--border)] grid place-items-center text-[#D9741A] shrink-0">
                      <p.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-display text-2xl font-extrabold text-[#16150F]">{p.n}</p>
                      <p className="text-sm text-muted-foreground">{p.l}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Solution */}
            <div className="rounded-3xl bg-[#16150F] text-[#F4F1E8] p-7 relative overflow-hidden">
              <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-[#D2F801]/20 blur-2xl" aria-hidden="true" />
              <span className="inline-flex items-center gap-2 rounded-full bg-[#D2F801] px-3 py-1 text-xs font-bold text-[#16150F] uppercase tracking-wider">
                Dengan Applify
              </span>
              <p className="mt-6 text-lg font-medium text-[#ECE8DA] leading-relaxed">
                Satu agen otonom menggantikan ratusan jam kerja manual:
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                {[
                  { icon: Search, t: "Cari di 7 platform" },
                  { icon: Brain, t: "Tulis CV per lowongan" },
                  { icon: Send, t: "Lamar ATS-ready" },
                  { icon: CalendarCheck, t: "Siapkan interview" },
                ].map((s) => (
                  <div key={s.t} className="rounded-2xl bg-white/[6%] border border-white/10 p-4">
                    <div className="h-9 w-9 rounded-lg bg-[#D2F801] grid place-items-center text-[#16150F]">
                      <s.icon className="h-5 w-5" />
                    </div>
                    <p className="mt-3 text-sm font-semibold">{s.t}</p>
                  </div>
                ))}
              </div>
              <p className="mt-6 font-display text-xl font-bold">
                Dari <span className="text-[#D9741A] line-through decoration-2">berminggu-minggu</span> → <span className="text-[#D2F801]">hitungan menit.</span>
              </p>
            </div>
          </div>
        </div>
      </section>
    </ScrollReveal>
  );
}

/* ─────────────────────────  How it works (pipeline)  ───────────────────────── */

function HowItWorks() {
  const steps = [
    { icon: Brain, title: "Upload Profil Sekali", desc: "Agen mempelajari pengalaman & preferensi kariermu dalam hitungan menit." },
    { icon: Bot, title: "Agen Bekerja 24/7", desc: "Memindai 7 platform, menulis ulang CV per lowongan, dan melamar otomatis." },
    { icon: CalendarCheck, title: "Terima Undangan Interview", desc: "Fokus persiapan interview — biarkan agen mengurus sisanya." },
  ];
  return (
    <ScrollReveal>
      <section id="cara-kerja" className="mx-auto max-w-7xl px-4 py-20 md:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xs uppercase tracking-[0.22em] text-[#0A5BE0] font-bold">Cara Kerja</p>
          <h2 className="mt-3 font-display text-3xl md:text-5xl font-extrabold tracking-tight">Tiga langkah sampai interview.</h2>
        </div>
        <div className="mt-14 grid gap-8 md:grid-cols-3 relative">
          <div className="hidden md:block absolute top-16 left-[16%] right-[16%] h-0.5 bg-[#0A5BE0]/30" />
          {steps.map((s, i) => (
            <div key={i} className="relative glass rounded-3xl p-7 text-center">
              <StepIllo step={(i + 1) as 1 | 2 | 3} />
              <div className="mx-auto h-14 w-14 rounded-2xl bg-[#0A5BE0] grid place-items-center text-white shadow-lg">
                <s.icon className="h-6 w-6" />
              </div>
              <p className="mt-4 font-mono text-xs text-muted-foreground">LANGKAH 0{i + 1}</p>
              <h3 className="mt-2 text-xl font-display font-bold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </ScrollReveal>
  );
}

/* ─────────────────────────  Capabilities bento  ───────────────────────── */

function CapabilitiesBento() {
  return (
    <ScrollReveal delay={50}>
      <section id="fitur" className="mx-auto max-w-7xl px-4 py-20 md:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xs uppercase tracking-[0.22em] text-[#1C9656] font-bold">Kapabilitas</p>
          <h2 className="mt-3 font-display text-3xl md:text-5xl font-extrabold tracking-tight">Bukan job board biasa.</h2>
          <p className="mt-4 text-muted-foreground">Lima kemampuan eksklusif yang tidak akan kamu temukan di platform lain.</p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-4 md:auto-rows-[200px]">
          {/* Hero cell 2x2 — Collective ATS Intelligence */}
          <div className="md:col-span-2 md:row-span-2 glass rounded-3xl p-7 relative overflow-hidden flex flex-col">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#0A5BE0] px-3 py-1 text-xs font-bold text-white">
              ✦ Eksklusif Indonesia
            </span>
            <div className="mt-5 h-12 w-12 rounded-xl bg-[#16150F] grid place-items-center text-[#D2F801]">
              <Brain className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-display text-2xl font-extrabold">Collective ATS Intelligence</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Agregasi data ATS dari 12.000+ pelamar. Kami tahu keyword apa yang lolos di Workday Gojek, Lever Tokopedia, Greenhouse Shopee.
            </p>
            <div className="mt-auto pt-5 space-y-2.5">
              {[
                { c: "Gojek", ats: "Workday", m: 87 },
                { c: "Tokopedia", ats: "Lever", m: 74 },
                { c: "Shopee", ats: "Greenhouse", m: 92 },
              ].map((row) => (
                <div key={row.c} className="rounded-xl border border-[color:var(--border)] bg-[#FBF9F2] p-3">
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-semibold">{row.c}</p>
                      <p className="text-xs text-muted-foreground font-mono">{row.ats}</p>
                    </div>
                    <span className="font-mono text-sm font-bold text-[#1C9656]">{row.m}%</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-black/[6%] overflow-hidden">
                    <div className="h-full bg-[#1C9656] rounded-full" style={{ width: `${row.m}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <BentoCard icon={EyeOff} badge="Social Impact" badgeTone="#16150F" title="Blind Merit Mode" desc="Sembunyikan nama, kampus & latar belakang. Skill bicara dulu." accent="#1C9656" />
          <BentoCard icon={Zap} badge="Real-time" badgeTone="#0A5BE0" title="Golden Window Sniper" desc="Lamar 2 jam pertama — callback 4x lebih tinggi." accent="#D9741A" />

          {/* Wide cell 2x1 — Skill Radar with mini radar */}
          <div className="md:col-span-2 glass rounded-3xl p-6 flex items-center gap-5">
            <div className="flex-1">
              <span className="inline-flex items-center rounded-full bg-[#16150F] px-3 py-1 text-xs font-bold text-[#D2F801]">Smart Learning</span>
              <h3 className="mt-3 font-display text-xl font-bold">Skill Radar</h3>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">Visualisasi gap skill-mu vs tren pasar real-time, terhubung ke platform learning.</p>
            </div>
            <RadarMini />
          </div>
        </div>
      </section>
    </ScrollReveal>
  );
}

function BentoCard({ icon: Icon, badge, badgeTone, title, desc, accent }: { icon: any; badge: string; badgeTone: string; title: string; desc: string; accent: string }) {
  return (
    <div className="glass rounded-3xl p-6 hover:-translate-y-1 transition-transform duration-300">
      <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold text-white" style={{ background: badgeTone }}>{badge}</span>
      <div className="mt-4 h-11 w-11 rounded-xl grid place-items-center text-white" style={{ background: accent }}>
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 font-display text-xl font-bold">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}

/* ─────────────────────────  Impact pillars + SDG  ───────────────────────── */

const sdgs = [
  { n: 8, label: "Decent Work & Economic Growth", color: "#A21942" },
  { n: 10, label: "Reduced Inequalities", color: "#DD1367" },
  { n: 5, label: "Gender Equality", color: "#FF3A21" },
  { n: 9, label: "Industry & Innovation", color: "#FD6925" },
  { n: 4, label: "Quality Education", color: "#C5192D" },
];

function ImpactPillars() {
  return (
    <ScrollReveal>
      <section id="dampak" className="bg-white border-y border-[color:var(--border)]">
        <div className="mx-auto max-w-7xl px-4 py-20 md:px-8">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-xs uppercase tracking-[0.22em] text-[#0A5BE0] font-bold">Misi & Dampak</p>
            <h2 className="mt-3 font-display text-3xl md:text-5xl font-extrabold tracking-tight">Dibangun di atas dua pilar.</h2>
            <p className="mt-4 text-muted-foreground">Keberlanjutan yang kami perjuangkan: ekonomi yang produktif dan masyarakat yang setara.</p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <PillarCard
              tone="#0A5BE0"
              tag="Pilar Ekonomi"
              title="Produktivitas & peluang kerja"
              points={[
                "Memangkas waktu cari kerja dari berminggu jadi menit.",
                "Mempertemukan talenta dengan lowongan yang tepat, lebih cepat.",
                "Membuka akses pasar kerja lintas kota & platform.",
              ]}
              icon={TrendingUp}
            />
            <PillarCard
              tone="#D9741A"
              tag="Pilar Sosial"
              title="Kesetaraan & inklusi"
              points={[
                "Blind Merit Mode melawan bias kampus & latar belakang.",
                "Menjangkau pencari kerja dari kampus non-favorit & daerah.",
                "AI gratis (DeepSeek) → akses tak bergantung kemampuan bayar.",
              ]}
              icon={Scale}
            />
          </div>

          {/* SDG band */}
          <div className="mt-10 rounded-3xl bg-[#16150F] p-7 md:p-9 text-center">
            <p className="text-xs uppercase tracking-[0.22em] text-[#D2F801] font-bold">Selaras dengan SDGs</p>
            <p className="mt-2 text-[#C9C4B2] text-sm max-w-2xl mx-auto">Applify berkontribusi langsung pada lima Tujuan Pembangunan Berkelanjutan PBB.</p>
            <div className="mt-7 flex flex-wrap justify-center gap-4">
              {sdgs.map((s) => (
                <div key={s.n} className="group flex flex-col items-center gap-2 w-28">
                  <div className="h-16 w-16 rounded-2xl grid place-items-center text-white font-display font-extrabold text-2xl shadow-lg group-hover:scale-105 transition" style={{ background: s.color }}>
                    {s.n}
                  </div>
                  <p className="text-[11px] leading-tight text-[#C9C4B2]">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </ScrollReveal>
  );
}

function PillarCard({ tone, tag, title, points, icon: Icon }: { tone: string; tag: string; title: string; points: string[]; icon: any }) {
  return (
    <div className="rounded-3xl border border-[color:var(--border)] bg-[#FBF9F2] p-7">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-2xl grid place-items-center text-white" style={{ background: tone }}>
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider font-bold" style={{ color: tone }}>{tag}</p>
          <h3 className="font-display text-xl font-bold">{title}</h3>
        </div>
      </div>
      <ul className="mt-5 space-y-3">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-2.5 text-sm">
            <span className="mt-1.5 h-2 w-2 rotate-45 shrink-0" style={{ background: tone }} />
            <span className="text-foreground/80">{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─────────────────────────  Green Career spotlight  ───────────────────────── */

function GreenCareerSpotlight({ authLink }: { authLink: string }) {
  return (
    <ScrollReveal>
      <section className="mx-auto max-w-7xl px-4 py-20 md:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-[color:var(--border)] text-white p-8 md:p-12" style={{ background: "linear-gradient(135deg, #1C9656 0%, #0F6B3D 100%)" }}>
          <div className="absolute -top-16 -right-16 h-56 w-56 rounded-full bg-[#D2F801]/20 blur-3xl" aria-hidden="true" />
          <div className="relative grid gap-8 lg:grid-cols-[1.1fr_0.9fr] items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wider">
                <Leaf className="h-3.5 w-3.5" /> Fitur Premium
              </span>
              <h2 className="mt-5 font-display text-3xl md:text-4xl font-extrabold leading-tight">Green Career Track</h2>
              <p className="mt-4 text-white/85 leading-relaxed max-w-lg">
                Agen menelusuri rekam jejak perusahaan, memprioritaskan <b>green jobs & perusahaan berdampak positif</b>, lalu menjalankan sesi asesmen AI untuk memastikan kamu benar-benar cocok sebelum melamar.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                {["ESG screening otomatis", "Asesmen kesiapan AI", "Prioritas green jobs"].map((t) => (
                  <span key={t} className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3.5 py-1.5 text-sm font-medium">
                    <Check className="h-3.5 w-3.5 text-[#D2F801]" /> {t}
                  </span>
                ))}
              </div>
              <Link to={authLink} className="mt-8 inline-flex h-11 items-center rounded-xl bg-[#D2F801] px-6 text-sm font-semibold text-[#16150F] hover:opacity-90 transition">
                Jelajahi Green Career <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
            <div className="relative">
              <div className="rounded-2xl bg-white/10 border border-white/15 p-5 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Skor Green Company</p>
                  <span className="text-xs font-mono bg-[#D2F801] text-[#16150F] rounded-full px-2 py-0.5 font-bold">GREEN</span>
                </div>
                {[
                  { c: "SolarNusa Energy", s: 92 },
                  { c: "EcoWaste Indonesia", s: 84 },
                  { c: "GreenMobility Co", s: 78 },
                ].map((row) => (
                  <div key={row.c} className="mt-4">
                    <div className="flex items-center justify-between text-sm">
                      <span>{row.c}</span>
                      <span className="font-mono font-bold text-[#D2F801]">{row.s}</span>
                    </div>
                    <div className="mt-1.5 h-2 rounded-full bg-white/15 overflow-hidden">
                      <div className="h-full bg-[#D2F801] rounded-full" style={{ width: `${row.s}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </ScrollReveal>
  );
}

/* ─────────────────────────  Testimonials  ───────────────────────── */

function Testimonials() {
  const reviews = [
    { name: "Dinda Rahmawati", role: "Fresh Graduate — Ekonomi UI", quote: "Setelah 3 bulan nganggur, seminggu pakai Applify langsung dapat 6 callback. Golden Window beneran works!", stat: "+6 callback dalam 7 hari", avatar: 1 as const, tone: "#1C9656" },
    { name: "Reza Firmansyah", role: "Job Seeker · 2 tahun pengalaman", quote: "ATS Collective Intelligence itu killer feature. Akhirnya lolos Shopee setelah 4 kali ditolak — ternyata keyword-nya selama ini salah.", stat: "Dari 0 ke hired di Shopee", avatar: 2 as const, tone: "#0A5BE0" },
    { name: "Anisa Putri", role: "Fresh Grad — Poltek Bandung", quote: "Blind Merit Mode bikin gue pede. Gue dari Poltek, bukan UI/ITB, tapi skill gue akhirnya dilihat duluan.", stat: "Lolos ATS 9/10 lamaran", avatar: 3 as const, tone: "#D9741A" },
  ];
  return (
    <ScrollReveal delay={100}>
      <section className="mx-auto max-w-7xl px-4 py-20 md:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xs uppercase tracking-[0.22em] text-[#D9741A] font-bold">Testimoni</p>
          <h2 className="mt-3 font-display text-3xl md:text-5xl font-extrabold tracking-tight">Mereka sudah merasakan hasilnya.</h2>
          <p className="mt-4 text-muted-foreground text-sm">Dari fresh graduate hingga job seeker berpengalaman.</p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {reviews.map((r) => (
            <div key={r.name} className="glass rounded-3xl p-6 flex flex-col gap-4 hover:-translate-y-1 transition-transform duration-300">
              <Quote className="h-7 w-7 text-[#D2F801]" fill="#D2F801" />
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-[#D9741A] text-[#D9741A]" />
                ))}
              </div>
              <p className="text-sm leading-relaxed text-foreground/80 flex-1">"{r.quote}"</p>
              <div className="rounded-xl border border-[color:var(--border)] bg-[#FBF9F2] p-2.5 text-xs font-semibold font-mono" style={{ color: r.tone }}>
                📈 {r.stat}
              </div>
              <div className="flex items-center gap-3 mt-1 border-t border-[color:var(--border)] pt-4">
                <AvatarIllo variant={r.avatar} />
                <div>
                  <p className="text-sm font-semibold">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </ScrollReveal>
  );
}

/* ─────────────────────────  Pricing  ───────────────────────── */

function Pricing({ authLink }: { authLink: string }) {
  const tiers = [
    { name: "Free", price: "Gratis", per: "selamanya", features: ["10 AI Apply/bulan", "AI Basic (DeepSeek gratis)", "Cover letter standar", "3 platform utama", "Skill radar dasar", "Human approval"] },
    { name: "Pro", price: "Rp 69.000", per: "/bulan", popular: true, features: ["Lamaran tak terbatas", "AI Premium (90% akurasi)", "Semua 7 platform", "Golden Window Sniper", "CV Optimization AI", "Blind Merit Mode", "Green Career Track", "Prioritas dukungan"] },
    { name: "Kampus", price: "Rp 50jt", per: "/semester", features: ["Lisensi B2B2C kampus", "Dashboard karier kampus", "Semua fitur Pro untuk mahasiswa", "Laporan penempatan kerja", "Onboarding & pelatihan", "Co-branding"] },
  ];
  return (
    <ScrollReveal delay={100}>
      <section id="harga" className="mx-auto max-w-7xl px-4 py-20 md:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xs uppercase tracking-[0.22em] text-[#0A5BE0] font-bold">Harga</p>
          <h2 className="mt-3 font-display text-3xl md:text-5xl font-extrabold tracking-tight">Mulai gratis, upgrade saat siap.</h2>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3 md:items-stretch">
          {tiers.map((t) => (
            <div key={t.name} className={`relative glass rounded-3xl p-7 flex flex-col ${t.popular ? "md:scale-[1.04] ring-2 ring-[#0A5BE0]" : ""}`}>
              {t.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#0A5BE0] text-white text-xs font-bold px-3 py-1 rounded-full">PALING POPULER</span>}
              <h3 className="font-display text-lg font-bold text-muted-foreground">{t.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="font-display text-4xl font-extrabold">{t.price}</span>
                <span className="text-sm text-muted-foreground">{t.per}</span>
              </div>
              <ul className="mt-6 space-y-3 flex-1">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-[#1C9656] mt-0.5 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link to={authLink} className={`mt-7 inline-flex justify-center items-center h-11 rounded-xl text-sm font-semibold transition ${t.popular ? "bg-[#16150F] text-[#F4F1E8] hover:bg-black" : "border border-[color:var(--border)] bg-white hover:bg-black/[3%]"}`}>
                {t.name === "Free" ? "Mulai Gratis" : t.name === "Kampus" ? "Hubungi Kami" : "Pilih Paket"}
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">Harga final mengikuti proposal bisnis · margin kontribusi Pro 91% · BEP ±159 pengguna Pro/bulan.</p>
      </section>
    </ScrollReveal>
  );
}

/* ─────────────────────────  Behind Applify  ───────────────────────── */

function BehindApplify() {
  return (
    <ScrollReveal>
      <section className="bg-white border-y border-[color:var(--border)]">
        <div className="mx-auto max-w-5xl px-4 py-20 md:px-8 text-center">
          <p className="text-xs uppercase tracking-[0.22em] text-[#1C9656] font-bold">Dibalik Applify</p>
          <h2 className="mt-3 font-display text-3xl md:text-4xl font-extrabold tracking-tight">Dibuat untuk pencari kerja Indonesia.</h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Applify dikembangkan oleh tim mahasiswa yang percaya teknologi AI seharusnya menutup kesenjangan — bukan memperlebarnya. Proyek ini lahir sebagai inisiatif kewirausahaan kampus dan terus dikembangkan menjadi produk nyata.
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-3 max-w-3xl mx-auto">
            {[
              { icon: GraduationCap, t: "Berbasis riset kampus", d: "Lahir dari program kewirausahaan & business plan." },
              { icon: BadgeCheck, t: "Produk nyata", d: "Bukan sekadar prototipe — AI & otomasi sudah berjalan." },
              { icon: Globe, t: "Fokus Indonesia", d: "Dirancang untuk pasar & platform kerja lokal." },
            ].map((c) => (
              <div key={c.t} className="rounded-2xl border border-[color:var(--border)] bg-[#FBF9F2] p-6">
                <div className="mx-auto h-11 w-11 rounded-xl bg-[#16150F] grid place-items-center text-[#D2F801]">
                  <c.icon className="h-5 w-5" />
                </div>
                <p className="mt-3 font-display font-bold">{c.t}</p>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </ScrollReveal>
  );
}

/* ─────────────────────────  Final CTA  ───────────────────────── */

function FinalCTA({ authLink }: { authLink: string }) {
  return (
    <ScrollReveal delay={50}>
      <section className="relative mx-auto max-w-7xl px-4 py-20 md:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-[#16150F] p-10 md:p-16 text-center">
          <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-[#0A5BE0]/25 blur-3xl" aria-hidden="true" />
          <div className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-[#D2F801]/15 blur-3xl" aria-hidden="true" />
          <div className="relative">
            <AgentMascot className="h-16 w-16 mx-auto" />
            <h2 className="mt-6 font-display text-3xl md:text-5xl font-extrabold tracking-tight max-w-2xl mx-auto text-[#F4F1E8]">
              Sudah saatnya AI bekerja untuk <span className="text-[#D2F801]">kariermu.</span>
            </h2>
            <p className="mt-4 text-[#C9C4B2] max-w-xl mx-auto">Gabung 12.400+ pencari kerja Indonesia yang sudah membiarkan agen melakukan kerja berat.</p>
            <Link to={authLink} className="mt-8 inline-flex h-14 items-center rounded-2xl bg-[#D2F801] px-8 text-base font-semibold text-[#16150F] hover:opacity-90 transition">
              Aktifkan Agen Sekarang <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>
    </ScrollReveal>
  );
}

/* ─────────────────────────  Footer  ───────────────────────── */

function Footer() {
  return (
    <footer className="border-t border-[color:var(--border)] mt-10 pb-24 md:pb-10">
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-8 grid gap-8 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2.5">
            <AgentMark size={32} />
            <span className="font-display font-extrabold">Applify</span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground max-w-xs">Agen AI Otonom untuk akses kerja yang setara. Apply Smarter. Fairer. Together.</p>
        </div>
        {[
          { h: "Produk", l: ["Fitur", "Harga", "Green Career", "Roadmap"] },
          { h: "Perusahaan", l: ["Tentang", "Dampak & SDG", "Blog", "Kontak"] },
          { h: "Sosial", l: ["Twitter", "LinkedIn", "Instagram", "Discord"] },
        ].map((c) => (
          <div key={c.h}>
            <p className="text-sm font-display font-bold mb-3">{c.h}</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {c.l.map((x) => <li key={x}><a className="hover:text-foreground transition" href="#">{x}</a></li>)}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground">© 2026 Applify. Dibuat di Indonesia 🇮🇩</p>
    </footer>
  );
}

function MobileStickyBar({ authLink }: { authLink: string }) {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass-strong px-4 py-3 flex gap-2">
      <Link to={authLink} className="flex-1 h-11 rounded-xl border border-[color:var(--border)] bg-white grid place-items-center text-sm font-semibold hover:bg-black/[3%] transition">Masuk</Link>
      <Link to={authLink} className="flex-[2] h-11 rounded-xl bg-[#16150F] grid place-items-center text-sm font-semibold text-[#F4F1E8] hover:bg-black transition">Aktifkan Agen Gratis</Link>
    </div>
  );
}

/* ─────────────────────────  Illustrations  ───────────────────────── */

function StepIllo({ step }: { step: 1 | 2 | 3 }) {
  if (step === 1) return (
    <svg viewBox="0 0 120 90" className="w-32 h-24 mx-auto mb-2" aria-hidden="true">
      <ellipse cx="60" cy="83" rx="30" ry="5" fill="rgba(10,91,224,0.10)" />
      <rect x="28" y="8" width="64" height="74" rx="8" fill="#FFFFFF" stroke="rgba(10,91,224,0.35)" strokeWidth="1.5" />
      {[24, 33, 42, 51, 60].map((y, i) => (
        <line key={i} x1="38" y1={y} x2={i === 2 || i === 4 ? 66 : 82} y2={y} stroke="rgba(22,21,15,0.14)" strokeWidth="2" strokeLinecap="round" />
      ))}
      <circle cx="95" cy="62" r="8" fill="rgba(10,91,224,0.22)" stroke="rgba(10,91,224,0.5)" strokeWidth="1.5" />
      <path d="M89 78 Q95 70 101 78" fill="rgba(10,91,224,0.22)" stroke="rgba(10,91,224,0.5)" strokeWidth="1.5" />
      <path d="M12 20 L13.5 16 L15 20 L19 21.5 L15 23 L13.5 27 L12 23 L8 21.5 Z" fill="#0A5BE0" opacity="0.85" />
      <path d="M106 55 L107 52.5 L108 55 L110.5 56 L108 57 L107 59.5 L106 57 L103.5 56 Z" fill="#1C9656" opacity="0.8" />
      <path d="M60 5 L60 0" stroke="#0A5BE0" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M55 4 L60 0 L65 4" stroke="#0A5BE0" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  if (step === 2) return (
    <svg viewBox="0 0 120 90" className="w-32 h-24 mx-auto mb-2" aria-hidden="true">
      {([
        [12, 14, "L", "#0A5BE0"], [108, 14, "J", "#E8192C"], [8, 56, "G", "#1C9656"], [112, 56, "K", "#D9741A"], [60, 82, "D", "#16150F"],
      ] as [number, number, string, string][]).map(([x, y, label, color]) => (
        <g key={label}>
          <circle cx={x} cy={y} r="12" fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1.2" strokeOpacity="0.5" />
          <text x={x} y={y + 4} textAnchor="middle" fontSize="9" fontWeight="bold" fill={color}>{label}</text>
        </g>
      ))}
      {([[42, 34, 24, 22], [78, 34, 96, 22], [42, 52, 20, 54], [78, 52, 100, 54], [60, 63, 60, 70]] as [number, number, number, number][]).map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(22,21,15,0.12)" strokeWidth="1.5" strokeDasharray="3 2" />
      ))}
      <rect x="40" y="26" width="40" height="38" rx="9" fill="#D2F801" stroke="#16150F" strokeWidth="1.5" />
      <rect x="48" y="35" width="9" height="7" rx="2.5" fill="#16150F" />
      <rect x="63" y="35" width="9" height="7" rx="2.5" fill="#16150F" />
      <path d="M50 53 Q60 59 70 53" stroke="#16150F" strokeWidth="2" fill="none" strokeLinecap="round" />
      <line x1="60" y1="26" x2="60" y2="19" stroke="#16150F" strokeWidth="2" />
      <circle cx="60" cy="17" r="3.5" fill="#0A5BE0" />
    </svg>
  );
  return (
    <svg viewBox="0 0 120 90" className="w-32 h-24 mx-auto mb-2" aria-hidden="true">
      <rect x="22" y="18" width="76" height="60" rx="9" fill="#FFFFFF" stroke="rgba(28,150,86,0.4)" strokeWidth="1.5" />
      <rect x="22" y="18" width="76" height="22" rx="9" fill="#1C9656" />
      <rect x="22" y="30" width="76" height="10" fill="#1C9656" />
      <rect x="38" y="12" width="6" height="12" rx="3" fill="#D2F801" />
      <rect x="76" y="12" width="6" height="12" rx="3" fill="#D2F801" />
      <circle cx="60" cy="57" r="15" fill="rgba(28,150,86,0.12)" stroke="#1C9656" strokeWidth="2.2" />
      <path d="M52 57 L58 63 L70 51" stroke="#1C9656" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {([[16, 28, "#D2F801"], [104, 26, "#0A5BE0"], [14, 60, "#1C9656"], [106, 62, "#D9741A"], [20, 80, "#0A5BE0"], [100, 80, "#D9741A"]] as [number, number, string][]).map(([cx, cy, fill], i) => (
        <circle key={i} cx={cx} cy={cy} r="3.5" fill={fill} opacity="0.85" />
      ))}
    </svg>
  );
}

function AvatarIllo({ variant }: { variant: 1 | 2 | 3 }) {
  if (variant === 1) return (
    <svg viewBox="0 0 56 56" className="w-12 h-12 shrink-0" aria-hidden="true">
      <circle cx="28" cy="28" r="28" fill="rgba(28,150,86,0.14)" />
      <ellipse cx="28" cy="19" rx="13" ry="9.5" fill="#1C9656" />
      <ellipse cx="28" cy="27" rx="12.5" ry="13" fill="#FDDBB4" />
      <circle cx="23" cy="26" r="2.2" fill="#16150F" /><circle cx="33" cy="26" r="2.2" fill="#16150F" />
      <path d="M23 32 Q28 37.5 33 32" stroke="#c47a5a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M15 55 Q28 47 41 55" fill="#1C9656" opacity="0.8" />
    </svg>
  );
  if (variant === 2) return (
    <svg viewBox="0 0 56 56" className="w-12 h-12 shrink-0" aria-hidden="true">
      <circle cx="28" cy="28" r="28" fill="rgba(10,91,224,0.14)" />
      <ellipse cx="28" cy="17" rx="13" ry="8" fill="#16150F" />
      <ellipse cx="28" cy="27" rx="12.5" ry="13" fill="#F5CBA7" />
      <circle cx="23" cy="25" r="2.2" fill="#16150F" /><circle cx="33" cy="25" r="2.2" fill="#16150F" />
      <path d="M23 32 Q28 36.5 33 32" stroke="#c47a5a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M15 55 Q28 47 41 55" fill="#0A5BE0" opacity="0.8" />
    </svg>
  );
  return (
    <svg viewBox="0 0 56 56" className="w-12 h-12 shrink-0" aria-hidden="true">
      <circle cx="28" cy="28" r="28" fill="rgba(217,116,26,0.16)" />
      <path d="M14 22 Q14 8 28 7 Q42 8 42 22" fill="#3d2108" />
      <ellipse cx="28" cy="27" rx="12.5" ry="13" fill="#FDDBB4" />
      <circle cx="23" cy="26" r="2.2" fill="#16150F" /><circle cx="33" cy="26" r="2.2" fill="#16150F" />
      <path d="M23 32 Q28 37.5 33 32" stroke="#c47a5a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M15 55 Q28 47 41 55" fill="#D9741A" opacity="0.85" />
    </svg>
  );
}

function RadarMini() {
  return (
    <svg viewBox="0 0 200 200" className="w-44 h-44 shrink-0">
      {[80, 60, 40, 20].map((r) => <polygon key={r} points={pentagon(100, 100, r)} fill="none" stroke="rgba(22,21,15,0.10)" />)}
      <polygon points={pentagon(100, 100, 80)} fill="none" stroke="rgba(22,21,15,0.12)" strokeDasharray="3 3" />
      <polygon points="100,30 170,75 145,150 60,155 35,80" fill="rgba(10,91,224,0.15)" stroke="#0A5BE0" strokeWidth="2" />
      {["100,30", "170,75", "145,150", "60,155", "35,80"].map((p, i) => {
        const [cx, cy] = p.split(",").map(Number);
        return <circle key={i} cx={cx} cy={cy} r="3.5" fill="#0A5BE0" />;
      })}
    </svg>
  );
}

function pentagon(cx: number, cy: number, r: number) {
  return Array.from({ length: 5 }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(" ");
}
