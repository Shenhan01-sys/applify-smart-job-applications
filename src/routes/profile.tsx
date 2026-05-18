import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import { EyeOff, Download, FileCheck2, ChevronRight, Loader2, Save } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/profile")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Profile — Applify" }] }),
  component: ProfilePage,
});

const steps = ["Profil Dasar", "Pengalaman", "Skill", "Preferensi", "Review"];

function ProfilePage() {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [blind, setBlind] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [formData, setFormData] = useState({
    full_name: "",
    current_title: "",
    location: "",
    experience_years: 0,
    skills: [] as string[],
    phone: "",
  });

  useEffect(() => {
    async function loadProfile() {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user?.id)
        .single();
      if (data) {
        setProfile(data);
        setFormData({
          full_name: data.full_name || "",
          current_title: data.current_title || "",
          location: data.location || "",
          experience_years: data.experience_years || 0,
          skills: data.skills || [],
          phone: data.phone || "",
        });
      }
      setLoading(false);
    }
    if (user) loadProfile();
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    await supabase
      .from("profiles")
      .upsert({
        id: user?.id,
        ...formData,
        updated_at: new Date().toISOString(),
      });
    setSaving(false);
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  const initials = (formData.full_name || user?.email || "U").slice(0, 2).toUpperCase();
  const displayName = formData.full_name || user?.email?.split("@")[0] || "User";

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
                <div className={`h-8 w-8 rounded-full grid place-items-center text-xs font-bold ${i+1<=step?'gradient-primary text-white':'bg-black/[4%] text-muted-foreground border border-black/[8%]'}`}>{i+1}</div>
                {i<steps.length-1 && <div className={`flex-1 h-px mx-2 ${i+1<step?'bg-primary':'bg-black/[6%]'}`}/>}
              </div>
            ))}
          </div>
          <p className="text-[10px] uppercase tracking-wider text-primary font-bold">Langkah {step}/{steps.length}</p>
          <h2 className="mt-1 text-xl font-bold">{steps[step-1]}</h2>
          <p className="mt-2 text-sm text-muted-foreground">Ceritakan pengalaman kerja terakhir kamu. Agen akan menggunakan ini untuk menulis ulang resume per lowongan.</p>

          <div className="mt-5 space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Nama Lengkap</label>
              <input 
                value={formData.full_name}
                onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                placeholder="Contoh: Rizky Aditya"
                className="mt-1.5 w-full h-11 rounded-lg bg-black/[4%] border border-black/[8%] px-4 text-sm focus:border-primary/40 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Posisi / Jabatan Terakhir</label>
              <input 
                value={formData.current_title}
                onChange={(e) => setFormData({...formData, current_title: e.target.value})}
                placeholder="Contoh: Backend Engineer"
                className="mt-1.5 w-full h-11 rounded-lg bg-black/[4%] border border-black/[8%] px-4 text-sm focus:border-primary/40 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Lokasi</label>
              <input 
                value={formData.location}
                onChange={(e) => setFormData({...formData, location: e.target.value})}
                placeholder="Contoh: Jakarta, Indonesia"
                className="mt-1.5 w-full h-11 rounded-lg bg-black/[4%] border border-black/[8%] px-4 text-sm focus:border-primary/40 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Tahun Pengalaman</label>
              <input 
                type="number"
                value={formData.experience_years}
                onChange={(e) => setFormData({...formData, experience_years: parseInt(e.target.value) || 0})}
                className="mt-1.5 w-full h-11 rounded-lg bg-black/[4%] border border-black/[8%] px-4 text-sm focus:border-primary/40 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Skill (pisahkan dengan koma)</label>
              <input 
                value={formData.skills.join(", ")}
                onChange={(e) => setFormData({...formData, skills: e.target.value.split(",").map(s => s.trim()).filter(Boolean)})}
                placeholder="Go, PostgreSQL, Kubernetes, Redis"
                className="mt-1.5 w-full h-11 rounded-lg bg-black/[4%] border border-black/[8%] px-4 text-sm focus:border-primary/40 focus:outline-none"
              />
            </div>
          </div>
          <div className="mt-6 flex justify-between">
            <button onClick={()=>setStep(Math.max(1,step-1))} className="h-11 px-5 rounded-xl border border-black/[8%] bg-black/[4%] text-sm hover:bg-black/[7%] transition">Kembali</button>
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving} className="h-11 px-5 rounded-xl border border-primary/30 bg-primary/5 text-primary text-sm font-semibold inline-flex items-center gap-2 hover:bg-primary/10 transition disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Simpan
              </button>
              <button onClick={()=>setStep(Math.min(steps.length,step+1))} className="h-11 px-5 rounded-xl gradient-primary text-white text-sm font-semibold inline-flex items-center gap-2 hover:opacity-90 transition">Lanjut <ChevronRight className="h-4 w-4"/></button>
            </div>
          </div>
        </div>

        {/* Resume preview */}
        <div className="glass rounded-2xl p-5 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">Live Resume Preview</h2>
              <p className="text-xs text-muted-foreground">Diperbarui otomatis dari profil kamu</p>
            </div>
            <button onClick={()=>setBlind(!blind)} className={`text-xs px-3 py-1.5 rounded-full border inline-flex items-center gap-1.5 transition ${blind?'border-[#161616] bg-[#161616] text-white':'border-black/[8%] bg-black/[4%] text-muted-foreground'}`}>
              <EyeOff className="h-3.5 w-3.5"/> Blind Mode
            </button>
          </div>
          <div className="rounded-xl bg-black/[4%] border border-black/[8%] p-5 text-sm">
            <div className={`pb-3 border-b border-black/[8%] transition-all ${blind?'opacity-30 blur-[2px]':''}`}>
              <p className="text-base font-bold">{displayName}</p>
              <p className="text-xs text-muted-foreground">{formData.location || "Lokasi belum diisi"} · {formData.experience_years} tahun pengalaman</p>
            </div>
            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-wider text-primary font-bold">Skill Utama</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {formData.skills.length > 0 ? formData.skills.map(s => (
                  <span key={s} className="text-[11px] px-2 py-1 rounded-full bg-[#0367FC] text-white font-mono">{s}</span>
                )) : (
                  <span className="text-xs text-muted-foreground">Belum ada skill</span>
                )}
              </div>
            </div>
            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-wider text-teal font-bold">Kontak</p>
              <p className="mt-2 text-xs text-muted-foreground">{user?.email}</p>
              {formData.phone && <p className="text-xs text-muted-foreground">{formData.phone}</p>}
            </div>
            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-wider text-gold font-bold">Posisi Target</p>
              <div className={`mt-2 text-xs transition-all ${blind?'opacity-30 blur-[2px]':''}`}>
                <p className="font-semibold">{formData.current_title || "Belum diisi"}</p>
              </div>
            </div>
          </div>
          {blind && (
            <p className="mt-3 text-xs text-violet">Blind Mode aktif — nama institusi & latar belakang sosial disembunyikan, skill diprioritaskan.</p>
          )}
          <div className="mt-4 flex gap-2">
            <button className="flex-1 h-10 rounded-lg border border-black/[8%] bg-black/[4%] text-sm inline-flex items-center justify-center gap-2 hover:bg-black/[7%] transition"><Download className="h-4 w-4"/> Unduh PDF</button>
            <button className="flex-1 h-10 rounded-lg gradient-success text-[#161616] text-sm font-semibold inline-flex items-center justify-center gap-2"><FileCheck2 className="h-4 w-4"/> Test ATS</button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
