import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Sparkles, Zap, Brain, Radar, EyeOff, ArrowRight, Check, Rocket, Bot,
  CalendarCheck, Star, LogIn, UserPlus, Search, Send, Leaf,
  TrendingUp, Scale, Globe, Clock, BadgeCheck, Quote, Briefcase, GraduationCap,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type SVGProps } from "react";
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
              <button onClick={signOut} className="hidden md:inline-flex h-9 items-center rounded-lg border-2 border-[color:var(--border)] bg-black/[3%] px-4 text-sm font-medium hover:bg-black/[6%] transition">
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
            <a href="#cara-kerja" className="inline-flex h-12 items-center rounded-xl border-2 border-[color:var(--border)] bg-white px-6 text-sm font-semibold hover:bg-black/[3%] transition">
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

/* ── Hero "Agent Workspace" live panel (ported from hero v4 design) ──
   The transparency layer: 4 auto-cycling scenes showing the autonomous
   agent scraping → writing → submitting → preparing interviews. */
type HSvg = SVGProps<SVGSVGElement>;
const HIcons = {
  Bot: (p: HSvg) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" /></svg>
  ),
  Search: (p: HSvg) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
  ),
  PenTool: (p: HSvg) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m12 19 7-7 3 3-7 7-3-3z" /><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="m2 2 7.586 7.586" /><circle cx="11" cy="11" r="2" /></svg>
  ),
  UploadCloud: (p: HSvg) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" /><path d="M12 12v9" /><path d="m16 16-4-4-4 4" /></svg>
  ),
  CheckCircle: (p: HSvg) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></svg>
  ),
  MessageSquare: (p: HSvg) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
  ),
  Briefcase: (p: HSvg) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect width="20" height="14" x="2" y="7" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
  ),
  Sparkles: (p: HSvg) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /></svg>
  ),
  FileUp: (p: HSvg) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M12 12v6" /><path d="m15 15-3-3-3 3" /></svg>
  ),
  Check: (p: HSvg) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="20 6 9 17 4 12" /></svg>
  ),
  Mail: (p: HSvg) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
  ),
  Radar: (p: HSvg) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M19.07 4.93A10 10 0 0 0 6.99 3.34" /><path d="M4 6h.01" /><path d="M2.29 9.62A10 10 0 1 0 21.31 8.35" /><path d="M16.24 7.76A6 6 0 1 0 8.23 16.67" /><path d="M12 18h.01" /><path d="M17.99 11.66A6 6 0 0 1 15.77 16.67" /><circle cx="12" cy="12" r="2" /></svg>
  ),
};

function SceneScraping() {
  return (
    <div className="absolute inset-0 w-full h-full p-6 flex flex-col justify-center items-center">
      <div className="flex justify-between items-center w-full mb-4 opacity-80">
        <span className="font-sans text-xs font-bold text-neutral-500 uppercase tracking-wider">Mengekstrak Syarat Loker</span>
        <span className="font-display text-xs font-bold text-brand-lime flex items-center gap-1 animate-pulseGlow">
          <HIcons.Search /> Reading...
        </span>
      </div>
      <div className="relative w-full max-w-[200px] bg-white border border-neutral-200 rounded-lg shadow-sm p-4 text-left overflow-hidden">
        <div className="w-3/4 h-2.5 bg-neutral-200 rounded mb-4" />
        <div className="space-y-3.5">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-neutral-300 flex-shrink-0" />
            <div className="h-2 bg-neutral-100 rounded w-full flex items-center relative">
              <div className="absolute left-[20%] w-[35%] h-2.5 bg-neutral-200 rounded animate-popWord1 shadow-sm origin-left" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-neutral-300 flex-shrink-0" />
            <div className="h-2 bg-neutral-100 rounded w-[90%] flex items-center relative">
              <div className="absolute left-[30%] w-[45%] h-2.5 bg-neutral-200 rounded animate-popWord2 shadow-sm origin-left" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-neutral-300 flex-shrink-0" />
            <div className="h-2 bg-neutral-100 rounded w-[75%] flex items-center relative">
              <div className="absolute left-[10%] w-[50%] h-2.5 bg-neutral-200 rounded animate-popWord3 shadow-sm origin-left" />
            </div>
          </div>
        </div>
        <div className="absolute top-9 left-3 w-10 h-10 border-2 border-brand-lime bg-lime-50/20 backdrop-blur-[2px] rounded-full shadow-[0_0_15px_rgba(163,230,53,0.5)] animate-magnifyMove flex items-center justify-center pointer-events-none z-10">
          <div className="w-1 h-1 bg-brand-lime rounded-full shadow-sm" />
          <div className="absolute top-2 bottom-2 w-[1px] bg-brand-lime/40" />
          <div className="absolute left-2 right-2 h-[1px] bg-brand-lime/40" />
          <div className="absolute -bottom-2 -right-2 w-3.5 h-1.5 bg-neutral-700 rotate-45 rounded-sm" />
        </div>
      </div>
    </div>
  );
}

function SceneWriting() {
  return (
    <div className="absolute inset-0 w-full h-full p-6 flex flex-col justify-center items-center">
      <div className="flex justify-between items-center w-full mb-4 opacity-80">
        <span className="font-sans text-xs font-bold text-neutral-500 uppercase tracking-wider">Menyesuaikan CV</span>
        <span className="font-display text-xs font-bold text-neutral-800 flex items-center gap-1">
          <HIcons.PenTool /> Tailoring...
        </span>
      </div>
      <div className="w-full max-w-[200px] h-[225px] bg-white border border-neutral-200 rounded-lg shadow-sm p-4 flex flex-col relative overflow-hidden">
        <div className="absolute top-3 right-3">
          <HIcons.Sparkles className="w-3.5 h-3.5 text-brand-lime animate-pulseGlow" />
        </div>
        <div className="flex gap-2 mb-3 items-center">
          <div className="w-7 h-7 rounded-full bg-neutral-200 opacity-0 animate-popIn" style={{ animationDelay: "0s" }} />
          <div className="space-y-1.5 flex-grow">
            <div className="w-[80%]"><div className="h-2 bg-neutral-800 rounded w-0 animate-typeLine" style={{ animationDelay: "0.1s" }} /></div>
            <div className="w-[50%]"><div className="h-1.5 bg-neutral-300 rounded w-0 animate-typeLine" style={{ animationDelay: "0.2s" }} /></div>
          </div>
        </div>
        <div className="w-full h-px bg-neutral-100 mb-3 opacity-0 animate-popIn" style={{ animationDelay: "0.3s" }} />
        <div className="flex flex-col gap-2.5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1 w-full">
              <div className="w-[40%]"><div className="h-1.5 bg-neutral-700 rounded w-0 animate-typeLine" style={{ animationDelay: "0.4s" }} /></div>
              <div className="w-[25%] h-1.5 bg-brand-lime rounded opacity-0 animate-popIn shadow-[0_0_5px_rgba(163,230,53,0.5)]" style={{ animationDelay: "0.6s" }} />
              <div className="w-[30%]"><div className="h-1.5 bg-neutral-700 rounded w-0 animate-typeLine" style={{ animationDelay: "0.7s" }} /></div>
            </div>
            <div className="w-[85%]"><div className="h-1.5 bg-neutral-700 rounded w-0 animate-typeLine" style={{ animationDelay: "0.9s" }} /></div>
          </div>
          <div className="space-y-2 pl-2 border-l-2 border-neutral-100 mt-1">
            <div className="flex items-center gap-1 w-full">
              <div className="w-[20%] h-1.5 bg-teal-400 rounded opacity-0 animate-popIn shadow-[0_0_5px_rgba(45,212,191,0.5)]" style={{ animationDelay: "1.1s" }} />
              <div className="w-[40%]"><div className="h-1.5 bg-neutral-700 rounded w-0 animate-typeLine" style={{ animationDelay: "1.2s" }} /></div>
              <div className="w-[15%] h-1.5 bg-indigo-400 rounded opacity-0 animate-popIn shadow-[0_0_5px_rgba(129,140,248,0.5)]" style={{ animationDelay: "1.4s" }} />
            </div>
            <div className="flex items-center gap-1 w-full">
              <div className="w-[25%] h-1.5 bg-teal-400 rounded opacity-0 animate-popIn shadow-[0_0_5px_rgba(45,212,191,0.5)]" style={{ animationDelay: "1.6s" }} />
              <div className="w-[30%]"><div className="h-1.5 bg-neutral-700 rounded w-0 animate-typeLine" style={{ animationDelay: "1.7s" }} /></div>
              <div className="w-[25%] h-1.5 bg-brand-lime rounded opacity-0 animate-popIn" style={{ animationDelay: "1.9s" }} />
            </div>
          </div>
          <div className="flex gap-1.5 mt-1.5">
            <div className="h-4 w-10 bg-lime-100 border border-lime-400 rounded opacity-0 animate-popIn" style={{ animationDelay: "2.1s" }} />
            <div className="h-4 w-12 bg-teal-100 border border-teal-400 rounded opacity-0 animate-popIn" style={{ animationDelay: "2.2s" }} />
            <div className="h-4 w-14 bg-indigo-100 border border-indigo-400 rounded opacity-0 animate-popIn" style={{ animationDelay: "2.3s" }} />
          </div>
        </div>
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap bg-neutral-900 px-3 py-1.5 rounded-full flex items-center gap-1 shadow-lg opacity-0 animate-popIn z-20" style={{ animationDelay: "2.6s" }}>
          <HIcons.CheckCircle className="w-3.5 h-3.5 text-brand-lime" />
          <span className="font-sans text-[10px] font-bold text-white tracking-wide uppercase">ATS Optimized</span>
        </div>
      </div>
    </div>
  );
}

function SceneUploading() {
  return (
    <div className="absolute inset-0 w-full h-full p-6 flex flex-col justify-center items-center">
      <div className="w-full bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden flex flex-col">
        <div className="h-6 bg-neutral-100 border-b border-neutral-200 flex items-center px-2 gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-400" />
          <div className="w-2 h-2 rounded-full bg-yellow-400" />
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <div className="ml-2 h-3 bg-white w-1/2 rounded border border-neutral-200" />
        </div>
        <div className="p-4 flex flex-col items-center justify-center relative h-32">
          <div className="w-12 h-12 bg-neutral-50 rounded-xl border border-neutral-100 flex items-center justify-center mb-3">
            <HIcons.UploadCloud className="w-6 h-6 text-neutral-400" />
          </div>
          <div className="absolute top-6 w-8 h-10 bg-white border border-brand-lime rounded shadow-sm animate-flyUp flex flex-col p-1 gap-0.5">
            <div className="h-1 bg-neutral-200 w-full rounded" />
            <div className="h-1 bg-brand-lime w-3/4 rounded" />
          </div>
          <div className="w-full max-w-[150px] space-y-1">
            <div className="flex justify-between text-[9px] font-sans text-neutral-500 font-semibold">
              <span>Submitting...</span>
              <span>Success</span>
            </div>
            <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden">
              <div className="h-full bg-brand-lime rounded-full animate-progressFill" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SceneInterview() {
  return (
    <div className="absolute inset-0 w-full h-full p-6 flex flex-col justify-center items-center">
      <div className="flex justify-between items-center w-full mb-5 opacity-80">
        <span className="font-sans text-xs font-bold text-neutral-500 uppercase tracking-wider">Menyiapkan Interview</span>
        <span className="font-display text-xs font-bold text-neutral-800 flex items-center gap-1">
          <HIcons.Briefcase className="w-3.5 h-3.5" /> Pipeline Sync...
        </span>
      </div>
      <div className="relative w-[280px] flex gap-2">
        {["Applied", "AI Prep", "Ready"].map((col, i) => (
          <div key={col} className="w-[88px] h-[160px] bg-neutral-100 rounded-xl p-1.5 flex flex-col gap-1.5 border border-neutral-200/60 shadow-inner">
            <div className="text-[9px] font-sans font-bold text-neutral-400 uppercase tracking-widest text-center mt-0.5 mb-1">{col}</div>
            {i === 0 && <div className="w-full h-10 bg-white rounded border border-neutral-200 opacity-60" />}
            {i === 2 && (
              <>
                <div className="w-full h-10 bg-brand-lime/10 rounded border border-brand-lime/30 opacity-70" />
                <div className="w-full h-10 bg-white rounded border border-neutral-200 opacity-40" />
              </>
            )}
          </div>
        ))}
        <div className="absolute top-[34px] left-[6px] w-[76px] h-12 bg-white rounded-md border border-neutral-200 shadow-sm flex flex-col justify-center px-2 gap-1.5 animate-kanbanDrag z-10 origin-center cursor-grab">
          <div className="h-1.5 bg-neutral-300 w-3/4 rounded-full" />
          <div className="h-1.5 bg-neutral-200 w-1/2 rounded-full" />
          <div className="absolute inset-0 flex items-center justify-center bg-white/90 backdrop-blur-[1px] rounded-md opacity-0 animate-kanbanSparkle">
            <HIcons.Sparkles className="w-5 h-5 text-brand-lime drop-shadow-md" />
          </div>
          <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-brand-lime rounded-full flex items-center justify-center opacity-0 animate-kanbanCheck shadow-md">
            <HIcons.CheckCircle className="w-3 h-3 text-lime-900" />
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentLivePanel() {
  const [activeScene, setActiveScene] = useState(0);
  const steps = [
    { id: 0, label: "Memindai Portal", icon: HIcons.Search },
    { id: 1, label: "Menulis CV ATS", icon: HIcons.PenTool },
    { id: 2, label: "Auto Submit", icon: HIcons.UploadCloud },
    { id: 3, label: "Interview Prep", icon: HIcons.MessageSquare },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveScene((prev) => (prev + 1) % steps.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [steps.length]);

  return (
    <div className="relative w-full max-w-md mx-auto perspective-1000">
      <div className="absolute top-1/4 -left-10 w-64 h-64 bg-lime-300 rounded-full mix-blend-multiply blur-[64px] opacity-60 animate-blob" />
      <div className="absolute bottom-1/4 -right-10 w-64 h-64 bg-blue-200 rounded-full mix-blend-multiply blur-[64px] opacity-60 animate-blob animation-delay-2000" />

      <div className="relative glass-panel rounded-3xl shadow-2xl overflow-hidden flex flex-col z-10">
        <div className="flex justify-between items-center px-6 py-5 bg-white/50 border-b border-white/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-neutral-900 text-brand-lime rounded-xl shadow-inner animate-botIdle">
              <HIcons.Bot />
            </div>
            <div>
              <h3 className="font-display font-bold text-sm text-neutral-900 leading-tight">Agent Workspace</h3>
              <p className="font-sans text-[10px] text-neutral-500 uppercase tracking-widest font-semibold">Autonomous Mode</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 bg-lime-100 border border-lime-200 rounded-full">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-lime-600" />
            </span>
            <span className="font-sans text-[10px] font-extrabold text-lime-800 tracking-wider">LIVE</span>
          </div>
        </div>

        <div className="relative h-[270px] bg-neutral-50/50 w-full overflow-hidden">
          {[SceneScraping, SceneWriting, SceneUploading, SceneInterview].map((Scene, idx) => (
            <div key={idx} className={`transition-all duration-700 ease-in-out absolute inset-0 flex items-center justify-center ${activeScene === idx ? "opacity-100 z-10 scale-100" : "opacity-0 z-0 scale-95"}`}>
              {activeScene === idx && <Scene />}
            </div>
          ))}
        </div>

        <div className="bg-white px-6 py-5 flex justify-between items-center relative">
          <div className="absolute top-1/2 left-10 right-10 h-0.5 bg-neutral-100 -translate-y-1/2 z-0" />
          {steps.map((step, index) => {
            const isActive = index === activeScene;
            const isPast = index < activeScene;
            const StepIcon = step.icon;
            return (
              <div key={step.id} className="relative z-10 flex flex-col items-center gap-1.5 group">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500 border-2 ${
                  isActive ? "bg-brand-lime border-brand-lime text-neutral-900 scale-110 shadow-lg shadow-lime-500/30" :
                  isPast ? "bg-neutral-900 border-neutral-900 text-white" : "bg-white border-neutral-200 text-neutral-300"
                }`}>
                  {isPast ? <HIcons.CheckCircle className="w-4 h-4" /> : <StepIcon className="w-4 h-4" />}
                </div>
                <span className={`text-[9px] font-sans font-bold text-center absolute -bottom-5 w-20 transition-colors ${
                  isActive ? "text-neutral-900" : isPast ? "text-neutral-600" : "text-neutral-300"
                }`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
        <div className="h-6 bg-white" />
      </div>
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
  const nodes = [
    { pos: "top-[80px] left-[20px] -translate-x-[100%] -translate-y-1/2 pr-2", d: "mf-d1", e: "♻️", t: "Net-Zero", dark: true },
    { pos: "top-[45px] left-[45px] -translate-x-[100%] -translate-y-[100%] pr-1 pb-1", d: "mf-d2", e: "🤝", t: "Fair Pay", dark: true },
    { pos: "top-[25px] left-[75px] -translate-x-[50%] -translate-y-[100%] pb-1.5", d: "mf-d3", e: "🌿", t: "ESG+", dark: true },
    { pos: "top-[15px] left-[125px] -translate-x-[50%] -translate-y-[100%] pb-1.5", d: "mf-d4", e: "🔋", t: "Clean Tech", dark: false },
    { pos: "top-[30px] left-[175px] -translate-x-[50%] -translate-y-[100%] pb-1.5", d: "mf-d3", e: "📉", t: "Low Carbon", dark: true },
    { pos: "top-[50px] left-[200px] -translate-y-[100%] pl-1 pb-1", d: "mf-d2", e: "⚖️", t: "Equity", dark: true },
    { pos: "top-[90px] left-[220px] -translate-y-[50%] pl-2", d: "mf-d1", e: "👁️", t: "Transparent", dark: true },
  ];
  const ecoPaths = [
    "M 120,170 C 105,150 115,120 90,105 C 65,90 40,110 20,80",
    "M 120,170 C 110,145 130,115 100,95 C 70,75 60,65 45,45",
    "M 120,170 C 115,140 105,110 105,90 C 105,70 90,45 75,25",
    "M 120,170 C 130,135 105,100 125,70 C 140,40 115,30 125,15",
    "M 120,170 C 125,145 135,115 135,90 C 135,65 155,50 175,30",
    "M 120,170 C 115,140 150,115 145,95 C 140,75 175,70 200,50",
    "M 120,170 C 125,150 145,120 155,105 C 165,90 195,110 220,90",
  ];
  const drawDelays = ["mf-d0", "mf-d1", "mf-d2", "mf-d3", "mf-d2", "mf-d1", "mf-d0"];

  return (
    <ScrollReveal>
      <section id="tentang" className="mx-auto max-w-7xl px-4 py-20 md:py-24 md:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:h-[600px]">

          {/* Box 1: Typography */}
          <div className="lg:col-span-5 flex flex-col justify-center p-8 lg:p-10 bg-white rounded-[2rem] border border-neutral-200 shadow-sm h-full relative overflow-hidden">
            <div className="inline-flex mb-8 self-start">
              <span className="bg-brand-dark text-white px-3 py-1 rounded-full font-sans text-[10px] font-bold uppercase tracking-widest border border-neutral-700">
                Manifesto
              </span>
            </div>
            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold text-neutral-900 leading-[1.1] tracking-tight">
              Karier Anda ditentukan oleh <span className="text-brand-lime bg-brand-dark px-2 pt-1 pb-0.5 rounded-md inline-block leading-none align-bottom">skill.</span>
            </h2>
            <div className="font-display text-xl sm:text-2xl font-bold text-neutral-400 mt-6 leading-snug space-y-2">
              <p className="line-through decoration-neutral-300 decoration-4">Bukan nama belakang.</p>
              <p className="line-through decoration-neutral-300 decoration-4">Bukan waktu luang.</p>
              <p className="line-through decoration-neutral-300 decoration-4">Bukan almamater.</p>
            </div>
            <p className="mt-8 font-sans text-base text-neutral-600 leading-relaxed font-medium">
              Kami mendemokratisasi akses ke pasar kerja melalui agen AI otonom, memastikan peluang kerja dinilai berdasarkan merit, bukan bias.
            </p>
          </div>

          {/* Box 2: Visuals Area */}
          <div className="lg:col-span-7 grid grid-rows-2 grid-cols-2 gap-6 h-full">

            {/* Visual A: Otonom */}
            <div className="col-span-2 row-span-1 bg-brand-paper border border-neutral-200 rounded-[2rem] p-6 shadow-inner flex overflow-hidden relative min-h-[250px]">
              <div className="absolute inset-0 bg-cyber-grid opacity-50 z-0" />
              <div className="z-10 w-1/2 flex flex-col justify-between">
                <div>
                  <h3 className="font-display text-xl font-bold text-neutral-900">Otonom &amp; End-to-End</h3>
                  <p className="font-sans text-sm text-neutral-500 mt-1 pr-4">Mesin pintar yang bergerak dalam loop tak henti.</p>
                </div>
                <div className="mt-4 bg-white/80 backdrop-blur-sm border border-neutral-200 rounded-lg p-3 w-48 shadow-sm">
                  <div className="flex items-center gap-1.5 mb-2 border-b border-neutral-100 pb-1">
                    <div className="w-2 h-2 bg-brand-lime rounded-full animate-pulse" />
                    <span className="text-[9px] font-display font-bold text-neutral-800 uppercase tracking-widest">Live Agent Log</span>
                  </div>
                  <div className="flex flex-col gap-1 text-[9px] font-mono text-neutral-500">
                    <div className="animate-logFade mf-d1">&gt; Fetching 430 jobs...</div>
                    <div className="animate-logFade mf-d2">&gt; Matching skills...</div>
                    <div className="animate-logFade mf-d3">&gt; Optimizing ATS...</div>
                    <div className="animate-logFade mf-d4 font-bold text-brand-lime">&gt; Sent apps successfully.</div>
                  </div>
                </div>
              </div>
              <div className="absolute right-12 top-1/2 -translate-y-1/2 w-48 h-48 flex items-center justify-center z-10">
                <div className="w-14 h-14 bg-brand-dark rounded-xl border-2 border-brand-lime flex items-center justify-center text-brand-lime z-20 shadow-[0_0_20px_rgba(163,230,53,0.3)]">
                  <HIcons.Bot />
                </div>
                <div className="absolute inset-0 rounded-full border-2 border-dashed border-neutral-300 animate-spin-slow" />
                <div className="absolute w-10 h-10 bg-white border border-neutral-200 rounded-full flex items-center justify-center text-neutral-600 shadow-sm z-30 animate-orbit1"><HIcons.Search /></div>
                <div className="absolute w-10 h-10 bg-white border border-neutral-200 rounded-full flex items-center justify-center text-neutral-600 shadow-sm z-30 animate-orbit2"><HIcons.PenTool /></div>
                <div className="absolute w-10 h-10 bg-white border border-neutral-200 rounded-full flex items-center justify-center text-neutral-600 shadow-sm z-30 animate-orbit3"><HIcons.FileUp /></div>
              </div>
            </div>

            {/* Visual B: Adil */}
            <div className="col-span-1 row-span-1 bg-white border border-neutral-200 rounded-[2rem] p-6 flex flex-col relative overflow-hidden min-h-[250px]">
              <div className="z-10 mb-2">
                <h3 className="font-display text-lg font-bold text-neutral-900">Blind Merit Mode</h3>
                <p className="font-sans text-xs text-neutral-500 mt-1">Meratakan hierarki bias.</p>
              </div>
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-48 h-[100px] flex items-end justify-center gap-5 border-b-2 border-neutral-100 pb-1">
                <div className="absolute left-0 right-0 h-0.5 bg-brand-lime shadow-[0_0_8px_#A3E635] z-30 animate-scanner" />
                <div className="w-8 relative flex flex-col justify-end items-center">
                  <div className="w-full bg-neutral-800 rounded-t absolute bottom-0 z-10 animate-biasBar1" />
                  <div className="w-full bg-brand-lime rounded-t absolute bottom-0 z-20 shadow-[0_0_10px_rgba(163,230,53,0.5)] animate-skillBar1" />
                </div>
                <div className="w-8 relative flex flex-col justify-end items-center">
                  <div className="w-full bg-neutral-800 rounded-t absolute bottom-0 z-10 animate-biasBar2" />
                  <div className="w-full bg-brand-lime rounded-t absolute bottom-0 z-20 shadow-[0_0_10px_rgba(163,230,53,0.5)] animate-skillBar2" />
                </div>
                <div className="w-8 relative flex flex-col justify-end items-center">
                  <div className="w-full bg-neutral-800 rounded-t absolute bottom-0 z-10 animate-biasBar3" />
                  <div className="w-full bg-brand-lime rounded-t absolute bottom-0 z-20 shadow-[0_0_10px_rgba(163,230,53,0.5)] animate-skillBar3" />
                </div>
              </div>
            </div>

            {/* Visual C: Berdampak — organic neural eco-network */}
            <div className="col-span-1 row-span-1 bg-brand-dark border-4 border-neutral-800 rounded-[2rem] p-6 flex flex-col relative overflow-hidden min-h-[250px]">
              <div className="z-10 relative pointer-events-none">
                <h3 className="font-display text-lg font-bold text-brand-lime">Green Ecosystem</h3>
                <p className="font-sans text-xs text-neutral-400 mt-1">Ekspansi AI ke sektor berdampak.</p>
              </div>
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-[240px] h-[170px]">
                <svg viewBox="0 0 240 170" className="w-full h-full overflow-visible drop-shadow-[0_0_10px_rgba(163,230,53,0.8)]">
                  <g stroke="#A3E635" strokeWidth="8" fill="none" strokeLinecap="round" opacity="0.2" filter="blur(2px)">
                    {ecoPaths.map((d, i) => <path key={i} d={d} />)}
                  </g>
                  <g stroke="#A3E635" strokeWidth="4" fill="none" strokeLinecap="round">
                    {ecoPaths.map((d, i) => <path key={i} d={d} className={`animate-draw-main ${drawDelays[i]}`} />)}
                  </g>
                </svg>
                {nodes.map((n) => (
                  <div key={n.t} className={`absolute ${n.pos} animate-popUI ${n.d}`}>
                    <div className={`rounded shadow-sm flex items-center gap-1.5 px-2 py-0.5 whitespace-nowrap border border-brand-lime ${n.dark ? "bg-neutral-900" : "bg-brand-lime shadow-[0_0_8px_rgba(163,230,53,0.5)]"}`}>
                      <span className="text-[9px]">{n.e}</span>
                      <span className={`font-display font-bold text-[8px] tracking-wide uppercase ${n.dark ? "text-white" : "text-brand-dark"}`}>{n.t}</span>
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
                    <div className="h-12 w-12 rounded-2xl bg-white border-2 border-[color:var(--border)] grid place-items-center text-[#D9741A] shrink-0">
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

function HiwUpload() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="absolute w-72 h-72 bg-brand-blue/15 rounded-full blur-3xl animate-ambientGlow z-0" />
      <div className="scene-viewport flex items-center justify-between z-10 px-4">
        <div className="relative w-[130px] h-[180px] bg-white border border-neutral-200 rounded-xl shadow-lg p-3 overflow-hidden flex flex-col gap-2 z-20">
          <div className="w-3/4 h-2 bg-neutral-200 rounded" />
          <div className="w-full h-px bg-neutral-100 my-1" />
          <div className="relative h-4 w-full bg-neutral-50 rounded border border-neutral-100 flex items-center px-1">
            <div className="absolute inset-0 rounded border border-neutral-200 bg-white shadow-sm flex items-center px-1.5 z-20 animate-flyTag1 origin-left">
              <span className="text-[7px] font-bold text-neutral-600 uppercase">React.js</span>
            </div>
          </div>
          <div className="relative h-4 w-[85%] bg-neutral-50 rounded border border-neutral-100 flex items-center px-1">
            <div className="absolute inset-0 rounded border border-neutral-200 bg-white shadow-sm flex items-center px-1.5 z-20 animate-flyTag2 origin-left">
              <span className="text-[7px] font-bold text-neutral-600 uppercase">Leadership</span>
            </div>
          </div>
          <div className="relative h-4 w-[90%] bg-neutral-50 rounded border border-neutral-100 flex items-center px-1">
            <div className="absolute inset-0 rounded border border-neutral-200 bg-white shadow-sm flex items-center px-1.5 z-20 animate-flyTag3 origin-left">
              <span className="text-[7px] font-bold text-neutral-600 uppercase">Node.js</span>
            </div>
          </div>
          <div className="w-full h-1.5 bg-neutral-100 rounded mt-auto" />
          <div className="absolute left-0 right-0 h-0.5 bg-brand-blue shadow-[0_0_12px_#0A5BE0] z-30 animate-scanDoc" />
        </div>
        <div className="relative w-[140px] h-[140px] border-2 border-neutral-200 rounded-2xl p-2 flex items-center justify-center bg-white shadow-md z-10">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-blue text-white px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest shadow-sm">AI Profile</div>
          <div className="relative w-full h-full">
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
              <polygon points="50,10 90,38 75,85 25,85 10,38" fill="none" stroke="#e5e5e5" strokeWidth="1" />
              <polygon points="50,25 75,45 65,75 35,75 25,45" fill="none" stroke="#e5e5e5" strokeWidth="1" />
              <line x1="50" y1="50" x2="50" y2="10" stroke="#e5e5e5" strokeWidth="1" />
              <line x1="50" y1="50" x2="90" y2="38" stroke="#e5e5e5" strokeWidth="1" />
              <line x1="50" y1="50" x2="75" y2="85" stroke="#e5e5e5" strokeWidth="1" />
              <line x1="50" y1="50" x2="25" y2="85" stroke="#e5e5e5" strokeWidth="1" />
              <line x1="50" y1="50" x2="10" y2="38" stroke="#e5e5e5" strokeWidth="1" />
              <polygon points="50,15 80,45 60,80 30,75 20,40" fill="rgba(10,91,224,0.3)" stroke="#0A5BE0" strokeWidth="2" className="animate-radarExpand" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function HiwAgent() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="absolute w-72 h-72 bg-[#D2F801]/15 rounded-full blur-3xl animate-ambientGlow z-0" />
      <div className="scene-viewport flex items-center justify-between z-10 px-2 relative w-full">
        <div className="w-[100px] h-[140px] bg-white border border-neutral-200 rounded-xl p-2 shadow-md relative z-10 overflow-hidden flex flex-col">
          <div className="text-[6px] font-bold text-neutral-400 mb-1 border-b border-neutral-100 pb-1 flex justify-between items-center bg-white z-20">
            <span>Job Feed</span>
            <div className="w-3 h-1 bg-neutral-200 rounded-full" />
          </div>
          <div className="relative flex-1 w-full overflow-hidden">
            <div className="absolute w-full flex flex-col gap-2 animate-feedScroll pt-1">
              <div className="w-full p-2 border border-neutral-100 rounded-md bg-neutral-50">
                <div className="w-6 h-6 bg-neutral-200 rounded mb-1" />
                <div className="w-full h-1 bg-neutral-200 rounded" />
              </div>
              <div className="w-full p-2 border-2 border-neutral-100 rounded-md bg-white animate-cardHighlight">
                <div className="flex gap-1 mb-1.5 items-center">
                  <div className="w-4 h-4 bg-blue-500 rounded-sm" />
                  <div className="w-12 h-1.5 bg-neutral-800 rounded" />
                </div>
                <div className="w-full h-1 bg-neutral-200 rounded mb-1" />
                <div className="w-[80%] h-1 bg-neutral-200 rounded" />
              </div>
              <div className="w-full p-2 border border-neutral-100 rounded-md bg-neutral-50">
                <div className="w-6 h-6 bg-neutral-200 rounded mb-1" />
                <div className="w-full h-1 bg-neutral-200 rounded" />
              </div>
            </div>
          </div>
        </div>
        <div className="relative flex items-center justify-center w-[40px] z-20">
          <div className="w-10 h-10 bg-brand-dark rounded-xl flex items-center justify-center text-[#D2F801] z-20 shadow-[0_0_15px_rgba(210,248,1,0.4)] border border-neutral-800">
            <HIcons.Bot />
          </div>
          <div className="absolute w-3 h-3 bg-[#D2F801]/80 backdrop-blur-sm rounded-full shadow-[0_0_10px_#D2F801] z-40 animate-agentHand border border-white flex items-center justify-center">
            <div className="w-1 h-1 bg-white rounded-full" />
          </div>
          <div className="absolute w-[60px] h-[16px] bg-[#D2F801] border border-lime-600 rounded flex items-center px-1 shadow-lg z-30 animate-blockDrag overflow-hidden">
            <span className="text-[5px] font-mono font-bold text-brand-dark whitespace-nowrap">Senior Frontend</span>
          </div>
        </div>
        <div className="w-[110px] bg-white border border-neutral-200 rounded-xl p-2.5 shadow-lg relative flex flex-col z-10 h-[140px]">
          <div className="flex items-center gap-2 mb-2 border-b border-neutral-100 pb-1.5">
            <div className="w-4 h-4 bg-neutral-200 rounded-full" />
            <div className="space-y-1">
              <div className="h-1.5 w-12 bg-neutral-300 rounded" />
              <div className="h-1 w-8 bg-neutral-200 rounded" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5 relative flex-1">
            <div className="w-full h-1 bg-neutral-200 rounded" />
            <div className="w-[80%] h-1 bg-neutral-200 rounded" />
            <div className="w-full h-[18px] border border-dashed rounded mt-1 flex items-center px-1 animate-cvSlot relative overflow-hidden">
              <span className="text-[4px] font-mono text-neutral-400 animate-cvSlotText absolute left-1">Drop tailored role...</span>
              <span className="text-[5px] font-mono font-bold text-brand-dark absolute left-1 animate-cvAssembledText whitespace-nowrap">Senior Frontend</span>
            </div>
            <div className="w-[90%] h-1 bg-neutral-200 rounded mt-1" />
            <div className="w-[60%] h-1 bg-neutral-200 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

function HiwInterview() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="absolute w-72 h-72 bg-brand-green/10 rounded-full blur-3xl animate-ambientGlow z-0" />
      <div className="scene-viewport relative flex z-10 w-full h-full">
        <svg className="absolute inset-0 w-full h-full z-0 pointer-events-none" viewBox="0 0 340 340">
          <path d="M 120,110 C 200,110 180,210 240,210" fill="none" stroke="#e5e5e5" strokeWidth="2" strokeDasharray="4 4" />
          <path d="M 120,110 C 200,110 180,210 240,210" fill="none" stroke="#1C9656" strokeWidth="2" className="dash-path animate-drawSyncPath" />
        </svg>
        <div className="absolute w-3 h-3 bg-brand-green rounded-full shadow-[0_0_10px_#1C9656] z-10 offset-path-anim animate-dataTravel" style={{ offsetPath: 'path("M 120,110 C 200,110 180,210 240,210")' }} />
        <div className="absolute top-[80px] left-[30px] w-[130px] bg-white border border-neutral-200 p-3 rounded-xl shadow-xl animate-floatEmail z-20">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 bg-green-50 text-brand-green rounded-full flex items-center justify-center"><HIcons.Mail /></div>
            <div>
              <div className="text-[9px] font-bold text-neutral-900">Tech Corp HR</div>
              <div className="text-[7px] text-neutral-500">Interview Invite</div>
            </div>
          </div>
          <div className="bg-neutral-50 border border-neutral-100 rounded px-2 py-1 inline-block">
            <span className="text-[8px] font-mono font-bold text-brand-green">14 OCT, 10:00 AM</span>
          </div>
        </div>
        <div className="absolute top-[160px] right-[20px] w-[140px] bg-white rounded-xl shadow-lg border border-neutral-200 p-3 z-10 flex flex-col">
          <div className="text-[10px] font-bold text-center mb-2 uppercase tracking-widest text-neutral-400">October</div>
          <div className="grid grid-cols-4 gap-1.5 flex-1 relative">
            {[...Array(12)].map((_, i) => (
              <div key={i} className={`rounded border border-neutral-100 transition-all duration-300 h-5 ${i === 6 ? "animate-calSlotActivate relative z-20" : "bg-neutral-50"}`} />
            ))}
            <div className="absolute -bottom-4 -left-6 bg-brand-dark text-white px-2 py-1 rounded-md shadow-xl animate-popBadge z-30 flex items-center gap-1 border border-neutral-700">
              <HIcons.Check /> <span className="text-[7px] font-bold uppercase tracking-widest text-[#D2F801]">Auto-Confirmed</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HiwTracking() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="absolute w-72 h-72 bg-brand-orange/10 rounded-full blur-3xl animate-ambientGlow z-0" />
      <div className="scene-viewport flex items-center justify-center z-10">
        <div className="relative w-[220px] h-[220px] flex items-center justify-center">
          <div className="absolute inset-0 border border-neutral-200 rounded-full" />
          <div className="absolute inset-8 border border-neutral-200/70 rounded-full" />
          <div className="absolute inset-16 border border-neutral-200/40 rounded-full" />
          <div className="absolute inset-0 rounded-full radar-cone animate-radarSpin opacity-50 z-10" />
          <div className="relative z-20 w-10 h-10 bg-brand-dark rounded-full border-2 border-brand-orange flex items-center justify-center text-brand-orange shadow-[0_0_15px_rgba(217,116,26,0.4)]">
            <HIcons.Radar />
          </div>
          <div className="absolute top-[5%] left-[5%] w-24 bg-white border border-neutral-200 rounded-lg p-2 shadow-sm animate-pingTopLeft z-30">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[8px] font-bold text-neutral-800">GOTO</span>
              <span className="text-[6px] font-bold px-1 rounded bg-blue-50 text-brand-blue uppercase">Viewed</span>
            </div>
            <div className="h-1 w-full bg-neutral-100 rounded overflow-hidden"><div className="h-full w-1/3 bg-brand-blue" /></div>
          </div>
          <div className="absolute top-[40%] -right-[5%] w-24 bg-white border border-neutral-200 rounded-lg p-2 shadow-sm animate-pingRight z-30">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[8px] font-bold text-neutral-800">Shopee</span>
              <span className="text-[6px] font-bold px-1 rounded bg-orange-50 text-brand-orange uppercase">Assessed</span>
            </div>
            <div className="h-1 w-full bg-neutral-100 rounded overflow-hidden"><div className="h-full w-2/3 bg-brand-orange" /></div>
          </div>
          <div className="absolute bottom-[5%] left-[10%] w-24 bg-white border border-neutral-200 rounded-lg p-2 shadow-sm animate-pingBottomLeft z-30">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[8px] font-bold text-neutral-800">Traveloka</span>
              <span className="text-[6px] font-bold px-1 rounded bg-green-50 text-brand-green uppercase">Interview</span>
            </div>
            <div className="h-1 w-full bg-neutral-100 rounded overflow-hidden"><div className="h-full w-full bg-brand-green" /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    { id: "01", title: "Upload Profil Sekali", desc: "AI mengekstrak dan memetakan skill-mu menjadi profil digital." },
    { id: "02", title: "Otomasi Tailoring 24/7", desc: "Agen membaca syarat lowongan dan menulis ulang CV secara spesifik." },
    { id: "03", title: "Auto-Sync Interview", desc: "Sistem menyinkronkan jadwal otomatis. Kamu tinggal bersiap diri." },
    { id: "04", title: "Radar Pemantauan", desc: "Lacak seluruh status lamaran dari berbagai platform di satu layar." },
  ];
  const [activeStep, setActiveStep] = useState(0);
  const timerRef = useRef<number | null>(null);

  const startTimer = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setActiveStep((prev) => (prev + 1) % steps.length);
    }, 5000);
  };

  useEffect(() => {
    startTimer();
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleManualClick = (idx: number) => {
    if (idx !== activeStep) { setActiveStep(idx); startTimer(); }
  };

  return (
    <ScrollReveal>
      <section id="cara-kerja" className="w-full py-20 relative overflow-hidden bg-brand-paper">
        <div className="text-center max-w-2xl mx-auto mb-16 relative z-10 px-4">
          <p className="text-xs uppercase tracking-[0.22em] text-brand-blue font-bold">Cara Kerja</p>
          <h2 className="mt-3 font-display text-3xl md:text-5xl font-extrabold tracking-tight text-neutral-900">Empat langkah sampai bekerja.</h2>
          <p className="mt-4 text-neutral-500 text-sm md:text-base max-w-lg mx-auto">Sistem yang dirancang untuk memangkas friksi. Sekali pengaturan, biarkan agen kecerdasan buatan mengambil alih sisanya.</p>
        </div>

        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 items-center relative z-10 px-4 md:px-8">
          <div className="lg:col-span-5 flex flex-col justify-center space-y-4">
            {steps.map((step, idx) => {
              const isActive = activeStep === idx;
              return (
                <div
                  key={step.id}
                  onClick={() => handleManualClick(idx)}
                  className={`relative group cursor-pointer p-4 rounded-2xl transition-all duration-300 ease-out border-2 ${
                    isActive ? "bg-white border-transparent shadow-[0_8px_30px_rgb(0,0,0,0.04)] scale-100" : "bg-transparent border-transparent hover:bg-neutral-100/50 scale-[0.98]"
                  }`}
                >
                  {isActive && <div className="hidden lg:block absolute top-1/2 left-full w-8 h-[2px] bg-brand-blue/20 animate-lineShoot origin-left z-0" />}
                  <div className="flex items-start gap-4">
                    <span className={`font-mono text-xl sm:text-2xl font-extrabold transition-colors mt-0.5 ${isActive ? "text-brand-blue" : "text-neutral-300"}`}>{step.id}.</span>
                    <div className="flex-1">
                      <h3 className={`font-display text-lg sm:text-xl font-bold leading-tight transition-colors ${isActive ? "text-neutral-900" : "text-neutral-500"}`}>{step.title}</h3>
                      <div className={`grid transition-all duration-500 ease-in-out overflow-hidden ${isActive ? "grid-rows-[1fr] mt-2 opacity-100" : "grid-rows-[0fr] mt-0 opacity-0"}`}>
                        <p className="font-sans text-sm text-neutral-600 leading-relaxed pr-4 min-h-0">{step.desc}</p>
                      </div>
                    </div>
                  </div>
                  {isActive && (
                    <div className="absolute bottom-0 left-4 right-4 h-[2px] bg-neutral-100 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-blue animate-hiwProgress origin-left" key={`progress-${activeStep}`} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="lg:col-span-7 relative w-full aspect-square sm:aspect-auto sm:h-[450px] flex items-center justify-center bg-white/60 border border-white backdrop-blur-md rounded-[3rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] overflow-hidden">
            <div className="absolute inset-0 w-full h-full">
              {activeStep === 0 && <HiwUpload key="scene0" />}
              {activeStep === 1 && <HiwAgent key="scene1" />}
              {activeStep === 2 && <HiwInterview key="scene2" />}
              {activeStep === 3 && <HiwTracking key="scene3" />}
            </div>
          </div>
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

        <div className="mt-12 grid gap-4 md:grid-cols-4 md:auto-rows-[230px]">
          {/* Hero cell 2x2 — Collective ATS Intelligence */}
          <div className="md:col-span-2 md:row-span-2 glass rounded-3xl p-7 relative overflow-hidden flex flex-col">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#0A5BE0] px-3 py-1 text-xs font-bold text-white">
              ✦ Eksklusif Indonesia
            </span>
            <div className="mt-5 h-12 w-12 rounded-xl bg-[#16150F] grid place-items-center text-[#D2F801]">
              <Brain className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-display text-2xl font-extrabold leading-tight">Collective ATS Intelligence</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-snug">
              Agregasi data ATS dari 12.000+ pelamar — kami tahu keyword yang lolos di Workday, Lever &amp; Greenhouse.
            </p>
            <div className="mt-auto pt-5 space-y-2.5">
              {[
                { c: "Gojek", ats: "Workday", m: 87 },
                { c: "Tokopedia", ats: "Lever", m: 74 },
                { c: "Shopee", ats: "Greenhouse", m: 92 },
              ].map((row) => (
                <div key={row.c} className="rounded-xl border-2 border-[color:var(--border)] bg-[#FBF9F2] p-3">
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

          <BentoCard icon={EyeOff} badge="Social Impact" badgeTone="#16150F" title="Blind Merit Mode" desc="Sembunyikan identitas; biarkan skill dinilai lebih dulu." accent="#1C9656" />
          <BentoCard icon={Zap} badge="Real-time" badgeTone="#0A5BE0" title="Golden Window Sniper" desc="Lamar di 2 jam pertama — callback 4× lebih tinggi." accent="#D9741A" />

          {/* Wide cell 2x1 — Skill Radar with mini radar */}
          <div className="md:col-span-2 glass rounded-3xl p-6 flex items-center gap-5">
            <div className="flex-1">
              <span className="inline-flex items-center rounded-full bg-[#16150F] px-3 py-1 text-xs font-bold text-[#D2F801]">Smart Learning</span>
              <h3 className="mt-3 font-display text-xl font-bold">Skill Radar</h3>
              <p className="mt-1.5 text-sm text-muted-foreground leading-snug">Visualisasi gap skill-mu vs tren pasar, real-time.</p>
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
    <div className="glass rounded-3xl p-6 overflow-hidden hover:-translate-y-1 transition-transform duration-300">
      <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold text-white" style={{ background: badgeTone }}>{badge}</span>
      <div className="mt-3.5 h-11 w-11 rounded-xl grid place-items-center text-white" style={{ background: accent }}>
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-3.5 font-display text-lg font-bold leading-tight">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground leading-snug">{desc}</p>
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
    <div className="rounded-3xl border-2 border-[color:var(--border)] bg-[#FBF9F2] p-7">
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
        <div className="relative overflow-hidden rounded-3xl border-2 border-[color:var(--border)] text-white p-8 md:p-12" style={{ background: "linear-gradient(135deg, #1C9656 0%, #0F6B3D 100%)" }}>
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
              <div className="rounded-xl border-2 border-[color:var(--border)] bg-[#FBF9F2] p-2.5 text-xs font-semibold font-mono" style={{ color: r.tone }}>
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
              <Link to={authLink} className={`mt-7 inline-flex justify-center items-center h-11 rounded-xl text-sm font-semibold transition ${t.popular ? "bg-[#16150F] text-[#F4F1E8] hover:bg-black" : "border-2 border-[color:var(--border)] bg-white hover:bg-black/[3%]"}`}>
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
              <div key={c.t} className="rounded-2xl border-2 border-[color:var(--border)] bg-[#FBF9F2] p-6">
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
      <Link to={authLink} className="flex-1 h-11 rounded-xl border-2 border-[color:var(--border)] bg-white grid place-items-center text-sm font-semibold hover:bg-black/[3%] transition">Masuk</Link>
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
