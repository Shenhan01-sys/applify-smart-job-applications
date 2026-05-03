import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, Zap, Brain, Radar, EyeOff, ArrowRight, Check, Rocket, Bot, CalendarCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

const platforms = ["LinkedIn", "Jobstreet", "Glints", "KitaLulus", "Kalibrr", "Dealls", "Facebook Groups"];

function Landing() {
  return (
    <div className="min-h-screen overflow-x-hidden">
      <Navbar />
      <Hero />
      <HowItWorks />
      <Features />
      <PlatformMarquee />
      <Pricing />
      <FinalCTA />
      <Footer />
      <MobileStickyBar />
    </div>
  );
}

function Navbar() {
  return (
    <header className="sticky top-0 z-40 glass-strong border-b border-white/5">
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
          <Link to="/dashboard" className="hidden md:inline-flex h-9 items-center px-3 text-sm text-muted-foreground hover:text-foreground">Login</Link>
          <Link to="/dashboard" className="inline-flex h-9 items-center rounded-lg gradient-primary px-4 text-sm font-medium text-white glow-primary hover:opacity-90 transition">
            Mulai Gratis
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative grid-bg">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/40 to-background pointer-events-none" />
      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-16 md:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 md:px-8">
        <div className="flex flex-col justify-center animate-fade-up">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-teal/30 bg-teal/10 px-3 py-1 text-xs font-medium text-teal">
            <Sparkles className="h-3.5 w-3.5" /> AI-Powered Job Agent · Indonesia #1
          </span>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight md:text-6xl lg:text-7xl leading-[1.05]">
            Biarkan <span className="text-gradient-primary">AI</span><br />Melamar <span className="text-gradient-primary">100</span> Pekerjaan<br />Untuk Kamu
          </h1>
          <p className="mt-6 max-w-xl text-base md:text-lg text-muted-foreground leading-relaxed">
            Applify mengindeks Jobstreet, LinkedIn, Glints, dan 4 platform lain secara bersamaan — lalu mengirim lamaran yang sudah dioptimasi ATS atas nama kamu. Otomatis. 24/7.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/dashboard" className="inline-flex h-12 items-center rounded-xl gradient-primary px-6 text-sm font-semibold text-white glow-primary hover:opacity-95">
              Mulai Gratis <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <a href="#how" className="inline-flex h-12 items-center rounded-xl border border-white/10 bg-white/5 px-6 text-sm font-semibold hover:bg-white/10 transition">
              Lihat Demo →
            </a>
          </div>
          <div className="mt-8 flex items-center gap-4">
            <div className="flex -space-x-2">
              {["#4F8EF7","#7C5CFC","#00D4AA"].map((c,i) => (
                <div key={i} className="h-9 w-9 rounded-full border-2 border-background" style={{background:c}} />
              ))}
            </div>
            <p className="text-sm text-muted-foreground"><span className="font-mono font-bold text-foreground">12.400+</span> pencari kerja Indonesia sudah bergabung</p>
          </div>
        </div>

        <div className="relative hidden lg:block">
          <div className="absolute -inset-8 bg-gradient-to-br from-primary/20 to-violet/20 blur-3xl rounded-full" />
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
                <div key={i} className="flex items-center gap-3 rounded-lg bg-white/[0.03] border border-white/5 p-3">
                  <div className="h-8 w-8 rounded-md gradient-primary grid place-items-center text-xs font-bold text-white">{it.c[0]}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{it.c}</p>
                    <p className="text-xs text-muted-foreground truncate">{it.r}</p>
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider rounded-full px-2 py-1 font-semibold ${it.tone==='teal'?'bg-teal/15 text-teal':it.tone==='gold'?'bg-gold/15 text-gold':'bg-primary/15 text-primary'}`}>{it.s}</span>
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
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  const color = tone==='teal'?'text-teal':tone==='gold'?'text-gold':tone==='warm'?'text-warm':'text-primary';
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`font-mono text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    { icon: Brain, title: "Upload Profil Sekali", desc: "AI mempelajari pengalaman dan preferensi karier kamu dalam hitungan menit." },
    { icon: Bot, title: "AI Bekerja 24/7", desc: "Agen mengindeks 7 platform, menulis ulang resume, dan mengirim lamaran otomatis." },
    { icon: CalendarCheck, title: "Terima Undangan Interview", desc: "Fokus pada persiapan interview, biarkan agen mengurus sisanya." },
  ];
  return (
    <section id="how" className="bg-card/40 border-y border-white/5">
      <div className="mx-auto max-w-7xl px-4 py-20 md:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold">Cara Kerja</p>
          <h2 className="mt-3 text-3xl md:text-5xl font-bold tracking-tight">Tiga langkah sampai interview</h2>
        </div>
        <div className="mt-14 grid gap-8 md:grid-cols-3 relative">
          <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          {steps.map((s, i) => (
            <div key={i} className="relative glass rounded-2xl p-6 text-center">
              <div className="mx-auto h-16 w-16 rounded-2xl gradient-primary grid place-items-center text-white shadow-lg glow-primary">
                <s.icon className="h-7 w-7" />
              </div>
              <p className="mt-5 font-mono text-xs text-muted-foreground">LANGKAH 0{i+1}</p>
              <h3 className="mt-2 text-xl font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
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
          badge={{ text: "Social Impact", className: "gradient-warm text-white" }}
        />
        <FeatureCard
          icon={Zap}
          title="Golden Window Sniper"
          desc="Lamar dalam 2 jam pertama setelah posting — peluang callback 4x lebih tinggi."
          badge={{ text: "Real-time", className: "bg-teal/20 text-teal border border-teal/40" }}
        />
        <div className="md:col-span-3">
          <FeatureCard
            icon={Radar}
            title="Skill Radar"
            desc="Visualisasi gap skill kamu vs tren pasar real-time. Terhubung langsung ke Dicoding & platform learning."
            badge={{ text: "Smart Learning", className: "bg-violet/20 text-violet border border-violet/40" }}
            wide
          />
        </div>
      </div>
    </section>
  );
}

function FeatureBig() {
  return (
    <div className="md:row-span-2 glass rounded-3xl p-7 relative overflow-hidden group">
      <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-primary/30 blur-3xl group-hover:bg-primary/40 transition" />
      <div className="relative">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-primary/20 to-violet/20 border border-primary/30 px-3 py-1 text-xs font-semibold text-primary">
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
            <div key={i} className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
              <div className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium">{row.c}</p>
                  <p className="text-xs text-muted-foreground font-mono">{row.ats}</p>
                </div>
                <span className="font-mono text-sm font-bold text-teal">{row.m}%</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
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
        <div className="mt-4 h-11 w-11 rounded-xl bg-gradient-to-br from-primary/20 to-violet/20 border border-primary/30 grid place-items-center text-primary">
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
      <defs>
        <linearGradient id="rg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4F8EF7" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#7C5CFC" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      {[80,60,40,20].map(r => <polygon key={r} points={pentagon(100,100,r)} fill="none" stroke="rgba(255,255,255,0.07)" />)}
      <polygon points={pentagon(100,100,80)} fill="none" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
      <polygon points="100,30 170,75 145,150 60,155 35,80" fill="url(#rg)" stroke="#4F8EF7" strokeWidth="2" />
    </svg>
  );
}
function pentagon(cx: number, cy: number, r: number) {
  return Array.from({length:5},(_,i)=>{const a=-Math.PI/2+i*2*Math.PI/5;return `${cx+r*Math.cos(a)},${cy+r*Math.sin(a)}`}).join(' ');
}

function PlatformMarquee() {
  const items = [...platforms, ...platforms];
  return (
    <section className="border-y border-white/5 py-12 overflow-hidden">
      <p className="text-center text-sm uppercase tracking-[0.2em] text-muted-foreground">Satu dashboard. Semua platform.</p>
      <div className="mt-8 flex animate-marquee gap-12 whitespace-nowrap">
        {items.map((p, i) => (
          <div key={i} className="text-2xl md:text-3xl font-bold text-muted-foreground/60 hover:text-foreground transition shrink-0">{p}</div>
        ))}
      </div>
    </section>
  );
}

function Pricing() {
  const tiers = [
    { name: "Free", price: "Gratis", per: "selamanya", features: ["10 lamaran/bulan", "3 platform", "Resume rewrite dasar", "Skill radar (read-only)"] },
    { name: "Pro", price: "Rp 69.000", per: "/bulan", popular: true, features: ["100 lamaran/bulan", "Semua 7 platform", "Collective ATS Intelligence", "Golden Window Sniper", "Blind Merit Mode", "Prioritas dukungan"] },
    { name: "Annual", price: "Rp 299.000", per: "/tahun", features: ["Semua fitur Pro", "Hemat 64%", "Skill Radar premium", "Karier coach 1-on-1 bulanan"] },
  ];
  return (
    <section id="pricing" className="mx-auto max-w-7xl px-4 py-20 md:px-8">
      <div className="text-center max-w-2xl mx-auto">
        <p className="text-xs uppercase tracking-[0.2em] text-gold font-semibold">Pricing</p>
        <h2 className="mt-3 text-3xl md:text-5xl font-bold tracking-tight">Mulai gratis, upgrade saat siap.</h2>
      </div>
      <div className="mt-12 grid gap-6 md:grid-cols-3 md:items-stretch">
        {tiers.map((t) => (
          <div key={t.name} className={`relative glass rounded-3xl p-7 flex flex-col ${t.popular?'md:scale-[1.04] border-primary/40 shadow-2xl glow-primary':''}`}>
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
            <Link to="/dashboard" className={`mt-7 inline-flex justify-center items-center h-11 rounded-xl text-sm font-semibold transition ${t.popular?'gradient-primary text-white glow-primary':'border border-white/10 bg-white/5 hover:bg-white/10'}`}>
              {t.name === 'Free' ? 'Mulai Gratis' : 'Pilih Paket'}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="relative mx-auto max-w-7xl px-4 py-20 md:px-8">
      <div className="relative overflow-hidden rounded-3xl glass p-10 md:p-16 text-center">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-violet/15 to-teal/10" />
        <div className="relative">
          <Rocket className="h-12 w-12 mx-auto text-gradient-primary" />
          <h2 className="mt-6 text-3xl md:text-5xl font-bold tracking-tight max-w-2xl mx-auto">
            Sudah saatnya AI bekerja untuk <span className="text-gradient-primary">kariermu.</span>
          </h2>
          <p className="mt-4 text-muted-foreground max-w-xl mx-auto">Gabung 12.400+ pencari kerja Indonesia yang sudah membiarkan agen melakukan kerja berat.</p>
          <Link to="/dashboard" className="mt-8 inline-flex h-14 items-center rounded-2xl gradient-primary px-8 text-base font-semibold text-white glow-primary">
            Aktifkan Agen Sekarang <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/5 mt-10 pb-24 md:pb-10">
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

function MobileStickyBar() {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass-strong border-t border-white/10 px-4 py-3 flex gap-2">
      <a href="#" className="flex-1 h-11 rounded-xl border border-white/10 bg-white/5 grid place-items-center text-sm font-semibold">Login</a>
      <Link to="/dashboard" className="flex-[2] h-11 rounded-xl gradient-primary grid place-items-center text-sm font-semibold text-white glow-primary">Mulai Gratis</Link>
    </div>
  );
}

