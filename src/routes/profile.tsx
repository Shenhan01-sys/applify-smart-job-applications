import { createFileRoute } from "@tanstack/react-router";
import AppShell from "@/components/app/AppShell";
import { EyeOff, Download, FileCheck2, ChevronRight } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile — Applify" }] }),
  component: ProfilePage,
});

const steps = ["Profil Dasar", "Pengalaman", "Skill", "Preferensi", "Review"];

function ProfilePage() {
  const [step, setStep] = useState(1);
  const [blind, setBlind] = useState(false);
  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Persona AI Kamu</h1>
        <p className="text-muted-foreground text-sm mt-1">Setup sekali, pakai untuk semua lamaran.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="glass rounded-2xl p-5 md:p-6">
          {/* Stepper */}
          <div className="flex items-center justify-between mb-5">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center flex-1 last:flex-none">
                <div className={`h-8 w-8 rounded-full grid place-items-center text-xs font-bold ${i+1<=step?'gradient-primary text-white':'bg-white/5 text-muted-foreground border border-white/10'}`}>{i+1}</div>
                {i<steps.length-1 && <div className={`flex-1 h-px mx-2 ${i+1<step?'bg-primary':'bg-white/10'}`}/>}
              </div>
            ))}
          </div>
          <p className="text-[10px] uppercase tracking-wider text-primary font-bold">Langkah {step}/{steps.length}</p>
          <h2 className="mt-1 text-xl font-bold">{steps[step-1]}</h2>
          <p className="mt-2 text-sm text-muted-foreground">Ceritakan pengalaman kerja terakhir kamu. Agen akan menggunakan ini untuk menulis ulang resume per lowongan.</p>

          <div className="mt-5 space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Posisi Terakhir</label>
              <input defaultValue="Backend Engineer" className="mt-1.5 w-full h-11 rounded-lg bg-white/5 border border-white/10 px-4 text-sm focus:border-primary/40 focus:outline-none"/>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Bidang Industri</label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {["Fintech","E-commerce","SaaS","Healthtech","Edtech","Logistik"].map((t,i) => (
                  <button key={t} className={`text-xs px-3 py-1.5 rounded-full border ${i<2?'gradient-primary text-white border-transparent':'border-white/10 bg-white/5 text-muted-foreground'}`}>{t}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Gaji Minimum</label>
              <div className="mt-3 flex items-center gap-3">
                <input type="range" defaultValue={25} min={5} max={100} className="flex-1 accent-primary"/>
                <span className="font-mono text-sm font-bold w-20 text-right">Rp 25jt</span>
              </div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Tipe Kerja</label>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {["Remote","Hybrid","Onsite"].map((t,i) => (
                  <button key={t} className={`h-10 rounded-lg border text-sm ${i<2?'border-primary/40 bg-primary/10 text-primary':'border-white/10 bg-white/5'}`}>{t}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-6 flex justify-between">
            <button onClick={()=>setStep(Math.max(1,step-1))} className="h-11 px-5 rounded-xl border border-white/10 bg-white/5 text-sm">Kembali</button>
            <button onClick={()=>setStep(Math.min(steps.length,step+1))} className="h-11 px-5 rounded-xl gradient-primary text-white text-sm font-semibold inline-flex items-center gap-2 glow-primary">Lanjut <ChevronRight className="h-4 w-4"/></button>
          </div>
        </div>

        {/* Resume preview */}
        <div className="glass rounded-2xl p-5 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">Live Resume Preview</h2>
              <p className="text-xs text-muted-foreground">Diperbarui otomatis dari profil kamu</p>
            </div>
            <button onClick={()=>setBlind(!blind)} className={`text-xs px-3 py-1.5 rounded-full border inline-flex items-center gap-1.5 ${blind?'border-violet/40 bg-violet/15 text-violet':'border-white/10 bg-white/5 text-muted-foreground'}`}>
              <EyeOff className="h-3.5 w-3.5"/> Blind Mode
            </button>
          </div>
          <div className="rounded-xl bg-white/[0.04] border border-white/10 p-5 text-sm">
            <div className={`pb-3 border-b border-white/10 transition-all ${blind?'opacity-30 blur-[2px]':''}`}>
              <p className="text-base font-bold">Rizky Aditya Pratama</p>
              <p className="text-xs text-muted-foreground">Universitas Indonesia · Jakarta</p>
            </div>
            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-wider text-primary font-bold">Skill Utama</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {["Go","PostgreSQL","gRPC","Kubernetes","Redis","Kafka"].map(s => (
                  <span key={s} className="text-[11px] px-2 py-1 rounded-full bg-primary/15 text-primary border border-primary/30 font-mono">{s}</span>
                ))}
              </div>
            </div>
            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-wider text-teal font-bold">Pencapaian</p>
              <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                <li>• Skala API ke 12K req/s di startup fintech</li>
                <li>• Mengurangi latency P99 dari 800ms → 120ms</li>
                <li>• Memimpin migrasi monolith → microservices (8 services)</li>
              </ul>
            </div>
            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-wider text-gold font-bold">Pengalaman</p>
              <div className={`mt-2 text-xs transition-all ${blind?'opacity-30 blur-[2px]':''}`}>
                <p className="font-semibold">Senior Backend · Tokopedia</p>
                <p className="text-muted-foreground">2022 — sekarang</p>
              </div>
            </div>
          </div>
          {blind && (
            <p className="mt-3 text-xs text-violet">Blind Mode aktif — nama institusi & latar belakang sosial disembunyikan, skill diprioritaskan.</p>
          )}
          <div className="mt-4 flex gap-2">
            <button className="flex-1 h-10 rounded-lg border border-white/10 bg-white/5 text-sm inline-flex items-center justify-center gap-2"><Download className="h-4 w-4"/> Unduh PDF</button>
            <button className="flex-1 h-10 rounded-lg gradient-success text-white text-sm font-semibold inline-flex items-center justify-center gap-2 glow-success"><FileCheck2 className="h-4 w-4"/> Test ATS</button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
