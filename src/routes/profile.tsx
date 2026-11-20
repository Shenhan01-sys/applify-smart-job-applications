import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import { 
  EyeOff, Download, FileCheck2, ChevronRight, ChevronLeft, 
  Loader2, Save, Briefcase, GraduationCap, Award, Wrench, 
  Target, CheckCircle2, User, MapPin, Phone, Link2, Mail,
  Calendar, DollarSign, Clock,
  Layers, Sparkles, Paperclip, Eye, RefreshCw, Trash2, Upload
} from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
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
import { automationApi } from "@/services/automationApi";
import { ErrorState } from "@/components/ErrorState";
import { describeError } from "@/lib/authErrors";
import { describeApiError } from "@/lib/apiErrors";
import { RESUME_ACCEPT, resumeFileLabel, type ResumeRef } from "@/lib/resumeUpload";
import { getResume, uploadResume, removeResume, openResume, ResumeError } from "@/services/resumeService";
import { WELCOME_STEPS } from "@/lib/onboarding";
import {
  EMPTY_PREFERENCES,
  JOB_TYPE_OPTIONS,
  WORK_TYPE_OPTIONS,
  preferencesFromSettings,
  preferencesToSettings,
  toggleInList,
  validatePreferences,
  type PreferencesErrors,
  type PreferencesForm,
} from "@/lib/profilePreferences";
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
  head: () => ({ meta: [{ title: "Profil — Applify" }] }),
  // `?welcome=1` dikirim setelah daftar atau masuk pertama saat profil masih kosong (lihat lib/onboarding.ts).
  validateSearch: (search: Record<string, unknown>): { welcome?: 1 } =>
    search.welcome === 1 || search.welcome === "1" || search.welcome === true ? { welcome: 1 } : {},
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
  const { welcome } = Route.useSearch();
  const [welcomeOpen, setWelcomeOpen] = useState(true);
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const [animKey, setAnimKey] = useState(0);
  const [blind, setBlind] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // true setelah "Simpan & Selesai" berhasil: menampilkan langkah lanjut (cari lowongan)
  const [finished, setFinished] = useState(false);
  
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
  // Preferensi langkah 4 disimpan ke user_automation_settings (lewat server otomasi). 'failed' = belum bisa
  // dimuat, dan dalam keadaan itu preferensi tidak ikut disimpan supaya tidak menimpa nilai lama dengan kosong.
  const [preferences, setPreferences] = useState<PreferencesForm>(() =>
    isMockMode()
      ? { desired_salary: 40000000, current_ctc: 30000000, notice_period: 30, job_types: ["full-time"], work_types: ["hybrid"], search_location: "Jakarta" }
      : EMPTY_PREFERENCES,
  );
  const [prefsState, setPrefsState] = useState<"loading" | "ready" | "failed">(isMockMode() ? "ready" : "loading");
  const [prefsError, setPrefsError] = useState("");
  const [prefErrors, setPrefErrors] = useState<PreferencesErrors>({});

  const loadPreferences = useCallback(async () => {
    if (isMockMode()) return;
    setPrefsState("loading");
    setPrefsError("");
    try {
      const settings = await automationApi.getSettings();
      setPreferences(preferencesFromSettings(settings as Record<string, unknown>));
      setPrefsState("ready");
    } catch (err) {
      setPrefsError(describeApiError(err, "Preferensi kerjamu belum bisa dimuat."));
      setPrefsState("failed");
    }
  }, []);

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
        setLoadError(describeError(err, "Profil belum bisa dimuat."));
      } finally {
        setLoading(false);
      }
    }
    if (user) loadProfile();
  }, [user, reloadKey]);

  useEffect(() => {
    if (user) loadPreferences();
  }, [user, loadPreferences]);

  const changeStep = (newStep: number, dir: 'next' | 'prev') => {
    if (newStep < 1 || newStep > steps.length) return;
    setDirection(dir);
    setAnimKey(prev => prev + 1);
    setStep(newStep);
    setFinished(false);
  };

  // Menyimpan profil dasar dan preferensi. Mengembalikan true bila semuanya tersimpan.
  const handleSave = async (): Promise<boolean> => {
    const built = buildProfileRow(formData);
    if (!built.ok) {
      setFormErrors(built.errors as Record<string, string>);
      setDirection('prev');
      setAnimKey(prev => prev + 1);
      setStep(1);
      toast.error("Periksa kolom profil dasar yang ditandai merah.");
      return false;
    }
    const prefProblems = validatePreferences(preferences);
    if (Object.keys(prefProblems).length > 0) {
      setPrefErrors(prefProblems);
      setDirection('next');
      setAnimKey(prev => prev + 1);
      setStep(4);
      toast.error("Periksa kolom preferensi yang ditandai merah.");
      return false;
    }
    setFormErrors({});
    setPrefErrors({});
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
    } catch (err: any) {
      toast.error(`Profil belum tersimpan. ${describeError(err, "Coba lagi.")}`);
      setSaving(false);
      return false;
    }

    // Profil sudah tersimpan; preferensi disimpan terpisah supaya galatnya bisa dijelaskan sendiri.
    if (!isMockMode()) {
      if (prefsState !== "ready") {
        toast.warning(
          prefsState === "loading"
            ? "Profil tersimpan. Preferensi kerja masih dimuat, tunggu sebentar lalu tekan Simpan lagi."
            : "Profil tersimpan, tetapi preferensi kerja belum disimpan karena belum bisa dimuat. Buka langkah Preferensi lalu muat ulang.",
        );
        setSaving(false);
        return false;
      }
      try {
        await automationApi.updateSettings(preferencesToSettings(preferences));
      } catch (err) {
        toast.error(`Profil tersimpan, tetapi preferensi kerja belum. ${describeApiError(err, "Coba simpan lagi.")}`);
        setSaving(false);
        return false;
      }
    }
    toast.success("Profil dan preferensi tersimpan.");
    setSaving(false);
    return true;
  };

  const handleFinish = async () => {
    if (await handleSave()) setFinished(true);
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
      if (res.error) { toast.error(`Belum terhapus. ${describeError(res.error, "Coba lagi.")}`); return; }
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
      if (res.error) { toast.error(`Belum terhapus. ${describeError(res.error, "Coba lagi.")}`); return; }
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
      if (res.error) { toast.error(`Belum terhapus. ${describeError(res.error, "Coba lagi.")}`); return; }
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

      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Profil Saya</h1>
        <p className="text-muted-foreground text-sm mt-1">Isi sekali, dipakai untuk semua lamaran.</p>
      </header>

      {/* Banner sambutan: muncul setelah daftar atau masuk pertama saat profil masih kosong */}
      {welcome === 1 && welcomeOpen && (
        <section aria-labelledby="welcome-heading" className="mb-6 rounded-2xl border-2 border-[#0A5BE0]/30 bg-[#0A5BE0]/5 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="welcome-heading" className="text-lg font-bold">Selamat datang di Applify</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Agar AI bisa menulis lamaran yang pas untukmu, lengkapi profil dulu. Ini cuma sekali.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWelcomeOpen(false)}
              className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-medium text-[#0A5BE0] hover:bg-[#0A5BE0]/10"
            >
              Mengerti
            </button>
          </div>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
            {WELCOME_STEPS.map((t) => <li key={t}>{t}</li>)}
          </ol>
        </section>
      )}

      {loadError && (
        <ErrorState
          className="mb-4 text-left"
          title="Profil belum bisa dimuat"
          message={`${loadError} Data yang tampil di bawah belum tentu lengkap.`}
          onRetry={() => { setLoading(true); setReloadKey((k) => k + 1); }}
        />
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
                    aria-current={isActive ? "step" : undefined}
                    role="img"
                    aria-label={`Langkah ${s.id}: ${s.label}${isCompleted ? ", selesai" : isActive ? ", sedang dibuka" : ""}`}
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
              <span className="text-xs uppercase tracking-wider text-[#0A5BE0] font-bold bg-[#0A5BE0]/10 px-2 py-1 rounded-full">
                Langkah {step}/{steps.length}
              </span>
              {step === 5 && (
                <span className="text-xs uppercase tracking-wider text-green-700 font-bold bg-green-100 px-2 py-1 rounded-full flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Selesai
                </span>
              )}
            </div>
            <h2 className="mt-2 text-xl font-bold">{steps[step-1].label}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {step === 1 && "Ceritakan tentang dirimu. Agen akan menggunakan ini untuk personalisasi lamaran."}
              {step === 2 && "Tambahkan pengalaman kerja. Setiap perubahan langsung tersimpan."}
              {step === 3 && "Lengkapi pendidikan dan skills. Setiap perubahan langsung tersimpan."}
              {step === 4 && "Atur preferensi kerja. Semuanya boleh dikosongkan; pilihan yang kamu isi dipakai agen saat mencari lowongan dan mengisi formulir."}
              {step === 5 && "Periksa profilmu, lalu tekan Simpan & Selesai."}
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
            {step === 4 && (
              <Step4Preferences
                preferences={preferences}
                setPreferences={setPreferences}
                errors={prefErrors}
                state={prefsState}
                loadError={prefsError}
                onRetry={loadPreferences}
              />
            )}
            {step === 5 && (
              <>
                {finished && <FinishedNextSteps />}
                <Step5Review formData={formData} workExps={workExps} educations={educations} userSkills={userSkills} preferences={preferences} />
              </>
            )}
          </div>

          {/* Navigation Buttons */}
          <div className="mt-6 flex justify-between items-center pt-4 border-t border-black/[6%]">
            <button 
              type="button"
              onClick={() => changeStep(step - 1, 'prev')} 
              disabled={step === 1}
              className="min-h-11 px-5 rounded-xl border-2 border-black/[8%] bg-black/[4%] text-sm hover:bg-black/[7%] transition disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              <ChevronLeft className="h-4 w-4" /> Kembali
            </button>
            
            <div className="flex gap-2">
              <button 
                type="button"
                onClick={() => { void handleSave(); }} 
                disabled={saving} 
                className="min-h-11 px-5 rounded-xl border-2 border-[#0A5BE0]/30 bg-[#0A5BE0]/5 text-[#0A5BE0] text-sm font-semibold inline-flex items-center gap-2 hover:bg-[#0A5BE0]/10 transition disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Simpan
              </button>
              
              {step < steps.length ? (
                <button 
                  onClick={() => changeStep(step + 1, 'next')} 
                  className="min-h-11 px-5 rounded-xl bg-[#0A5BE0] text-white text-sm font-semibold inline-flex items-center gap-2 hover:bg-[#0A5BE0]/90 transition shadow-lg shadow-[#0A5BE0]/20 hover:shadow-[#0A5BE0]/30 hover:-translate-y-0.5 active:translate-y-0"
                >
                  Lanjut <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button 
                  type="button"
                  onClick={handleFinish} 
                  disabled={saving}
                  className="min-h-11 px-5 rounded-xl bg-green-700 text-white text-sm font-semibold inline-flex items-center gap-2 hover:bg-green-800 disabled:opacity-60 transition shadow-lg shadow-green-500/20 hover:shadow-green-500/30 hover:-translate-y-0.5 active:translate-y-0"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Simpan &amp; Selesai
                </button>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Live Preview + CV untuk dilampirkan (kartu CV tampil di semua langkah) */}
        <div className="space-y-6">
        <div className="glass rounded-2xl p-5 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">Pratinjau CV</h2>
              <p className="text-xs text-muted-foreground">Diperbarui otomatis dari profilmu</p>
            </div>
            <button 
              type="button"
              onClick={() => setBlind(!blind)} 
              aria-pressed={blind}
              title="Menyamarkan nama dan riwayat di pratinjau, untuk melihat bagaimana CV terbaca tanpa identitas"
              className={`text-xs min-h-11 px-3 rounded-full border inline-flex items-center gap-1.5 transition-all duration-300 ${
                blind ? 'border-[#16150F] bg-[#16150F] text-white' : 'border-black/[8%] bg-black/[4%] text-muted-foreground hover:bg-black/[7%]'
              }`}
            >
              <EyeOff className="h-3.5 w-3.5"/> {blind ? 'Mode Anonim Aktif' : 'Mode Anonim'}
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
              <p className="text-xs uppercase tracking-wider text-[#0A5BE0] font-bold flex items-center gap-1">
                <Wrench className="h-3 w-3" /> Skill Utama
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {userSkills.length > 0 ? sortSkills(userSkills).map(s => (
                  <span key={s.id ?? s.name} className="text-xs px-2.5 py-1 rounded-full bg-[#0A5BE0] text-white font-medium">{s.name}</span>
                )) : (
                  <span className="text-xs text-muted-foreground">Belum ada skill</span>
                )}
              </div>
            </div>

            {/* Work Experience */}
            <div>
              <p className="text-xs uppercase tracking-wider text-teal-700 font-bold flex items-center gap-1">
                <Briefcase className="h-3 w-3" /> Pengalaman Kerja
              </p>
              <div className="mt-2 space-y-3">
                {workExps.length === 0 && <span className="text-xs text-muted-foreground">Belum ada pengalaman kerja</span>}
                {sortExperiences(workExps).map((exp, i) => (
                  <div key={exp.id ?? i} className={`text-xs transition-all duration-300 ${blind && i > 0 ? 'opacity-30 blur-[2px]' : ''}`}>
                    <p className="font-semibold">{exp.role_title}</p>
                    <p className="text-muted-foreground">{exp.company_name} · {EMPLOYMENT_TYPES.find((t) => t.value === exp.employment_type)?.label ?? exp.employment_type}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatMonthYear(exp.start_date)} — {exp.is_current ? "Sekarang" : formatMonthYear(exp.end_date) || "-"}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Education */}
            <div>
              <p className="text-xs uppercase tracking-wider text-amber-700 font-bold flex items-center gap-1">
                <GraduationCap className="h-3 w-3" /> Pendidikan
              </p>
              <div className="mt-2 space-y-2">
                {educations.length === 0 && <span className="text-xs text-muted-foreground">Belum ada riwayat pendidikan</span>}
                {sortEducation(educations).map((edu, i) => (
                  <div key={edu.id ?? i} className="text-xs">
                    <p className="font-semibold">{edu.institution}</p>
                    <p className="text-muted-foreground">{edu.degree} {edu.field_of_study && `· ${edu.field_of_study}`}</p>
                    <p className="text-xs text-muted-foreground">{edu.start_year ?? "-"} — {edu.is_current ? "Sekarang" : edu.end_year ?? "-"} {edu.gpa != null && `· IPK ${edu.gpa}/${edu.max_gpa ?? 4}`}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Certifications */}
            <div>
              <p className="text-xs uppercase tracking-wider text-purple-700 font-bold flex items-center gap-1">
                <Award className="h-3 w-3" /> Sertifikasi
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {certs.length === 0 && <span className="text-xs text-muted-foreground">Belum ada sertifikasi</span>}
                {certs.map((c, i) => (
                  <span key={c.id ?? i} className="text-xs px-2 py-0.5 rounded-md bg-purple-100 text-purple-700 border-2 border-purple-200">
                    {c.name}
                  </span>
                ))}
              </div>
            </div>

            {/* Blind Mode Notice */}
            {blind && (
              <div className="mt-3 p-3 rounded-lg bg-violet-50 border-2 border-violet-200 animate-[fadeInUp_0.4s_ease-out]">
                <p className="text-xs text-violet-700 font-medium">Mode Anonim aktif</p>
                <p className="text-xs text-violet-700 mt-0.5">Nama dan sebagian riwayat disamarkan di pratinjau ini. Hanya tampilan; datamu tidak berubah.</p>
              </div>
            )}
          </div>
          
          <div className="mt-4 flex gap-2">
            {/* Belum ada fungsinya: dinonaktifkan dan diberi label, bukan tombol yang diam saat ditekan */}
            <button type="button" disabled aria-disabled="true" title="Fitur ini belum tersedia" className="flex-1 min-h-11 rounded-lg border-2 border-black/[8%] bg-black/[4%] text-sm inline-flex items-center justify-center gap-2 opacity-60 cursor-not-allowed">
              <Download className="h-4 w-4" aria-hidden="true"/> Unduh PDF <span className="text-xs">(segera hadir)</span>
            </button>
            <button type="button" disabled aria-disabled="true" title="Fitur ini belum tersedia" className="flex-1 min-h-11 rounded-lg bg-[#D2F801]/60 text-[#16150F] text-sm font-semibold inline-flex items-center justify-center gap-2 opacity-60 cursor-not-allowed">
              <FileCheck2 className="h-4 w-4" aria-hidden="true"/> Cek ATS <span className="text-xs font-normal">(segera hadir)</span>
            </button>
          </div>
        </div>
        {user && <ResumeCard userId={user.id} />}
        </div>
      </div>
    </AppShell>
  );
}

// ===== CV UNTUK DILAMPIRKAN =====

type ResumeBusy = "" | "load" | "upload" | "view" | "remove";

// Kartu ini hidup di luar stepper, jadi tampil di semua langkah. Berkasnya disimpan di Storage privat `resumes`
// dan path-nya di profiles.resume_url (lihat services/resumeService.ts); agen melampirkannya saat mengisi formulir.
function ResumeCard({ userId }: { userId: string }) {
  const [resume, setResume] = useState<ResumeRef | null>(null);
  const [busy, setBusy] = useState<ResumeBusy>("load");
  const [error, setError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let cancelled = false;
    setBusy("load");
    setLoadFailed(false);
    getResume(userId)
      .then((found) => { if (!cancelled) setResume(found); })
      .catch((err) => {
        if (cancelled) return;
        setLoadFailed(true);
        setError(err instanceof ResumeError ? err.message : describeError(err, "CV belum bisa dimuat. Coba lagi."));
      })
      .finally(() => { if (!cancelled) setBusy(""); });
    return () => { cancelled = true; };
  }, [userId, reloadKey]);

  const fail = (err: unknown, fallback: string) => {
    const message = err instanceof ResumeError ? err.message : describeError(err, fallback);
    setError(message);
    toast.error(message);
  };

  // Input berkas disembunyikan saat CV sudah ada; fokus dipindah ke judul kartu supaya tidak hilang.
  const focusHeading = () => window.setTimeout(() => heading.current?.focus(), 0);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setBusy("upload");
    try {
      setResume(await uploadResume(userId, file));
      toast.success("CV tersimpan");
      focusHeading();
    } catch (err) {
      fail(err, "CV belum terunggah. Coba lagi.");
    } finally {
      setBusy("");
    }
  };

  const onView = async () => {
    if (!resume) return;
    setError("");
    setBusy("view");
    // Tab dibuka saat klik, sebelum await, supaya Safari tidak memblokirnya sebagai popup. Alamatnya diisi
    // setelah signed URL jadi; opener diputus supaya halaman CV tidak bisa mengakses tab Applify.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    try {
      const url = await openResume(resume.path);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
    } catch (err) {
      tab?.close();
      fail(err, "CV belum bisa dibuka. Coba lagi.");
    } finally {
      setBusy("");
    }
  };

  const onRemove = async () => {
    setError("");
    setBusy("remove");
    try {
      await removeResume(userId);
      setResume(null);
      toast.success("CV dihapus");
      focusHeading();
    } catch (err) {
      fail(err, "CV belum terhapus. Coba lagi.");
    } finally {
      setBusy("");
    }
  };

  const working = busy !== "";
  const btnBase = "min-h-11 px-4 rounded-lg border-2 text-sm font-medium inline-flex items-center justify-center gap-2 transition disabled:opacity-60 disabled:cursor-not-allowed";
  const actionBtn = `${btnBase} border-black/[8%] bg-black/[4%] hover:bg-black/[7%]`;
  const showPicker = !resume && !loadFailed;
  const spinner = <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;

  return (
    <section aria-labelledby="resume-heading" className="glass rounded-2xl p-5 md:p-6">
      <h2 id="resume-heading" ref={heading} tabIndex={-1} className="font-semibold flex items-center gap-2 focus:outline-none">
        <Paperclip className="h-4 w-4 text-[#0A5BE0]" aria-hidden="true" /> CV untuk Dilampirkan
      </h2>
      <p id="resume-hint" className="mt-1 text-xs text-muted-foreground">
        Agen melampirkan berkas ini saat mengisi formulir lamaran. PDF, DOC, atau DOCX, maksimal 5 MB.
      </p>

      <div className="mt-4" aria-busy={working}>
        <input
          ref={fileInput}
          id="resume-file"
          type="file"
          accept={RESUME_ACCEPT}
          onChange={onPick}
          disabled={working}
          aria-describedby={error ? "resume-hint resume-error" : "resume-hint"}
          aria-label={resume ? "Pilih berkas CV pengganti" : undefined}
          className={showPicker ? "peer sr-only" : "hidden"}
        />

        {busy === "load" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            {spinner} Memuat CV...
          </p>
        )}

        {busy !== "load" && showPicker && (
          <label
            htmlFor="resume-file"
            className={`${btnBase} w-full sm:w-auto border-[#0A5BE0]/30 bg-[#0A5BE0]/5 text-[#0A5BE0] hover:bg-[#0A5BE0]/10 peer-focus-visible:ring-2 peer-focus-visible:ring-[#0A5BE0] ${working ? "opacity-60 pointer-events-none" : "cursor-pointer"}`}
          >
            {busy === "upload" ? spinner : <Upload className="h-4 w-4" aria-hidden="true" />}
            {busy === "upload" ? "Mengunggah..." : "Unggah CV"}
          </label>
        )}

        {busy !== "load" && resume && (
          <div className="space-y-3">
            <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
              <FileCheck2 className="h-4 w-4 shrink-0 text-green-700" aria-hidden="true" />
              <span className="truncate" title={resumeFileLabel(resume.path)}>{resumeFileLabel(resume.path)}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={onView} disabled={working} className={actionBtn}>
                {busy === "view" ? spinner : <Eye className="h-4 w-4" aria-hidden="true" />} Lihat
              </button>
              <button type="button" onClick={() => fileInput.current?.click()} disabled={working} className={actionBtn}>
                {busy === "upload" ? spinner : <RefreshCw className="h-4 w-4" aria-hidden="true" />} Ganti
              </button>
              <button type="button" onClick={onRemove} disabled={working} className={`${actionBtn} text-red-700`}>
                {busy === "remove" ? spinner : <Trash2 className="h-4 w-4" aria-hidden="true" />} Hapus
              </button>
            </div>
          </div>
        )}

        {busy !== "load" && loadFailed && (
          <button type="button" onClick={() => { setError(""); setReloadKey((k) => k + 1); }} className={actionBtn}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Muat ulang
          </button>
        )}
      </div>

      {error && <p id="resume-error" className="mt-3 text-xs text-red-600" role="alert">{error}</p>}
    </section>
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
            <label htmlFor={`profile-${field.key}`} className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5 text-[#0A5BE0]" aria-hidden="true" /> {field.label}{field.key === 'full_name' && <span className="text-red-600" aria-hidden="true"> *</span>}
            </label>
            <input 
              id={`profile-${field.key}`}
              inputMode={field.type === 'number' ? 'numeric' : field.type === 'url' ? 'url' : field.type === 'email' ? 'email' : field.key === 'phone' ? 'tel' : undefined}
              aria-required={field.key === 'full_name' ? true : undefined}
              aria-describedby={errors[field.key] ? `profile-${field.key}-error` : field.key === 'email' ? 'profile-email-hint' : undefined}
              type={field.type}
              value={formData[field.key] || ''}
              onChange={(e) => {
                const value = field.type === 'number' ? parseInt(e.target.value) || 0 : e.target.value;
                setFormData((prev: any) => ({ ...prev, [field.key]: value }));
              }}
              placeholder={field.placeholder}
              readOnly={field.key === 'email'}
              aria-invalid={!!errors[field.key]}
              className="mt-1.5 w-full h-12 rounded-lg bg-black/[4%] border-2 border-black/[8%] px-4 text-base md:text-sm focus:border-[#0A5BE0]/40 focus:outline-none focus:ring-2 focus:ring-[#0A5BE0]/10 transition-all duration-200 hover:border-black/[12%] aria-[invalid=true]:border-red-400 read-only:opacity-70 read-only:cursor-not-allowed"
            />
            {field.key === 'email' && <p id="profile-email-hint" className="mt-1 text-xs text-muted-foreground">Email akun login; tidak diubah dari halaman ini.</p>}
            {errors[field.key] && <p id={`profile-${field.key}-error`} className="mt-1 text-xs text-red-600" role="alert">{errors[field.key]}</p>}
          </div>
        );
      })}
    </div>
  );
}

function Step4Preferences({ preferences, setPreferences, errors, state, loadError, onRetry }: {
  preferences: PreferencesForm,
  setPreferences: React.Dispatch<React.SetStateAction<PreferencesForm>>,
  errors: PreferencesErrors,
  state: "loading" | "ready" | "failed",
  loadError: string,
  onRetry: () => void,
}) {
  if (state === "loading") {
    return (
      <div className="flex items-center justify-center gap-3 py-10 text-muted-foreground" role="status" aria-live="polite">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Memuat preferensimu...
      </div>
    );
  }
  if (state === "failed") {
    return <ErrorState title="Preferensi belum bisa dimuat" message={`${loadError} Preferensi tidak akan ikut disimpan sampai berhasil dimuat, supaya isi lamamu tidak tertimpa kosong.`} onRetry={onRetry} />;
  }

  const numberFields: Array<{ key: "desired_salary" | "current_ctc" | "notice_period"; label: string; hint: string; icon: any; prefix: string; step: number }> = [
    { key: 'desired_salary', label: 'Gaji yang diharapkan', hint: 'Dalam rupiah. Angka ini dipakai apa adanya saat agen mengisi kolom gaji di formulir, jadi tulis sesuai yang biasa diminta (misalnya per bulan).', icon: DollarSign, prefix: 'Rp ', step: 500000 },
    { key: 'current_ctc', label: 'Gaji saat ini', hint: 'Boleh dikosongkan. Dipakai bila formulir menanyakannya.', icon: DollarSign, prefix: 'Rp ', step: 500000 },
    { key: 'notice_period', label: 'Masa pemberitahuan (hari)', hint: 'Berapa hari kamu perlu memberi tahu tempat kerja sekarang sebelum pindah. Isi 0 bila bisa langsung.', icon: Clock, prefix: '', step: 1 },
  ];
  const chip = (active: boolean) =>
    `min-h-11 px-4 rounded-lg text-sm font-medium border-2 transition-all duration-200 ${
      active ? 'border-[#0A5BE0] bg-[#0A5BE0] text-white shadow-md' : 'border-black/[8%] bg-black/[4%] text-muted-foreground hover:border-black/[16%]'
    }`;

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground bg-black/[3%] border-2 border-black/[6%] rounded-lg p-3 leading-relaxed">
        Preferensi ini disimpan di Pengaturan Agen, jadi perubahan di sini dan di sana saling terlihat.
      </p>
      <div className="space-y-4">
        {numberFields.map((field, i) => {
          const Icon = field.icon;
          const id = `pref-${field.key}`;
          return (
            <div key={field.key} style={{ animation: `fadeInUp 0.4s ease-out ${i * 0.08}s both` }}>
              <label htmlFor={id} className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 text-[#0A5BE0]" aria-hidden="true" /> {field.label}
              </label>
              <div className="mt-1.5 relative">
                {field.prefix && (
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground" aria-hidden="true">{field.prefix}</span>
                )}
                <input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  value={preferences[field.key] || ''}
                  placeholder="Kosongkan bila tidak ingin diisi"
                  onChange={(e) => setPreferences({ ...preferences, [field.key]: Math.max(0, parseInt(e.target.value) || 0) })}
                  min={0}
                  step={field.step}
                  aria-invalid={!!errors[field.key]}
                  aria-describedby={`${id}-hint`}
                  className={`w-full h-12 rounded-lg bg-black/[4%] border-2 border-black/[8%] text-base md:text-sm focus:border-[#0A5BE0]/40 focus:outline-none focus:ring-2 focus:ring-[#0A5BE0]/10 transition-all aria-[invalid=true]:border-red-400 ${field.prefix ? 'pl-10' : 'pl-4'} pr-4`}
                />
              </div>
              <p id={`${id}-hint`} className="mt-1 text-xs text-muted-foreground">{field.hint}</p>
              {errors[field.key] && <p className="mt-1 text-xs text-red-600" role="alert">{errors[field.key]}</p>}
            </div>
          );
        })}
      </div>

      {/* Tipe pekerjaan: boleh lebih dari satu, boleh kosong */}
      <fieldset style={{ animation: `fadeInUp 0.4s ease-out 0.24s both` }}>
        <legend className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
          <Briefcase className="h-3.5 w-3.5 text-[#0A5BE0]" aria-hidden="true" /> Tipe pekerjaan
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {JOB_TYPE_OPTIONS.map((o) => {
            const active = preferences.job_types.includes(o.value);
            return (
              <button key={o.value} type="button" aria-pressed={active}
                onClick={() => setPreferences({ ...preferences, job_types: toggleInList(preferences.job_types, o.value) })}
                className={chip(active)}>{o.label}</button>
            );
          })}
        </div>
      </fieldset>

      {/* Model kerja: menyaring hasil pencarian, jadi tidak ada pilihan bawaan */}
      <fieldset style={{ animation: `fadeInUp 0.4s ease-out 0.32s both` }}>
        <legend className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-[#0A5BE0]" aria-hidden="true" /> Model kerja
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {WORK_TYPE_OPTIONS.map((o) => {
            const active = preferences.work_types.includes(o.value);
            return (
              <button key={o.value} type="button" aria-pressed={active}
                onClick={() => setPreferences({ ...preferences, work_types: toggleInList(preferences.work_types, o.value) })}
                className={chip(active)}>{o.label}</button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">Bila ada yang dipilih, hasil pencarian agen hanya menampilkan lowongan dengan model kerja itu. Tanpa pilihan, semua model kerja ditampilkan.</p>
      </fieldset>

      {/* Lokasi */}
      <div style={{ animation: `fadeInUp 0.4s ease-out 0.4s both` }}>
        <label htmlFor="pref-search_location" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-[#0A5BE0]" aria-hidden="true" /> Lokasi pencarian
        </label>
        <input
          id="pref-search_location"
          value={preferences.search_location}
          onChange={(e) => setPreferences({ ...preferences, search_location: e.target.value })}
          placeholder="Contoh: Yogyakarta, Jakarta, atau Remote"
          aria-invalid={!!errors.search_location}
          className="mt-1.5 w-full h-12 rounded-lg bg-black/[4%] border-2 border-black/[8%] px-4 text-base md:text-sm focus:border-[#0A5BE0]/40 focus:outline-none focus:ring-2 focus:ring-[#0A5BE0]/10 transition-all aria-[invalid=true]:border-red-400"
        />
        {errors.search_location && <p className="mt-1 text-xs text-red-600" role="alert">{errors.search_location}</p>}
      </div>
    </div>
  );
}

/** Muncul setelah "Simpan & Selesai" berhasil: langkah lanjut yang jelas. */
function FinishedNextSteps() {
  return (
    <section aria-labelledby="finished-heading" role="status" className="mb-5 rounded-xl border-2 border-green-300 bg-green-50 p-4">
      <h3 id="finished-heading" className="flex items-center gap-2 text-base font-bold text-green-900">
        <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> Profilmu tersimpan
      </h3>
      <p className="mt-1 text-sm text-green-900">Langkah berikutnya: cari lowongan yang cocok, lalu minta AI menyiapkan draf lamarannya.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to="/jobs" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0A5BE0] px-5 text-sm font-semibold text-white hover:bg-[#0256d3] transition">
          Cari lowongan <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <Link to="/dashboard" className="inline-flex min-h-11 items-center rounded-xl border-2 border-green-700/30 px-5 text-sm font-semibold text-green-900 hover:bg-green-100 transition">
          Ke dashboard
        </Link>
      </div>
    </section>
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
            <p className="text-xs text-muted-foreground">{formData.current_title || "Jabatan belum diisi"} · {formData.experience_years} tahun pengalaman</p>
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
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</p>
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
          <Target className="h-4 w-4 text-[#0A5BE0]" aria-hidden="true" /> Preferensi
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-2">
            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="text-muted-foreground">Gaji harapan:</span>
            <span className="font-medium">{preferences.desired_salary > 0 ? `Rp ${preferences.desired_salary.toLocaleString("id-ID")}` : "-"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Briefcase className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="text-muted-foreground">Tipe:</span>
            <span className="font-medium">{preferences.job_types.length ? preferences.job_types.map((v: string) => JOB_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v).join(", ") : "Semua"}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="text-muted-foreground">Model:</span>
            <span className="font-medium">{preferences.work_types.length ? preferences.work_types.map((v: string) => WORK_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v).join(", ") : "Semua"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="text-muted-foreground">Pemberitahuan:</span>
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
