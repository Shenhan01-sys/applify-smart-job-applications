import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import { 
  EyeOff, Download, FileCheck2, ChevronRight, ChevronLeft, 
  Loader2, Save, Briefcase, GraduationCap, Award, Wrench, 
  Target, CheckCircle2, User, MapPin, Phone, Link2, Mail,
  Calendar, DollarSign, Clock,
  Layers, Sparkles
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
// Sample profile data is only used in the explicit demo mode (VITE_MOCK_MODE=true). A real user starts empty.
import {
  mockProfile as mockProfileData,
  mockWorkExperiences,
  mockEducation,
  mockCertifications,
  mockUserSkills,
} from "@/mocks/mockData";
import { profileService } from "@/services/profileService";
import { ExperienceEditor, EducationEditor, SkillsEditor } from "@/components/profile/ProfileEditors";
import {
  buildProfileRow,
  formatMonthYear,
  profileGaps,
  sortExperiences,
  sortEducation,
  sortSkills,
  EMPLOYMENT_TYPES,
  type EducationRow,
  type ExperienceRow,
  type SkillRow,
} from "@/lib/profileForms";
import { toast } from "sonner";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

export const Route = createFileRoute("/profile")({
  beforeLoad: async () => {
    if (isMockMode()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Profile — Applify" }] }),
  component: ProfilePage,
});

const steps = [
  { id: 1, label: "Profil Dasar", icon: User },
  { id: 2, label: "Pengalaman", icon: Briefcase },
  { id: 3, label: "Pendidikan", icon: GraduationCap },
  { id: 4, label: "Preferensi", icon: Target },
  { id: 5, label: "Review", icon: CheckCircle2 },
];

// Keyframes for smooth animations
const slideInRight = `
  @keyframes slideInRight {
    from { opacity: 0; transform: translateX(30px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes slideInLeft {
    from { opacity: 0; transform: translateX(-30px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(15px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes pulse-ring {
    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(3, 103, 252, 0.4); }
    70% { transform: scale(1); box-shadow: 0 0 0 8px rgba(3, 103, 252, 0); }
    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(3, 103, 252, 0); }
  }
  @keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-5px); }
  }
`;

function ProfilePage() {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const [animKey, setAnimKey] = useState(0);
  const [blind, setBlind] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSaveToast, setShowSaveToast] = useState(false);
  
  // Form states
  const [formData, setFormData] = useState({
    full_name: "",
    current_title: "",
    location: "",
    experience_years: 0,
    phone: "",
    email: "",
    linkedin_url: "",
    portfolio_url: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  // Real accounts start empty and fill these from the database; the sample rows are demo mode only.
  const [workExps, setWorkExps] = useState<any[]>(() => (isMockMode() ? [...mockWorkExperiences] : []));
  const [educations, setEducations] = useState<any[]>(() => (isMockMode() ? [...mockEducation] : []));
  const [certs, setCerts] = useState<any[]>(() => (isMockMode() ? [...mockCertifications] : []));
  const [userSkills, setUserSkills] = useState<any[]>(() => (isMockMode() ? [...mockUserSkills] : []));
  // Preferences are not stored by this page yet (the agent criteria live in Pengaturan Agen), so a real
  // account starts with neutral values instead of invented ones.
  const [preferences, setPreferences] = useState(() =>
    isMockMode()
      ? { desired_salary: 40000000, current_ctc: 30000000, notice_period: 30, job_type: "full-time", work_type: "hybrid", search_location: "Jakarta" }
      : { desired_salary: 0, current_ctc: 0, notice_period: 0, job_type: "full-time", work_type: "hybrid", search_location: "" },
  );

  useEffect(() => {
    async function loadProfile() {
      if (isMockMode()) {
        const data = mockProfileData;
        setFormData({
          full_name: data.full_name || "",
          current_title: data.current_title || "",
          location: data.location || "",
          experience_years: data.experience_years || 0,
          phone: data.phone || "",
          email: "demo@applify.id",
          linkedin_url: data.linkedin_url || "",
          portfolio_url: data.portfolio_url || "",
        });
        setLoading(false);
        return;
      }

      try {
        setLoadError("");
        const full = await profileService.getFullProfile(user!.id);
        const d = full.profile || {};
        setFormData({
          full_name: d.full_name || "",
          current_title: d.current_title || "",
          location: d.location || "",
          experience_years: d.experience_years || 0,
          phone: d.phone || "",
          email: user?.email || "",
          linkedin_url: d.linkedin_url || "",
          portfolio_url: d.portfolio_url || "",
        });
        setWorkExps(full.workExperiences);
        setEducations(full.education);
        setCerts(full.certifications);
        setUserSkills(full.skills);
      } catch (err: any) {
        console.error("Error loading profile:", err);
        setLoadError(err?.message || "Tidak dapat memuat profil.");
      } finally {
        setLoading(false);
      }
    }
    if (user) loadProfile();
  }, [user, reloadKey]);

  const changeStep = (newStep: number, dir: 'next' | 'prev') => {
    if (newStep < 1 || newStep > steps.length) return;
    setDirection(dir);
    setAnimKey(prev => prev + 1);
    setStep(newStep);
  };

  const handleSave = async () => {
    const built = buildProfileRow(formData);
    if (!built.ok) {
      setFormErrors(built.errors as Record<string, string>);
      setDirection('prev');
      setAnimKey(prev => prev + 1);
      setStep(1);
      toast.error("Periksa kolom profil dasar yang ditandai merah.");
      return;
    }
    setFormErrors({});
    setSaving(true);
    try {
      if (!isMockMode()) {
        // Only real columns of `profiles`: `email` belongs to the login account, not to this table.
        const { error } = await supabase.from("profiles").upsert({
          id: user?.id,
          ...built.row,
          updated_at: new Date().toISOString(),
        });
        if (error) throw error;
      }
      setShowSaveToast(true);
      setTimeout(() => setShowSaveToast(false), 2000);
    } catch (err: any) {
      toast.error(`Gagal menyimpan profil: ${err?.message || "coba lagi"}`);
    } finally {
      setSaving(false);
    }
  };

  // ---- Experience / education / skills: each change is saved right away (no "Simpan" needed) ----
  const newMockId = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const saveExperience = useCallback(async (row: ExperienceRow, id: string | null) => {
    let saved: any;
    if (isMockMode()) {
      saved = { ...(workExps.find((x) => x.id === id) ?? {}), ...row, id: id ?? newMockId("exp"), user_id: user?.id };
    } else {
      const res = id ? await profileService.updateWorkExperience(id, row) : await profileService.createWorkExperience(row);
      if (res.error) throw new Error(res.error.message);
      saved = res.data;
    }
    setWorkExps((prev) => (id ? prev.map((x) => (x.id === id ? saved : x)) : [saved, ...prev]));
    toast.success(id ? "Pengalaman diperbarui." : "Pengalaman ditambahkan.");
  }, [user, workExps]);

  const deleteExperience = useCallback(async (id: string) => {
    if (!isMockMode()) {
      const res = await profileService.deleteWorkExperience(id);
      if (res.error) { toast.error(`Gagal menghapus: ${res.error.message}`); return; }
    }
    setWorkExps((prev) => prev.filter((x) => x.id !== id));
    toast.success("Pengalaman dihapus.");
  }, []);

  const saveEducation = useCallback(async (row: EducationRow, id: string | null) => {
    let saved: any;
    if (isMockMode()) {
      saved = { ...(educations.find((x) => x.id === id) ?? {}), ...row, id: id ?? newMockId("edu"), user_id: user?.id };
    } else {
      const res = id ? await profileService.updateEducation(id, row) : await profileService.createEducation(row);
      if (res.error) throw new Error(res.error.message);
      saved = res.data;
    }
    setEducations((prev) => (id ? prev.map((x) => (x.id === id ? saved : x)) : [saved, ...prev]));
    toast.success(id ? "Pendidikan diperbarui." : "Pendidikan ditambahkan.");
  }, [user, educations]);

  const deleteEducation = useCallback(async (id: string) => {
    if (!isMockMode()) {
      const res = await profileService.deleteEducation(id);
      if (res.error) { toast.error(`Gagal menghapus: ${res.error.message}`); return; }
    }
    setEducations((prev) => prev.filter((x) => x.id !== id));
    toast.success("Pendidikan dihapus.");
  }, []);

  const saveSkill = useCallback(async (row: SkillRow, id: string | null) => {
    let saved: any;
    if (isMockMode()) {
      saved = { ...(userSkills.find((x) => x.id === id) ?? {}), ...row, id: id ?? newMockId("sk"), user_id: user?.id };
    } else {
      const res = id ? await profileService.updateSkill(id, row) : await profileService.createSkill(row);
      if (res.error) throw new Error(res.error.message);
      saved = res.data;
    }
    setUserSkills((prev) => (id ? prev.map((x) => (x.id === id ? saved : x)) : [saved, ...prev]));
    toast.success(id ? "Skill diperbarui." : "Skill ditambahkan.");
  }, [user, userSkills]);

  const deleteSkill = useCallback(async (id: string) => {
    if (!isMockMode()) {
      const res = await profileService.deleteSkill(id);
      if (res.error) { toast.error(`Gagal menghapus: ${res.error.message}`); return; }
    }
    setUserSkills((prev) => prev.filter((x) => x.id !== id));
    toast.success("Skill dihapus.");
  }, []);

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  const displayName = formData.full_name || user?.email?.split("@")[0] || "User";
  const animClass = direction === 'next' ? 'animate-slide-right' : 'animate-slide-left';

  return (
    <AppShell>
      <style>{slideInRight}</style>
      
      {/* Save Toast */}
      {showSaveToast && (
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-[fadeInUp_0.3s_ease-out]">
          <CheckCircle2 className="h-4 w-4" />
          <span className="text-sm font-semibold">Profil disimpan!</span>
        </div>
      )}

      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Persona AI Kamu</h1>
        <p className="text-muted-foreground text-sm mt-1">Setup sekali, pakai untuk semua lamaran.</p>
      </header>

      {loadError && (
        <div role="alert" className="mb-4 rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>Profil tidak dapat dimuat dari server ({loadError}). Data yang tampil di bawah belum tentu lengkap.</span>
          <button onClick={() => { setLoading(true); setReloadKey((k) => k + 1); }} className="h-8 px-3 rounded-lg bg-red-600 text-white text-xs font-semibold shrink-0">Coba lagi</button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* LEFT: Form Card */}
        <div className="glass rounded-2xl p-5 md:p-6 overflow-hidden">
          
          {/* Stepper */}
          <div className="flex items-center justify-between mb-6">
            {steps.map((s, i) => {
              const Icon = s.icon;
              const isActive = step === s.id;
              const isCompleted = step > s.id;
              return (
                <div key={s.id} className="flex items-center flex-1 last:flex-none">
                  <div 
                    className={`relative h-10 w-10 rounded-full grid place-items-center text-sm font-bold transition-all duration-300 ${
                      isActive 
                        ? 'bg-[#0A5BE0] text-white shadow-lg scale-110' 
                        : isCompleted 
                          ? 'bg-[#0A5BE0]/20 text-[#0A5BE0] border-2 border-[#0A5BE0]' 
                          : 'bg-black/[4%] text-muted-foreground border-2 border-black/[8%]'
                    }`}
                    style={isActive ? { animation: 'pulse-ring 2s infinite' } : {}}
                  >
                    {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-4 w-4" />}
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`flex-1 h-1 mx-2 rounded-full transition-all duration-500 ${
                      isCompleted ? 'bg-[#0A5BE0]' : 'bg-black/[6%]'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Step Info */}
          <div className="mb-5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-[#0A5BE0] font-bold bg-[#0A5BE0]/10 px-2 py-1 rounded-full">
                Langkah {step}/{steps.length}
              </span>
              {step === 5 && (
                <span className="text-[10px] uppercase tracking-wider text-green-600 font-bold bg-green-100 px-2 py-1 rounded-full flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Selesai
                </span>
              )}
            </div>
            <h2 className="mt-2 text-xl font-bold">{steps[step-1].label}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {step === 1 && "Ceritakan tentang dirimu. Agen akan menggunakan ini untuk personalisasi lamaran."}
              {step === 2 && "Tambahkan pengalaman kerja. Setiap perubahan langsung tersimpan."}
              {step === 3 && "Lengkapi pendidikan dan skills. Setiap perubahan langsung tersimpan."}
              {step === 4 && "Atur preferensi agar AI mencari pekerjaan yang sesuai."}
              {step === 5 && "Review profil kamu sebelum AI mulai bekerja."}
            </p>
          </div>

          {/* Step Content with Animation */}
          <div 
            key={animKey}
            className="min-h-[300px]"
            style={{
              animation: direction === 'next' 
                ? 'slideInRight 0.35s cubic-bezier(0.4, 0, 0.2, 1)' 
                : 'slideInLeft 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            {step === 1 && <Step1Basic formData={formData} setFormData={setFormData} errors={formErrors} />}
            {step === 2 && <ExperienceEditor items={workExps} onSave={saveExperience} onDelete={deleteExperience} />}
            {step === 3 && (
              <div className="space-y-6">
                <section aria-labelledby="edu-heading">
                  <h3 id="edu-heading" className="text-sm font-semibold flex items-center gap-2 mb-3">
                    <GraduationCap className="h-4 w-4 text-[#0A5BE0]" /> Pendidikan
                  </h3>
                  <EducationEditor items={educations} onSave={saveEducation} onDelete={deleteEducation} />
                </section>
                <section aria-labelledby="skill-heading">
                  <h3 id="skill-heading" className="text-sm font-semibold flex items-center gap-2 mb-3">
                    <Wrench className="h-4 w-4 text-[#0A5BE0]" /> Skills &amp; Keahlian
                  </h3>
                  <SkillsEditor items={userSkills} onSave={saveSkill} onDelete={deleteSkill} />
                </section>
              </div>
            )}
            {step === 4 && <Step4Preferences preferences={preferences} setPreferences={setPreferences} />}
            {step === 5 && <Step5Review formData={formData} workExps={workExps} educations={educations} userSkills={userSkills} preferences={preferences} />}
          </div>

          {/* Navigation Buttons */}
          <div className="mt-6 flex justify-between items-center pt-4 border-t border-black/[6%]">
            <button 
              onClick={() => changeStep(step - 1, 'prev')} 
              disabled={step === 1}
              className="h-11 px-5 rounded-xl border-2 border-black/[8%] bg-black/[4%] text-sm hover:bg-black/[7%] transition disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              <ChevronLeft className="h-4 w-4" /> Kembali
            </button>
            
            <div className="flex gap-2">
              <button 
                onClick={handleSave} 
                disabled={saving} 
                className="h-11 px-5 rounded-xl border-2 border-[#0A5BE0]/30 bg-[#0A5BE0]/5 text-[#0A5BE0] text-sm font-semibold inline-flex items-center gap-2 hover:bg-[#0A5BE0]/10 transition disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Simpan
              </button>
              
              {step < steps.length ? (
                <button 
                  onClick={() => changeStep(step + 1, 'next')} 
                  className="h-11 px-5 rounded-xl bg-[#0A5BE0] text-white text-sm font-semibold inline-flex items-center gap-2 hover:bg-[#0A5BE0]/90 transition shadow-lg shadow-[#0A5BE0]/20 hover:shadow-[#0A5BE0]/30 hover:-translate-y-0.5 active:translate-y-0"
                >
                  Lanjut <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button 
                  onClick={handleSave} 
                  className="h-11 px-5 rounded-xl bg-green-500 text-white text-sm font-semibold inline-flex items-center gap-2 hover:bg-green-600 transition shadow-lg shadow-green-500/20 hover:shadow-green-500/30 hover:-translate-y-0.5 active:translate-y-0"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Simpan &amp; Selesai
                </button>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Live Preview */}
        <div className="glass rounded-2xl p-5 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">Live Resume Preview</h2>
              <p className="text-xs text-muted-foreground">Diperbarui otomatis dari profil kamu</p>
            </div>
            <button 
              onClick={() => setBlind(!blind)} 
              className={`text-xs px-3 py-1.5 rounded-full border inline-flex items-center gap-1.5 transition-all duration-300 ${
                blind ? 'border-[#16150F] bg-[#16150F] text-white' : 'border-black/[8%] bg-black/[4%] text-muted-foreground hover:bg-black/[7%]'
              }`}
            >
              <EyeOff className="h-3.5 w-3.5"/> {blind ? 'Blind On' : 'Blind Mode'}
            </button>
          </div>
          
          <div className="rounded-xl bg-black/[4%] border-2 border-black/[8%] p-5 text-sm space-y-4 overflow-y-auto max-h-[600px]">
            {/* Header */}
            <div className={`pb-4 border-b border-black/[8%] transition-all duration-500 ${blind ? 'opacity-30 blur-[2px]' : ''}`}>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-[#0A5BE0] text-white grid place-items-center text-lg font-bold">
                  {displayName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="text-base font-bold">{displayName}</p>
                  <p className="text-xs text-muted-foreground">{formData.current_title || "Posisi belum diisi"}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {formData.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {formData.location}</span>}
                {formData.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {formData.phone}</span>}
                {formData.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {formData.email}</span>}
                {formData.linkedin_url && <span className="inline-flex items-center gap-1"><Link2 className="h-3 w-3" /> LinkedIn</span>}
              </div>
            </div>

            {/* Skills */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#0A5BE0] font-bold flex items-center gap-1">
                <Wrench className="h-3 w-3" /> Skill Utama
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {userSkills.length > 0 ? sortSkills(userSkills).map(s => (
                  <span key={s.id ?? s.name} className="text-[11px] px-2.5 py-1 rounded-full bg-[#0A5BE0] text-white font-medium">{s.name}</span>
                )) : (
                  <span className="text-xs text-muted-foreground">Belum ada skill</span>
                )}
              </div>
            </div>

            {/* Work Experience */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-teal-600 font-bold flex items-center gap-1">
                <Briefcase className="h-3 w-3" /> Pengalaman Kerja
              </p>
              <div className="mt-2 space-y-3">
                {workExps.length === 0 && <span className="text-xs text-muted-foreground">Belum ada pengalaman kerja</span>}
                {sortExperiences(workExps).map((exp, i) => (
                  <div key={exp.id ?? i} className={`text-xs transition-all duration-300 ${blind && i > 0 ? 'opacity-30 blur-[2px]' : ''}`}>
                    <p className="font-semibold">{exp.role_title}</p>
                    <p className="text-muted-foreground">{exp.company_name} · {EMPLOYMENT_TYPES.find((t) => t.value === exp.employment_type)?.label ?? exp.employment_type}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatMonthYear(exp.start_date)} — {exp.is_current ? "Sekarang" : formatMonthYear(exp.end_date) || "-"}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Education */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-amber-600 font-bold flex items-center gap-1">
                <GraduationCap className="h-3 w-3" /> Pendidikan
              </p>
              <div className="mt-2 space-y-2">
                {educations.length === 0 && <span className="text-xs text-muted-foreground">Belum ada riwayat pendidikan</span>}
                {sortEducation(educations).map((edu, i) => (
                  <div key={edu.id ?? i} className="text-xs">
                    <p className="font-semibold">{edu.institution}</p>
                    <p className="text-muted-foreground">{edu.degree} {edu.field_of_study && `· ${edu.field_of_study}`}</p>
                    <p className="text-[10px] text-muted-foreground">{edu.start_year ?? "-"} — {edu.is_current ? "Sekarang" : edu.end_year ?? "-"} {edu.gpa != null && `· IPK ${edu.gpa}/${edu.max_gpa ?? 4}`}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Certifications */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-purple-600 font-bold flex items-center gap-1">
                <Award className="h-3 w-3" /> Sertifikasi
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {certs.length === 0 && <span className="text-xs text-muted-foreground">Belum ada sertifikasi</span>}
                {certs.map((c, i) => (
                  <span key={c.id ?? i} className="text-[10px] px-2 py-0.5 rounded-md bg-purple-100 text-purple-700 border-2 border-purple-200">
                    {c.name}
                  </span>
                ))}
              </div>
            </div>

            {/* Blind Mode Notice */}
            {blind && (
              <div className="mt-3 p-3 rounded-lg bg-violet-50 border-2 border-violet-200 animate-[fadeInUp_0.4s_ease-out]">
                <p className="text-xs text-violet-700 font-medium">Blind Mode Aktif</p>
                <p className="text-[10px] text-violet-600 mt-0.5">Nama institusi & latar belakang sosial disembunyikan. Skill diprioritaskan.</p>
              </div>
            )}
          </div>
          
          <div className="mt-4 flex gap-2">
            <button className="flex-1 h-10 rounded-lg border-2 border-black/[8%] bg-black/[4%] text-sm inline-flex items-center justify-center gap-2 hover:bg-black/[7%] transition hover:-translate-y-0.5">
              <Download className="h-4 w-4"/> Unduh PDF
            </button>
            <button className="flex-1 h-10 rounded-lg bg-[#D2F801] text-[#16150F] text-sm font-semibold inline-flex items-center justify-center gap-2 hover:brightness-95 transition hover:-translate-y-0.5 shadow-sm">
              <FileCheck2 className="h-4 w-4"/> Test ATS
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ===== STEP COMPONENTS =====

function Step1Basic({ formData, setFormData, errors }: { 
  formData: any, 
  setFormData: React.Dispatch<React.SetStateAction<any>>,
  errors: Record<string, string>,
}) {
  const fields = [
    { key: 'full_name', label: 'Nama Lengkap', placeholder: 'Contoh: Rizky Aditya', icon: User, type: 'text' },
    { key: 'current_title', label: 'Posisi / Jabatan Terakhir', placeholder: 'Contoh: Senior Backend Engineer', icon: Briefcase, type: 'text' },
    { key: 'location', label: 'Lokasi', placeholder: 'Contoh: Jakarta, Indonesia', icon: MapPin, type: 'text' },
    { key: 'experience_years', label: 'Tahun Pengalaman', placeholder: '', icon: Calendar, type: 'number' },
    { key: 'phone', label: 'Nomor Telepon', placeholder: '+62 812-3456-7890', icon: Phone, type: 'text' },
    { key: 'email', label: 'Email', placeholder: 'nama@email.com', icon: Mail, type: 'email' },
    { key: 'linkedin_url', label: 'LinkedIn URL', placeholder: 'https://linkedin.com/in/username', icon: Link2, type: 'url' },
    { key: 'portfolio_url', label: 'Portfolio / Website', placeholder: 'https://www.portfolio.com/username', icon: Layers, type: 'url' },
  ];

  return (
    <div className="space-y-4">
      {fields.map((field, i) => {
        const Icon = field.icon;
        return (
          <div 
            key={field.key}
            className="group"
            style={{ animation: `fadeInUp 0.4s ease-out ${i * 0.05}s both` }}
          >
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5 text-[#0A5BE0]" /> {field.label}
            </label>
            <input 
              type={field.type}
              value={formData[field.key] || ''}
              onChange={(e) => setFormData({...formData, [field.key]: field.type === 'number' ? parseInt(e.target.value) || 0 : e.target.value})}
              placeholder={field.placeholder}
              readOnly={field.key === 'email'}
              aria-invalid={!!errors[field.key]}
              className="mt-1.5 w-full h-11 rounded-lg bg-black/[4%] border-2 border-black/[8%] px-4 text-sm focus:border-[#0A5BE0]/40 focus:outline-none focus:ring-2 focus:ring-[#0A5BE0]/10 transition-all duration-200 hover:border-black/[12%] aria-[invalid=true]:border-red-400 read-only:opacity-70 read-only:cursor-not-allowed"
            />
            {field.key === 'email' && <p className="mt-1 text-[11px] text-muted-foreground">Email akun login; tidak diubah dari halaman ini.</p>}
            {errors[field.key] && <p className="mt-1 text-xs text-red-600" role="alert">{errors[field.key]}</p>}
          </div>
        );
      })}
    </div>
  );
}

function Step4Preferences({ preferences, setPreferences }: { 
  preferences: any, 
  setPreferences: React.Dispatch<React.SetStateAction<any>>
}) {
  const prefFields = [
    { key: 'desired_salary', label: 'Gaji Yang Diharapkan', icon: DollarSign, prefix: 'Rp ', min: 0, step: 1000000 },
    { key: 'current_ctc', label: 'Gaji Saat Ini', icon: DollarSign, prefix: 'Rp ', min: 0, step: 1000000 },
    { key: 'notice_period', label: 'Masa Notice (hari)', icon: Clock, prefix: '', min: 0, step: 1 },
  ];

  return (
    <div className="space-y-5">
      <p className="text-xs text-amber-800 bg-amber-50 border-2 border-amber-200 rounded-lg p-3 leading-relaxed">
        Preferensi di langkah ini belum disimpan ke server. Kriteria pencarian yang dipakai agen diatur di halaman Pengaturan Agen.
      </p>
      <div className="space-y-4">
        {prefFields.map((field, i) => {
          const Icon = field.icon;
          return (
            <div 
              key={field.key}
              style={{ animation: `fadeInUp 0.4s ease-out ${i * 0.08}s both` }}
            >
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 text-[#0A5BE0]" /> {field.label}
              </label>
              <div className="mt-1.5 relative">
                {field.prefix && (
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{field.prefix}</span>
                )}
                <input 
                  type="number"
                  value={preferences[field.key]}
                  onChange={(e) => setPreferences({...preferences, [field.key]: parseInt(e.target.value) || 0})}
                  min={field.min}
                  step={field.step}
                  className={`w-full h-11 rounded-lg bg-black/[4%] border-2 border-black/[8%] text-sm focus:border-[#0A5BE0]/40 focus:outline-none focus:ring-2 focus:ring-[#0A5BE0]/10 transition-all ${field.prefix ? 'pl-10' : 'pl-4'} pr-4`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Job Type */}
      <div style={{ animation: `fadeInUp 0.4s ease-out 0.24s both` }}>
        <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
          <Briefcase className="h-3.5 w-3.5 text-[#0A5BE0]" /> Tipe Pekerjaan
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          {['full-time', 'part-time', 'contract', 'internship'].map((type) => (
            <button
              key={type}
              onClick={() => setPreferences({...preferences, job_type: type})}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all duration-200 ${
                preferences.job_type === type 
                  ? 'border-[#0A5BE0] bg-[#0A5BE0] text-white shadow-md' 
                  : 'border-black/[8%] bg-black/[4%] text-muted-foreground hover:border-black/[12%]'
              }`}
            >
              {type === 'full-time' ? 'Full-time' : type === 'part-time' ? 'Part-time' : type === 'contract' ? 'Kontrak' : 'Magang'}
            </button>
          ))}
        </div>
      </div>

      {/* Work Type */}
      <div style={{ animation: `fadeInUp 0.4s ease-out 0.32s both` }}>
        <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-[#0A5BE0]" /> Model Kerja
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          {['remote', 'hybrid', 'on-site'].map((type) => (
            <button
              key={type}
              onClick={() => setPreferences({...preferences, work_type: type})}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all duration-200 ${
                preferences.work_type === type 
                  ? 'border-[#0A5BE0] bg-[#0A5BE0] text-white shadow-md' 
                  : 'border-black/[8%] bg-black/[4%] text-muted-foreground hover:border-black/[12%]'
              }`}
            >
              {type === 'remote' ? 'Remote' : type === 'hybrid' ? 'Hybrid' : 'On-site'}
            </button>
          ))}
        </div>
      </div>

      {/* Location */}
      <div style={{ animation: `fadeInUp 0.4s ease-out 0.4s both` }}>
        <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-[#0A5BE0]" /> Lokasi Pencarian
        </label>
        <input 
          value={preferences.search_location}
          onChange={(e) => setPreferences({...preferences, search_location: e.target.value})}
          placeholder="Contoh: Jakarta, Singapore, Remote"
          className="mt-1.5 w-full h-11 rounded-lg bg-black/[4%] border-2 border-black/[8%] px-4 text-sm focus:border-[#0A5BE0]/40 focus:outline-none focus:ring-2 focus:ring-[#0A5BE0]/10 transition-all"
        />
      </div>
    </div>
  );
}

function Step5Review({ formData, workExps, educations, userSkills, preferences }: any) {
  return (
    <div className="space-y-5">
      {/* Profile Summary */}
      <div 
        className="rounded-xl bg-[#0A5BE0]/5 border-2 border-[#0A5BE0]/20 p-4"
        style={{ animation: `fadeInUp 0.4s ease-out 0s both` }}
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-[#0A5BE0] text-white grid place-items-center text-sm font-bold">
            {formData.full_name?.slice(0, 2)?.toUpperCase() || 'U'}
          </div>
          <div>
            <p className="text-sm font-bold">{formData.full_name || "Nama belum diisi"}</p>
            <p className="text-xs text-muted-foreground">{formData.current_title} · {formData.experience_years} tahun pengalaman</p>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Pengalaman', value: workExps.length, icon: Briefcase, color: 'text-teal-600', bg: 'bg-teal-50' },
          { label: 'Pendidikan', value: educations.length, icon: GraduationCap, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Skills', value: userSkills.length, icon: Wrench, color: 'text-[#0A5BE0]', bg: 'bg-blue-50' },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div 
              key={stat.label}
              className={`rounded-xl ${stat.bg} border-2 border-black/[6%] p-3 text-center transition-all duration-300 hover:scale-105 hover:shadow-sm`}
              style={{ animation: `fadeInUp 0.4s ease-out ${0.1 + i * 0.1}s both` }}
            >
              <Icon className={`h-5 w-5 mx-auto ${stat.color} mb-1`} />
              <p className="text-lg font-bold font-mono">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Preferences Summary */}
      <div 
        className="rounded-xl border-2 border-black/[8%] bg-black/[2%] p-4 space-y-2"
        style={{ animation: `fadeInUp 0.4s ease-out 0.4s both` }}
      >
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Target className="h-4 w-4 text-[#0A5BE0]" /> Preferensi
        </h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2">
            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Gaji harapan:</span>
            <span className="font-medium">{preferences.desired_salary > 0 ? `Rp ${(preferences.desired_salary / 1000000).toFixed(0)}jt` : "-"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Tipe:</span>
            <span className="font-medium capitalize">{preferences.job_type}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Model:</span>
            <span className="font-medium capitalize">{preferences.work_type}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Notice:</span>
            <span className="font-medium">{preferences.notice_period > 0 ? `${preferences.notice_period} hari` : "-"}</span>
          </div>
        </div>
      </div>

      {/* Completion Message: ready only when the data the draft prompt always uses is present */}
      {(() => {
        const gaps = profileGaps({
          full_name: formData.full_name,
          current_title: formData.current_title,
          skills: userSkills.length,
          experiences: workExps.length,
          education: educations.length,
        });
        const ready = gaps.missing.length === 0;
        return (
          <div
            className={`rounded-xl border-2 p-4 ${ready ? "bg-green-50 border-green-200 text-center" : "bg-amber-50 border-amber-200"}`}
            style={{ animation: `fadeInUp 0.5s ease-out 0.6s both` }}
          >
            {ready && (
              <div className="h-12 w-12 rounded-full bg-green-100 text-green-600 grid place-items-center mx-auto mb-2">
                <CheckCircle2 className="h-6 w-6" />
              </div>
            )}
            <p className={`text-sm font-semibold ${ready ? "text-green-800" : "text-amber-800"}`}>{ready ? "Profil siap dipakai" : "Lengkapi dulu"}</p>
            {gaps.missing.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs text-amber-800 list-disc pl-4">
                {gaps.missing.map((m) => <li key={m}>{m}</li>)}
              </ul>
            )}
            {gaps.tips.length > 0 && (
              <ul className={`mt-2 space-y-0.5 text-xs list-disc pl-4 ${ready ? "text-green-700 text-left" : "text-muted-foreground"}`}>
                {gaps.tips.map((t) => <li key={t}>{t}</li>)}
              </ul>
            )}
            <p className={`text-xs mt-2 ${ready ? "text-green-700" : "text-muted-foreground"}`}>
              Draf lamaran memakai nama, jabatan, lama pengalaman, skill, dan tiga pengalaman kerja terbaru dari profil ini.
            </p>
          </div>
        );
      })()}
    </div>
  );
}

export default ProfilePage;
