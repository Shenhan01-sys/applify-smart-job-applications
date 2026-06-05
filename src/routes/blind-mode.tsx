import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import { EyeOff, Sparkles, ShieldCheck } from "lucide-react";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

export const Route = createFileRoute("/blind-mode")({
  beforeLoad: async () => {
    if (isMockMode()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Blind Merit Mode — Applify" }] }),
  component: () => (
    <AppShell>
      <div className="max-w-3xl animate-fade-in-up">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#16150F] text-white px-3 py-1 text-xs font-bold"><EyeOff className="h-3.5 w-3.5"/> Blind Merit Mode</span>
        <h1 className="mt-4 text-3xl md:text-4xl font-bold tracking-tight">Biarkan skill berbicara <span className="text-gradient-primary">lebih dulu.</span></h1>
        <p className="mt-3 text-muted-foreground">Sembunyikan nama, kampus, dan latar belakang sosial dari resume kamu. Recruiter melihat skill dan pencapaian terlebih dahulu — identitas dibuka setelah shortlist.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            { i: ShieldCheck, t: "Anti-Bias", d: "Kurangi pengaruh nama, gender, dan asal kampus pada keputusan awal." },
            { i: Sparkles, t: "Skill First", d: "Resume direstrukturisasi: skill & impact di atas, identitas di bawah." },
            { i: EyeOff, t: "Sekali Klik", d: "Toggle ON/OFF kapan saja — agen otomatis menyesuaikan untuk setiap lamaran." },
          ].map((c, i) => (
            <div key={c.t} className="glass rounded-2xl p-5 hover:shadow-md transition-all duration-300" style={{ animation: `fadeInUp 0.4s ease-out ${0.15 + i * 0.1}s both` }}>
              <c.i className="h-6 w-6 text-violet"/>
              <p className="mt-3 font-semibold">{c.t}</p>
              <p className="mt-1 text-sm text-muted-foreground">{c.d}</p>
            </div>
          ))}
        </div>
        <Link to="/profile" className="mt-8 inline-flex h-11 items-center rounded-xl gradient-primary px-5 text-sm font-semibold text-white glow-primary animate-fade-in-up" style={{ animationDelay: '0.4s' }}>Aktifkan di Profil →</Link>
      </div>
    </AppShell>
  ),
});
