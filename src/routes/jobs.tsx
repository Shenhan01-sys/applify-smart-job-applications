import { createFileRoute } from "@tanstack/react-router";
import AppShell from "@/components/app/AppShell";
import { Search, MapPin, Bookmark, EyeOff, Zap, SlidersHorizontal } from "lucide-react";

export const Route = createFileRoute("/jobs")({
  head: () => ({ meta: [{ title: "Job Feed — Applify" }] }),
  component: JobsPage,
});

const jobs = [
  { c: "Gojek", r: "Senior Backend Engineer", p: "LinkedIn", l: "Jakarta", w: "Hybrid", s: "Rp 35-50jt", m: 92, golden: true, age: "1 jam lalu" },
  { c: "Tokopedia", r: "Product Manager - Fintech", p: "Jobstreet", l: "Jakarta", w: "Hybrid", s: "Rp 40-60jt", m: 84, golden: true, age: "47 menit lalu" },
  { c: "Shopee", r: "Data Analyst", p: "Glints", l: "Jakarta", w: "Onsite", s: "Rp 18-25jt", m: 76, golden: false, age: "5 jam lalu" },
  { c: "BCA Digital", r: "UI/UX Designer", p: "Kalibrr", l: "Jakarta", w: "Onsite", s: "Rp 20-30jt", m: 88, golden: false, age: "Kemarin" },
  { c: "Bukalapak", r: "Backend Engineer", p: "KitaLulus", l: "Bandung", w: "Remote", s: "Rp 22-32jt", m: 71, golden: false, age: "2 hari" },
  { c: "Dana", r: "Mobile Engineer iOS", p: "Dealls", l: "Jakarta", w: "Hybrid", s: "Rp 28-42jt", m: 65, golden: true, age: "20 menit lalu" },
];

const platformColor: Record<string, string> = {
  LinkedIn: "bg-[#0A66C2]/15 text-[#5BA0FF] border-[#0A66C2]/30",
  Jobstreet: "bg-[#E8192C]/15 text-[#FF6B7A] border-[#E8192C]/30",
  Glints: "bg-[#0BD461]/15 text-[#3DEA8A] border-[#0BD461]/30",
  KitaLulus: "bg-[#FF6B00]/15 text-[#FFA866] border-[#FF6B00]/30",
  Kalibrr: "bg-[#2563EB]/15 text-[#7AA8FF] border-[#2563EB]/30",
  Dealls: "bg-[#6366F1]/15 text-[#9DA0FF] border-[#6366F1]/30",
};

function JobsPage() {
  return (
    <AppShell>
      <header className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Job Feed</h1>
            <p className="text-muted-foreground text-sm mt-1">Diindeks dari 7 platform · diperbarui 2 menit lalu</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warm/15 text-warm border border-warm/40 px-3 py-1.5 text-xs font-bold">
            <Zap className="h-3.5 w-3.5" /> 3 Golden Window aktif
          </span>
        </div>
        <div className="mt-5 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input placeholder="Cari posisi, perusahaan, atau skill..." className="w-full glass rounded-xl pl-11 pr-4 h-12 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/40" />
          </div>
          <button className="h-12 px-5 rounded-xl border border-white/10 bg-white/5 inline-flex items-center gap-2 text-sm">
            <SlidersHorizontal className="h-4 w-4" /> Filter
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {["Semua Platform", "Remote", "Full-time", "Gaji ≥ 20jt", "ATS ≥ 80%", "Golden Window"].map((f, i) => (
            <button key={f} className={`text-xs px-3 py-1.5 rounded-full border ${i===0?'gradient-primary text-white border-transparent':'border-white/10 bg-white/5 text-muted-foreground hover:text-foreground'}`}>{f}</button>
          ))}
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {jobs.map((j, i) => (
          <article key={i} className={`glass rounded-2xl p-5 hover:scale-[1.01] transition relative ${j.golden?'border-warm/30 shadow-[0_0_24px_rgba(255,154,60,0.15)]':''}`}>
            {j.golden && (
              <span className="absolute -top-2 left-5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-warm/20 text-warm border border-warm/50 animate-pulse-glow">
                <Zap className="h-3 w-3"/> Golden Window
              </span>
            )}
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl gradient-primary grid place-items-center text-white font-bold shrink-0">{j.c[0]}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-base truncate">{j.r}</h3>
                </div>
                <p className="text-sm text-muted-foreground">{j.c} · {j.age}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border font-semibold ${platformColor[j.p]}`}>{j.p}</span>
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><MapPin className="h-3 w-3"/>{j.l}</span>
                  <span className="text-xs text-muted-foreground">· {j.w}</span>
                  <span className="text-xs text-teal font-mono">{j.s}</span>
                </div>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-muted-foreground">Match Rate ATS</span>
                <span className="font-mono font-bold">{j.m}%</span>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${j.m>=80?'gradient-success':j.m>=60?'gradient-primary':j.m>=40?'gradient-warm':'bg-danger'}`} style={{width:`${j.m}%`}}/>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button className="flex-1 h-10 rounded-lg gradient-primary text-white text-sm font-semibold glow-primary">Lamar Sekarang</button>
              <button className="h-10 w-10 rounded-lg border border-white/10 bg-white/5 grid place-items-center hover:text-gold transition" aria-label="Simpan"><Bookmark className="h-4 w-4"/></button>
              <button className="h-10 w-10 rounded-lg border border-white/10 bg-white/5 grid place-items-center hover:text-violet transition" aria-label="Blind Mode"><EyeOff className="h-4 w-4"/></button>
            </div>
          </article>
        ))}
      </div>
    </AppShell>
  );
}
