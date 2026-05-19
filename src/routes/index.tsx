import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, Zap, Brain, Radar, EyeOff, ArrowRight, Check, Rocket, Bot, CalendarCheck, Star, LogIn, UserPlus } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/")({
  component: Landing,
});

function ScrollReveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
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
    <div ref={ref} className="scroll-reveal">
      {children}
    </div>
  );
}

const platforms = ["LinkedIn", "Jobstreet", "Glints", "KitaLulus", "Kalibrr", "Dealls", "Facebook Groups"];

function Landing() {
  const { user } = useAuth();
  const authLink = user ? "/dashboard" : "/login";

  return (
    <div className="min-h-screen overflow-x-hidden">
      <Navbar authLink={authLink} />
      <Hero authLink={authLink} />
      <HowItWorks />
      <Testimonials />
      <Features />
      <PlatformMarquee />
      <Pricing authLink={authLink} />
      <FinalCTA authLink={authLink} />
      <Footer />
      <MobileStickyBar authLink={authLink} />
    </div>
  );
}

function Navbar({ authLink }: { authLink: string }) {
  const { user, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-40 glass-strong border-b border-[#AAAAAA]">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg gradient-primary text-white font-bold">A</div>
          <span className="text-lg font-bold tracking-tight">Applify</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          <a href="#features" className="hover:text-foreground transition">Fitur</a>
          <a href="#how" className="hover:text-foreground transition">Cara Kerja</a>
          <a href="#pricing" className="hover:text-foreground transition">Harga</a>
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Link to="/dashboard" className="hidden md:inline-flex h-9 items-center px-3 text-sm text-muted-foreground hover:text-foreground">Dashboard</Link>
              <button onClick={signOut} className="hidden md:inline-flex h-9 items-center rounded-lg border border-[#999999] bg-black/[4%] px-4 text-sm font-medium hover:bg-black/[7%] transition">
                Logout
              </button>
              <Link to="/dashboard" className="inline-flex h-9 items-center rounded-lg gradient-primary px-4 text-sm font-medium text-white hover:opacity-90 transition">
                Mulai
              </Link>
            </>
          ) : (
            <>
              <Link to={authLink} className="hidden md:inline-flex h-9 items-center gap-1.5 px-3 text-sm text-muted-foreground hover:text-foreground">
                <LogIn className="h-3.5 w-3.5" /> Masuk
              </Link>
              <Link to={authLink} className="inline-flex h-9 items-center gap-1.5 rounded-lg gradient-primary px-4 text-sm font-medium text-white hover:opacity-90 transition">
                <UserPlus className="h-3.5 w-3.5" /> Daftar Gratis
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function Hero({ authLink }: { authLink: string }) {
  return (
    <ScrollReveal>
    <section className="relative grid-bg">
      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-16 md:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 md:px-8">
        <div className="flex flex-col justify-center animate-fade-up">
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#D2F801] px-3 py-1 text-xs font-medium text-[#161616]">
            <Sparkles className="h-3.5 w-3.5" /> AI-Powered Job Agent · Indonesia #1
          </span>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight md:text-6xl lg:text-7xl leading-[1.05]">
            Biarkan <span className="text-gradient-primary">AI</span><br />Melamar <span className="text-gradient-primary">100</span> Pekerjaan<br />Untuk Kamu
          </h1>
          <p className="mt-6 max-w-xl text-base md:text-lg text-muted-foreground leading-relaxed">
            Applify mengindeks Jobstreet, LinkedIn, Glints, dan 4 platform lain secara bersamaan — lalu mengirim lamaran yang sudah dioptimasi ATS atas nama kamu. Otomatis. 24/7.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to={authLink} className="inline-flex h-12 items-center rounded-xl gradient-primary px-6 text-sm font-semibold text-white hover:opacity-95 transition">
              Mulai Gratis <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <a href="#how" className="inline-flex h-12 items-center rounded-xl border border-[#999999] bg-black/[4%] px-6 text-sm font-semibold hover:bg-black/[7%] transition">
              Lihat Demo →
            </a>
          </div>
          <div className="mt-8 flex items-center gap-4">
            <div className="flex -space-x-2">
              {["#4F8EF7","#7C5CFC","#00D4AA","#FFD166"].map((c,i) => (
                <div key={i} className="h-9 w-9 rounded-full border-2 border-background grid place-items-center text-white text-xs font-bold" style={{background:c}}>
                  {["RZ","DW","AP","FH"][i]}
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground"><span className="font-mono font-bold text-foreground">12.400+</span> pencari kerja Indonesia sudah bergabung</p>
          </div>

          {/* Visual trust stats */}
          <div className="mt-6 grid grid-cols-3 gap-3 max-w-md">
            {[
              { icon: "🎯", value: "91%", label: "ATS Pass Rate" },
              { icon: "⚡", value: "4x", label: "Callback Lebih Cepat" },
              { icon: "🚀", value: "100", label: "Lamaran / Bulan" },
            ].map((s) => (
              <div key={s.label} className="glass rounded-xl p-3 text-center">
                <div className="text-xl mb-1">{s.icon}</div>
                <p className="font-mono text-lg font-bold text-foreground">{s.value}</p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative hidden lg:block">
          <div className="relative glass rounded-3xl p-6 animate-fade-up">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Dashboard Live</p>
                <p className="text-sm font-semibold mt-1">Agen Aktif · 7 platform</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-teal animate-pulse-glow" />
                <span className="text-xs text-teal font-mono">ONLINE</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="Terkirim" value="47" tone="primary" />
              <MiniStat label="ATS Lolos" value="91%" tone="teal" />
              <MiniStat label="Callback" value="8" tone="gold" />
              <MiniStat label="⚡ Golden" value="3" tone="warm" />
            </div>
            <div className="mt-5 space-y-2">
              {[
                { c: "Gojek", r: "Senior Backend", s: "ATS Lolos", tone: "teal" },
                { c: "Tokopedia", r: "Product Manager", s: "Callback", tone: "gold" },
                { c: "BCA Digital", r: "Data Analyst", s: "Terkirim", tone: "primary" },
              ].map((it, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg bg-black/[3%] border border-[#BBBBBB] p-3">
                  <div className="h-8 w-8 rounded-md gradient-primary grid place-items-center text-xs font-bold text-white">{it.c[0]}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{it.c}</p>
                    <p className="text-xs text-muted-foreground truncate">{it.r}</p>
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider rounded-full px-2 py-1 font-semibold ${it.tone==='teal'?'bg-[#D2F801] text-[#161616]':it.tone==='gold'?'bg-[#D2F801] text-[#161616]':'bg-[#0367FC] text-white'}`}>{it.s}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="absolute -top-4 -right-4 glass rounded-xl px-4 py-3 animate-float">
            <p className="text-xs text-muted-foreground">Hari ini</p>
            <p className="text-sm font-bold">🎯 47 lamaran terkirim</p>
          </div>
          <div className="absolute -bottom-4 -left-4 glass rounded-xl px-4 py-3 animate-float" style={{animationDelay:'1s'}}>
            <p className="text-xs text-muted-foreground">Performa</p>
            <p className="text-sm font-bold">⚡ Lolos ATS: <span className="text-teal">91%</span></p>
          </div>
        </div>
      </div>
    </section>
    </ScrollReveal>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  const color = tone==='teal'?'text-teal':tone==='gold'?'text-gold':tone==='warm'?'text-warm':'text-primary';
  return (
    <div className="rounded-xl bg-black/[3%] border border-[#BBBBBB] p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`font-mono text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function StepIllo({ step }: { step: 1 | 2 | 3 }) {
  if (step === 1) return (
    <svg viewBox="0 0 120 90" className="w-32 h-24 mx-auto mb-2" aria-hidden="true">
      <ellipse cx="60" cy="83" rx="30" ry="5" fill="rgba(79,142,247,0.10)" />
      <rect x="28" y="8" width="64" height="74" rx="8" fill="rgba(239,240,244,0.95)" stroke="rgba(79,142,247,0.35)" strokeWidth="1.5" />
      {[24, 33, 42, 51, 60].map((y, i) => (
        <line key={i} x1="38" y1={y} x2={i === 2 || i === 4 ? 66 : 82} y2={y} stroke="rgba(22,22,22,0.14)" strokeWidth="2" strokeLinecap="round" />
      ))}
      {/* person silhouette bottom-right */}
      <circle cx="95" cy="62" r="8" fill="rgba(79,142,247,0.25)" stroke="rgba(79,142,247,0.5)" strokeWidth="1.5" />
      <path d="M89 78 Q95 70 101 78" fill="rgba(79,142,247,0.25)" stroke="rgba(79,142,247,0.5)" strokeWidth="1.5" />
      {/* sparkle stars */}
      <path d="M12 20 L13.5 16 L15 20 L19 21.5 L15 23 L13.5 27 L12 23 L8 21.5 Z" fill="#0367FC" opacity="0.85" />
      <path d="M103 10 L104 7.5 L105 10 L107.5 11 L105 12 L104 14.5 L103 12 L100.5 11 Z" fill="#11358B" opacity="0.75" />
      <path d="M106 55 L107 52.5 L108 55 L110.5 56 L108 57 L107 59.5 L106 57 L103.5 56 Z" fill="#059669" opacity="0.75" />
      {/* upload arrow */}
      <path d="M60 5 L60 0" stroke="#0367FC" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M55 4 L60 0 L65 4" stroke="#0367FC" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  if (step === 2) return (
    <svg viewBox="0 0 120 90" className="w-32 h-24 mx-auto mb-2" aria-hidden="true">
      {/* platform circles */}
      {([
        [12, 14, "L", "#0367FC"],
        [108, 14, "J", "#DC2626"],
        [8, 56, "G", "#059669"],
        [112, 56, "K", "#D97706"],
        [60, 82, "D", "#11358B"],
      ] as [number, number, string, string][]).map(([x, y, label, color]) => (
        <g key={label}>
          <circle cx={x} cy={y} r="12" fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1.2" strokeOpacity="0.5" />
          <text x={x} y={y + 4} textAnchor="middle" fontSize="9" fontWeight="bold" fill={color}>{label}</text>
        </g>
      ))}
      {/* dashed connector lines */}
      {([
        [42, 34, 24, 22],
        [78, 34, 96, 22],
        [42, 52, 20, 54],
        [78, 52, 100, 54],
        [60, 63, 60, 70],
      ] as [number, number, number, number][]).map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(22,22,22,0.10)" strokeWidth="1.5" strokeDasharray="3 2" />
      ))}
      {/* robot head */}
      <rect x="40" y="26" width="40" height="38" rx="9" fill="#D2F801" />
      <rect x="48" y="35" width="9" height="7" rx="2.5" fill="#161616" />
      <rect x="63" y="35" width="9" height="7" rx="2.5" fill="#161616" />
      <path d="M50 53 Q60 59 70 53" stroke="#161616" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* antenna */}
      <line x1="60" y1="26" x2="60" y2="19" stroke="rgba(22,22,22,0.35)" strokeWidth="2" />
      <circle cx="60" cy="17" r="3.5" fill="#FFD166" />
    </svg>
  );

  return (
    <svg viewBox="0 0 120 90" className="w-32 h-24 mx-auto mb-2" aria-hidden="true">
      {/* calendar body */}
      <rect x="22" y="18" width="76" height="60" rx="9" fill="rgba(239,240,244,0.95)" stroke="rgba(255,209,102,0.4)" strokeWidth="1.5" />
      {/* calendar header */}
      <rect x="22" y="18" width="76" height="22" rx="9" fill="#D2F801" />
      <rect x="22" y="30" width="76" height="10" fill="#D2F801" />
      {/* calendar rings */}
      <rect x="38" y="12" width="6" height="12" rx="3" fill="#FFD166" />
      <rect x="76" y="12" width="6" height="12" rx="3" fill="#FFD166" />
      {/* big check circle */}
      <circle cx="60" cy="57" r="15" fill="rgba(5,150,105,0.12)" stroke="#059669" strokeWidth="2.2" />
      <path d="M52 57 L58 63 L70 51" stroke="#059669" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* confetti dots */}
      {([
        [16, 28, "#D2F801"], [104, 26, "#11358B"],
        [14, 60, "#059669"], [106, 62, "#6192FC"],
        [20, 80, "#0367FC"], [100, 80, "#D97706"],
      ] as [number, number, string][]).map(([cx, cy, fill], i) => (
        <circle key={i} cx={cx} cy={cy} r="3.5" fill={fill} opacity="0.8" />
      ))}
    </svg>
  );
}

function HowItWorks() {
  const steps = [
    { icon: Brain, title: "Upload Profil Sekali", desc: "AI mempelajari pengalaman dan preferensi karier kamu dalam hitungan menit." },
    { icon: Bot, title: "AI Bekerja 24/7", desc: "Agen mengindeks 7 platform, menulis ulang resume, dan mengirim lamaran otomatis." },
    { icon: CalendarCheck, title: "Terima Undangan Interview", desc: "Fokus pada persiapan interview, biarkan agen mengurus sisanya." },
  ];
  return (
    <ScrollReveal>
    <section id="how" className="bg-[#F5F5F5] border-y border-[#AAAAAA]">
      <div className="mx-auto max-w-7xl px-4 py-20 md:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold">Cara Kerja</p>
          <h2 className="mt-3 text-3xl md:text-5xl font-bold tracking-tight">Tiga langkah sampai interview</h2>
        </div>
        <div className="mt-14 grid gap-8 md:grid-cols-3 relative">
          <div className="hidden md:block absolute top-16 left-[16%] right-[16%] h-px bg-[#0367FC]" />
          {steps.map((s, i) => (
            <div key={i} className="relative glass rounded-2xl p-6 text-center">
              <StepIllo step={(i + 1) as 1 | 2 | 3} />
              <div className="mx-auto h-14 w-14 rounded-2xl gradient-primary grid place-items-center text-white shadow-lg">
                <s.icon className="h-6 w-6" />
              </div>
              <p className="mt-4 font-mono text-xs text-muted-foreground">LANGKAH 0{i + 1}</p>
              <h3 className="mt-2 text-xl font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
    </ScrollReveal>
  );
}

function AvatarIllo({ variant }: { variant: 1 | 2 | 3 }) {
  if (variant === 1) return (
    <svg viewBox="0 0 56 56" className="w-12 h-12 shrink-0" aria-hidden="true">
      <circle cx="28" cy="28" r="28" fill="rgba(5,150,105,0.13)" />
      <ellipse cx="28" cy="19" rx="13" ry="9.5" fill="#059669" />
      <ellipse cx="28" cy="27" rx="12.5" ry="13" fill="#FDDBB4" />
      <circle cx="23" cy="26" r="2.2" fill="#1a1a2e" />
      <circle cx="33" cy="26" r="2.2" fill="#1a1a2e" />
      <circle cx="23.8" cy="25.2" r="0.8" fill="white" />
      <circle cx="33.8" cy="25.2" r="0.8" fill="white" />
      <path d="M23 32 Q28 37.5 33 32" stroke="#c47a5a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M15 55 Q28 47 41 55" fill="#059669" opacity="0.75" />
    </svg>
  );
  if (variant === 2) return (
    <svg viewBox="0 0 56 56" className="w-12 h-12 shrink-0" aria-hidden="true">
      <circle cx="28" cy="28" r="28" fill="rgba(3,103,252,0.13)" />
      <ellipse cx="28" cy="17" rx="13" ry="8" fill="#1e1660" />
      <ellipse cx="28" cy="27" rx="12.5" ry="13" fill="#F5CBA7" />
      <ellipse cx="28" cy="37.5" rx="9" ry="4" fill="#d4a680" opacity="0.45" />
      <circle cx="23" cy="25" r="2.2" fill="#1a1a2e" />
      <circle cx="33" cy="25" r="2.2" fill="#1a1a2e" />
      <circle cx="23.8" cy="24.2" r="0.8" fill="white" />
      <circle cx="33.8" cy="24.2" r="0.8" fill="white" />
      <path d="M23 32 Q28 36.5 33 32" stroke="#c47a5a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M15 55 Q28 47 41 55" fill="#0367FC" opacity="0.75" />
    </svg>
  );
  return (
    <svg viewBox="0 0 56 56" className="w-12 h-12 shrink-0" aria-hidden="true">
      <circle cx="28" cy="28" r="28" fill="rgba(210,248,1,0.18)" />
      <path d="M14 22 Q14 8 28 7 Q42 8 42 22" fill="#3d2108" />
      <ellipse cx="28" cy="17" rx="14.5" ry="10" fill="#3d2108" />
      <ellipse cx="28" cy="27" rx="12.5" ry="13" fill="#FDDBB4" />
      <circle cx="23" cy="26" r="2.2" fill="#1a1a2e" />
      <circle cx="33" cy="26" r="2.2" fill="#1a1a2e" />
      <circle cx="23.8" cy="25.2" r="0.8" fill="white" />
      <circle cx="33.8" cy="25.2" r="0.8" fill="white" />
      <path d="M23 32 Q28 37.5 33 32" stroke="#c47a5a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M15 55 Q28 47 41 55" fill="#D2F801" opacity="0.85" />
    </svg>
  );
}

function Testimonials() {
  const reviews = [
    {
      name: "Dinda Rahmawati",
      role: "Fresh Graduate — Ekonomi UI",
      quote: "Setelah 3 bulan nganggur, seminggu pakai Applify langsung dapat 6 callback. Golden Window beneran works!",
      stat: "+6 callback dalam 7 hari",
      avatar: 1 as const,
      statColor: "text-teal",
    },
    {
      name: "Reza Firmansyah",
      role: "Job Seeker · 2 tahun pengalaman",
      quote: "ATS Collective Intelligence itu killer feature. Gue akhirnya lolos Shopee setelah 4 kali ditolak — ternyata keyword-nya selama ini salah.",
      stat: "Dari 0 ke hired di Shopee",
      avatar: 2 as const,
      statColor: "text-primary",
    },
    {
      name: "Anisa Putri",
      role: "Fresh Grad — Poltek Bandung",
      quote: "Blind Merit Mode bikin gue pede. Gue dari Poltek, bukan UI/ITB, tapi skill gue akhirnya dilihat duluan.",
      stat: "Lolos ATS 9/10 lamaran",
      avatar: 3 as const,
      statColor: "text-gold",
    },
  ];
  return (
    <ScrollReveal delay={100}>
    <section className="mx-auto max-w-7xl px-4 py-20 md:px-8">
      <div className="text-center max-w-2xl mx-auto">
        <p className="text-xs uppercase tracking-[0.2em] text-violet font-semibold">Testimoni</p>
        <h2 className="mt-3 text-3xl md:text-5xl font-bold tracking-tight">Mereka sudah merasakan hasilnya.</h2>
        <p className="mt-4 text-muted-foreground text-sm">Dari fresh graduate hingga job seeker berpengalaman.</p>
      </div>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {reviews.map((r) => (
          <div key={r.name} className="glass rounded-3xl p-6 flex flex-col gap-4 hover:scale-[1.01] transition">
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-gold text-gold" />
              ))}
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground flex-1">"{r.quote}"</p>
            <div className={`glass rounded-xl p-2.5 text-xs font-semibold font-mono ${r.statColor}`}>
              📈 {r.stat}
            </div>
            <div className="flex items-center gap-3 mt-1 border-t border-[#AAAAAA] pt-4">
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

function Features() {
  return (
    <ScrollReveal delay={50}>
    <section id="features" className="mx-auto max-w-7xl px-4 py-20 md:px-8">
      <div className="text-center max-w-2xl mx-auto">
        <p className="text-xs uppercase tracking-[0.2em] text-teal font-semibold">Fitur Unggulan</p>
        <h2 className="mt-3 text-3xl md:text-5xl font-bold tracking-tight">Bukan job board biasa.</h2>
        <p className="mt-4 text-muted-foreground">Empat fitur eksklusif yang tidak akan kamu temukan di platform lain.</p>
      </div>

      <div className="mt-12 grid gap-5 md:grid-cols-3 md:grid-rows-2">
        <FeatureBig />
        <FeatureCard
          icon={EyeOff}
          title="Blind Merit Mode"
          desc="Sembunyikan nama, kampus, dan latar belakang sosial. Biarkan skill berbicara lebih dulu."
          badge={{ text: "Social Impact", className: "bg-[#D2F801] text-[#161616]" }}
        />
        <FeatureCard
          icon={Zap}
          title="Golden Window Sniper"
          desc="Lamar dalam 2 jam pertama setelah posting — peluang callback 4x lebih tinggi."
          badge={{ text: "Real-time", className: "bg-[#D2F801] text-[#161616]" }}
        />
        <div className="md:col-span-3">
          <FeatureCard
            icon={Radar}
            title="Skill Radar"
            desc="Visualisasi gap skill kamu vs tren pasar real-time. Terhubung langsung ke Dicoding & platform learning."
            badge={{ text: "Smart Learning", className: "bg-[#161616] text-white" }}
            wide
          />
        </div>
      </div>
    </section>
    </ScrollReveal>
  );
}

function FeatureBig() {
  return (
    <div className="md:row-span-2 glass rounded-3xl p-7 relative overflow-hidden group">
      <div className="relative">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0367FC] px-3 py-1 text-xs font-semibold text-white">
          ✦ Eksklusif Indonesia
        </span>
        <div className="mt-5 h-12 w-12 rounded-xl gradient-primary grid place-items-center text-white">
          <Brain className="h-6 w-6" />
        </div>
        <h3 className="mt-5 text-2xl font-bold">Collective ATS Intelligence</h3>
        <p className="mt-3 text-muted-foreground leading-relaxed">
          Agregasi data ATS dari 12.000+ pelamar lain. Kami tahu keyword apa yang lolos di Workday Gojek, di Lever Tokopedia, di Greenhouse Shopee.
        </p>

        <div className="mt-6 space-y-2">
          {[
            { c: "Gojek", ats: "Workday", m: 87 },
            { c: "Tokopedia", ats: "Lever", m: 74 },
            { c: "Shopee", ats: "Greenhouse", m: 92 },
            { c: "BCA", ats: "SAP SuccessFactors", m: 68 },
          ].map((row, i) => (
            <div key={i} className="rounded-lg bg-black/[3%] border border-[#BBBBBB] p-3">
              <div className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium">{row.c}</p>
                  <p className="text-xs text-muted-foreground font-mono">{row.ats}</p>
                </div>
                <span className="font-mono text-sm font-bold text-teal">{row.m}%</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-black/[5%] overflow-hidden">
                <div className="h-full gradient-success rounded-full" style={{ width: `${row.m}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, desc, badge, wide }: any) {
  return (
    <div className={`glass rounded-3xl p-6 group hover:scale-[1.01] transition ${wide?'md:flex md:items-center md:gap-8':''}`}>
      <div className={wide?'flex-1':''}>
        {badge && <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${badge.className}`}>{badge.text}</span>}
        <div className="mt-4 h-11 w-11 rounded-xl bg-[#0367FC] border-[#0367FC] grid place-items-center text-white">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="mt-4 text-xl font-bold">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{desc}</p>
      </div>
      {wide && (
        <div className="hidden md:flex flex-1 items-center justify-center">
          <RadarMini />
        </div>
      )}
    </div>
  );
}

function RadarMini() {
  return (
    <svg viewBox="0 0 200 200" className="w-56 h-56">
      {[80,60,40,20].map(r => <polygon key={r} points={pentagon(100,100,r)} fill="none" stroke="rgba(0,0,0,0.08)" />)}
      <polygon points={pentagon(100,100,80)} fill="none" stroke="rgba(0,0,0,0.10)" strokeDasharray="3 3" />
      <polygon points="100,30 170,75 145,150 60,155 35,80" fill="#0367FC" fillOpacity="0.15" stroke="#0367FC" strokeWidth="2" />
    </svg>
  );
}
function pentagon(cx: number, cy: number, r: number) {
  return Array.from({length:5},(_,i)=>{const a=-Math.PI/2+i*2*Math.PI/5;return `${cx+r*Math.cos(a)},${cy+r*Math.sin(a)}`}).join(' ');
}

const platformMeta: Record<string, { color: string; bg: string; emoji: string }> = {
  LinkedIn:         { color: "#FFFFFF", bg: "#0A66C2", emoji: "💼" },
  Jobstreet:        { color: "#FFFFFF", bg: "#E8192C", emoji: "🔍" },
  Glints:           { color: "#161616", bg: "#0BD461", emoji: "✨" },
  KitaLulus:        { color: "#FFFFFF", bg: "#FF6B00", emoji: "🎓" },
  Kalibrr:          { color: "#FFFFFF", bg: "#2563EB", emoji: "📋" },
  Dealls:           { color: "#FFFFFF", bg: "#6366F1", emoji: "🤝" },
  "Facebook Groups":{ color: "#FFFFFF", bg: "#1877F2", emoji: "👥" },
};

function PlatformMarquee() {
  const items = [...platforms, ...platforms];
  return (
    <section className="border-y border-[#AAAAAA] py-14 overflow-hidden">
      <p className="text-center text-xs uppercase tracking-[0.2em] text-muted-foreground font-semibold">Satu agent. Semua platform kerja Indonesia.</p>
      <div className="mt-8 flex animate-marquee gap-5 whitespace-nowrap">
        {items.map((p, i) => {
          const meta = platformMeta[p] ?? { color: "#FFFFFF", bg: "#8B92B4", emoji: "🔗" };
          return (
            <div key={i} className="flex items-center gap-2.5 rounded-2xl px-5 py-3 shrink-0"
              style={{ background: meta.bg }}>
              <span className="text-xl">{meta.emoji}</span>
              <span className="text-base font-bold" style={{ color: meta.color }}>{p}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Pricing({ authLink }: { authLink: string }) {
  const tiers = [
    { 
      name: "Free", 
      price: "Gratis", 
      per: "selamanya", 
      features: [
        "10 AI Apply/hari",
        "AI Basic (70% accuracy)",
        "Cover letter standar",
        "3 platform utama",
        "Skill radar dasar",
        "Human approval required"
      ] 
    },
    { 
      name: "Pro", 
      price: "Rp 69.000", 
      per: "/bulan", 
      popular: true, 
      features: [
        "50 AI Apply/hari",
        "AI Advanced (85% accuracy)",
        "Cover letter premium (Claude 3.5)",
        "Semua 7 platform",
        "Golden Window Sniper",
        "CV Optimization AI",
        "Follow-up scheduler",
        "Blind Merit Mode",
        "Prioritas dukungan"
      ] 
    },
    { 
      name: "Annual", 
      price: "Rp 299.000", 
      per: "/tahun", 
      features: [
        "Semua fitur Pro",
        "50 Apply/hari",
        "AI Premium (85% accuracy)",
        "Hemat 64% vs bulanan",
        "Skill Radar premium",
        "Karier coach 1-on-1 bulanan",
        "Early access fitur baru"
      ] 
    },
  ];
  return (
    <ScrollReveal delay={100}>
    <section id="pricing" className="mx-auto max-w-7xl px-4 py-20 md:px-8">
      <div className="text-center max-w-2xl mx-auto">
        <p className="text-xs uppercase tracking-[0.2em] text-gold font-semibold">Pricing</p>
        <h2 className="mt-3 text-3xl md:text-5xl font-bold tracking-tight">Mulai gratis, upgrade saat siap.</h2>
      </div>
      <div className="mt-12 grid gap-6 md:grid-cols-3 md:items-stretch">
        {tiers.map((t) => (
          <div key={t.name} className={`relative glass rounded-3xl p-7 flex flex-col ${t.popular?'md:scale-[1.04] border-primary/40 shadow-2xl':''}`}>
            {t.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 gradient-primary text-white text-xs font-bold px-3 py-1 rounded-full">PALING POPULER</span>}
            <h3 className="text-lg font-semibold text-muted-foreground">{t.name}</h3>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="font-mono text-4xl font-bold">{t.price}</span>
              <span className="text-sm text-muted-foreground">{t.per}</span>
            </div>
            <ul className="mt-6 space-y-3 flex-1">
              {t.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check className="h-4 w-4 text-teal mt-0.5 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link to={authLink} className={`mt-7 inline-flex justify-center items-center h-11 rounded-xl text-sm font-semibold transition ${t.popular?'gradient-primary text-white':'border border-[#999999] bg-black/[4%] hover:bg-black/[7%]'}`}>
              {t.name === 'Free' ? 'Mulai Gratis' : 'Pilih Paket'}
            </Link>
          </div>
        ))}
      </div>
    </section>
    </ScrollReveal>
  );
}

function FinalCTA({ authLink }: { authLink: string }) {
  return (
    <ScrollReveal delay={50}>
    <section className="relative mx-auto max-w-7xl px-4 py-20 md:px-8">
      <div className="relative overflow-hidden rounded-3xl bg-[#0367FC] p-10 md:p-16 text-center">
        <div className="relative">
          <Rocket className="h-12 w-12 mx-auto text-white" />
          <h2 className="mt-6 text-3xl md:text-5xl font-bold tracking-tight max-w-2xl mx-auto text-white">
            Sudah saatnya AI bekerja untuk <span className="text-[#D2F801]">kariermu.</span>
          </h2>
          <p className="mt-4 text-white/80 max-w-xl mx-auto">Gabung 12.400+ pencari kerja Indonesia yang sudah membiarkan agen melakukan kerja berat.</p>
          <Link to={authLink} className="mt-8 inline-flex h-14 items-center rounded-2xl bg-[#D2F801] px-8 text-base font-semibold text-[#161616] hover:opacity-90 transition">
            Aktifkan Agen Sekarang <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
        </div>
      </div>
    </section>
    </ScrollReveal>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[#AAAAAA] mt-10 pb-24 md:pb-10">
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-8 grid gap-8 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg gradient-primary text-white font-bold">A</div>
            <span className="font-bold">Applify</span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">Apply smarter, not harder.</p>
        </div>
        {[
          { h: "Produk", l: ["Fitur", "Harga", "Browser Extension", "Roadmap"] },
          { h: "Perusahaan", l: ["Tentang", "Blog", "Karier", "Kontak"] },
          { h: "Sosial", l: ["Twitter", "LinkedIn", "Instagram", "Discord"] },
        ].map((c) => (
          <div key={c.h}>
            <p className="text-sm font-semibold mb-3">{c.h}</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {c.l.map((x) => <li key={x}><a className="hover:text-foreground" href="#">{x}</a></li>)}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground">© 2026 Applify. Dibuat di Jakarta.</p>
    </footer>
  );
}

function MobileStickyBar({ authLink }: { authLink: string }) {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass-strong border-t border-[#999999] px-4 py-3 flex gap-2">
      <Link to={authLink} className="flex-1 h-11 rounded-xl border border-[#999999] bg-black/[4%] grid place-items-center text-sm font-semibold hover:bg-black/[7%] transition">Masuk</Link>
      <Link to={authLink} className="flex-[2] h-11 rounded-xl gradient-primary grid place-items-center text-sm font-semibold text-white hover:opacity-90 transition">Mulai Gratis</Link>
    </div>
  );
}

