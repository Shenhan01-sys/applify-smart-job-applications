import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import { 
  EyeOff, Download, FileCheck2, ChevronRight, ChevronLeft, 
  Loader2, Save, Briefcase, GraduationCap, Award, Wrench, 
  Target, CheckCircle2, User, MapPin, Phone, Link2, Mail,
  Building2, Calendar, Star, TrendingUp, DollarSign, Clock,
  Layers, Sparkles
} from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { 
  mockProfile as mockProfileData,
  mockWorkExperiences,
  mockEducation,
  mockCertifications,
  mockUserSkills,
} from "@/mocks/mockData";

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
  
  const [workExps, setWorkExps] = useState(mockWorkExperiences);
  const [educations, setEducations] = useState(mockEducation);
  const [certs, setCerts] = useState(mockCertifications);
  const [userSkills, setUserSkills] = useState(mockUserSkills);
  const [preferences, setPreferences] = useState({
    desired_salary: 40000000,
    current_ctc: 30000000,
    notice_period: 30,
    job_type: "full-time",
    work_type: "hybrid",
    search_location: "Jakarta",
  });

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

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user?.id)
        .single();
      const d = data || mockProfileData;
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
      setLoading(false);
    }
    if (user) loadProfile();
  }, [user]);

  const changeStep = (newStep: number, dir: 'next' | 'prev') => {
    if (newStep < 1 || newStep > steps.length) return;
    setDirection(dir);
    setAnimKey(prev => prev + 1);
    setStep(newStep);
  };

  const handleSave = async () => {
    setSaving(true);
    if (!isMockMode()) {
      await supabase.from("profiles").upsert({
        id: user?.id,
        ...formData,
        updated_at: new Date().toISOString(),
      });
    }
    setSaving(false);
    setShowSaveToast(true);
    setTimeout(() => setShowSaveToast(false), 2000);
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
                        ? 'bg-[#0367FC] text-white shadow-lg scale-110' 
                        : isCompleted 
                          ? 'bg-[#0367FC]/20 text-[#0367FC] border-2 border-[#0367FC]' 
                          : 'bg-black/[4%] text-muted-foreground border border-black/[8%]'
                    }`}
                    style={isActive ? { animation: 'pulse-ring 2s infinite' } : {}}
                  >
                    {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-4 w-4" />}
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`flex-1 h-1 mx-2 rounded-full transition-all duration-500 ${
                      isCompleted ? 'bg-[#0367FC]' : 'bg-black/[6%]'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Step Info */}
          <div className="mb-5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-[#0367FC] font-bold bg-[#0367FC]/10 px-2 py-1 rounded-full">
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
              {step === 2 && "Tambahkan pengalaman kerja untuk menonjolkan keahlianmu."}
              {step === 3 && "Lengkapi pendidikan dan skills untuk matching yang akurat."}
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
            {step === 1 && <Step1Basic formData={formData} setFormData={setFormData} />}
            {step === 2 && <Step2Experience workExps={workExps} />}
            {step === 3 && <Step3Education educations={educations} userSkills={userSkills} />}
            {step === 4 && <Step4Preferences preferences={preferences} setPreferences={setPreferences} />}
            {step === 5 && <Step5Review formData={formData} workExps={workExps} educations={educations} userSkills={userSkills} preferences={preferences} />}
          </div>

          {/* Navigation Buttons */}
          <div className="mt-6 flex justify-between items-center pt-4 border-t border-black/[6%]">
            <button 
              onClick={() => changeStep(step - 1, 'prev')} 
              disabled={step === 1}
              className="h-11 px-5 rounded-xl border border-black/[8%] bg-black/[4%] text-sm hover:bg-black/[7%] transition disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              <ChevronLeft className="h-4 w-4" /> Kembali
            </button>
            
            <div className="flex gap-2">
              <button 
                onClick={handleSave} 
                disabled={saving} 
                className="h-11 px-5 rounded-xl border border-[#0367FC]/30 bg-[#0367FC]/5 text-[#0367FC] text-sm font-semibold inline-flex items-center gap-2 hover:bg-[#0367FC]/10 transition disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Simpan
              </button>
              
              {step < steps.length ? (
                <button 
                  onClick={() => changeStep(step + 1, 'next')} 
                  className="h-11 px-5 rounded-xl bg-[#0367FC] text-white text-sm font-semibold inline-flex items-center gap-2 hover:bg-[#0367FC]/90 transition shadow-lg shadow-[#0367FC]/20 hover:shadow-[#0367FC]/30 hover:-translate-y-0.5 active:translate-y-0"
                >
                  Lanjut <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button 
                  onClick={() => alert("Profil siap! AI akan mulai mencari pekerjaan untuk kamu.")} 
                  className="h-11 px-5 rounded-xl bg-green-500 text-white text-sm font-semibold inline-flex items-center gap-2 hover:bg-green-600 transition shadow-lg shadow-green-500/20 hover:shadow-green-500/30 hover:-translate-y-0.5 active:translate-y-0"
                >
                  <CheckCircle2 className="h-4 w-4" /> Selesai
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
                blind ? 'border-[#161616] bg-[#161616] text-white' : 'border-black/[8%] bg-black/[4%] text-muted-foreground hover:bg-black/[7%]'
              }`}
            >
              <EyeOff className="h-3.5 w-3.5"/> {blind ? 'Blind On' : 'Blind Mode'}
            </button>
          </div>
          
          <div className="rounded-xl bg-black/[4%] border border-black/[8%] p-5 text-sm space-y-4 overflow-y-auto max-h-[600px]">
            {/* Header */}
            <div className={`pb-4 border-b border-black/[8%] transition-all duration-500 ${blind ? 'opacity-30 blur-[2px]' : ''}`}>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-[#0367FC] text-white grid place-items-center text-lg font-bold">
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
              <p className="text-[10px] uppercase tracking-wider text-[#0367FC] font-bold flex items-center gap-1">
                <Wrench className="h-3 w-3" /> Skill Utama
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {userSkills.length > 0 ? userSkills.map(s => (
                  <span key={s.name} className="text-[11px] px-2.5 py-1 rounded-full bg-[#0367FC] text-white font-medium">{s.name}</span>
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
                {workExps.map((exp, i) => (
                  <div key={i} className={`text-xs transition-all duration-300 ${blind && i > 0 ? 'opacity-30 blur-[2px]' : ''}`}>
                    <p className="font-semibold">{exp.role_title}</p>
                    <p className="text-muted-foreground">{exp.company_name} · {exp.employment_type}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {exp.start_date} — {exp.end_date || "Sekarang"} · {exp.location_type}
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
                {educations.map((edu, i) => (
                  <div key={i} className="text-xs">
                    <p className="font-semibold">{edu.institution}</p>
                    <p className="text-muted-foreground">{edu.degree} {edu.field_of_study && `· ${edu.field_of_study}`}</p>
                    <p className="text-[10px] text-muted-foreground">{edu.start_year} — {edu.end_year || "Sekarang"} {edu.gpa && `· GPA ${edu.gpa}/${edu.max_gpa}`}</p>
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
                {certs.map((c, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-purple-100 text-purple-700 border border-purple-200">
                    {c.name}
                  </span>
                ))}
              </div>
            </div>

            {/* Blind Mode Notice */}
            {blind && (
              <div className="mt-3 p-3 rounded-lg bg-violet-50 border border-violet-200 animate-[fadeInUp_0.4s_ease-out]">
                <p className="text-xs text-violet-700 font-medium">Blind Mode Aktif</p>
                <p className="text-[10px] text-violet-600 mt-0.5">Nama institusi & latar belakang sosial disembunyikan. Skill diprioritaskan.</p>
              </div>
            )}
          </div>
          
          <div className="mt-4 flex gap-2">
            <button className="flex-1 h-10 rounded-lg border border-black/[8%] bg-black/[4%] text-sm inline-flex items-center justify-center gap-2 hover:bg-black/[7%] transition hover:-translate-y-0.5">
              <Download className="h-4 w-4"/> Unduh PDF
            </button>
            <button className="flex-1 h-10 rounded-lg bg-[#D2F801] text-[#161616] text-sm font-semibold inline-flex items-center justify-center gap-2 hover:brightness-95 transition hover:-translate-y-0.5 shadow-sm">
              <FileCheck2 className="h-4 w-4"/> Test ATS
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ===== STEP COMPONENTS =====

function Step1Basic({ formData, setFormData }: { 
  formData: any, 
  setFormData: React.Dispatch<React.SetStateAction<any>> 
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
              <Icon className="h-3.5 w-3.5 text-[#0367FC]" /> {field.label}
            </label>
            <input 
              type={field.type}
              value={formData[field.key] || ''}
              onChange={(e) => setFormData({...formData, [field.key]: field.type === 'number' ? parseInt(e.target.value) || 0 : e.target.value})}
              placeholder={field.placeholder}
              className="mt-1.5 w-full h-11 rounded-lg bg-black/[4%] border border-black/[8%] px-4 text-sm focus:border-[#0367FC]/40 focus:outline-none focus:ring-2 focus:ring-[#0367FC]/10 transition-all duration-200 hover:border-black/[12%]"
            />
          </div>
        );
      })}
    </div>
  );
}

function Step2Experience({ workExps }: { workExps: any[] }) {
  return (
    <div className="space-y-4">
      {workExps.map((exp, i) => (
        <div 
          key={exp.id} 
          className="rounded-xl border border-black/[8%] bg-black/[2%] p-4 hover:border-[#0367FC]/30 hover:bg-[#0367FC]/[2%] transition-all duration-300 group"
          style={{ animation: `fadeInUp 0.4s ease-out ${i * 0.1}s both` }}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-[#0367FC]/10 text-[#0367FC] grid place-items-center">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">{exp.role_title}</p>
                <p className="text-xs text-muted-foreground">{exp.company_name}</p>
              </div>
            </div>
            <span className={`text-[10px] px-2 py-1 rounded-full font-medium ${exp.is_current ? 'bg-green-100 text-green-700' : 'bg-black/[5%] text-muted-foreground'}`}>
              {exp.is_current ? 'Current' : 'Past'}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {exp.start_date} — {exp.end_date || "Sekarang"}</span>
            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {exp.location_type}</span>
            <span className="inline-flex items-center gap-1"><Layers className="h-3 w-3" /> {exp.employment_type}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{exp.description}</p>
          {exp.achievements?.length > 0 && (
            <div className="mt-2 space-y-1">
              {exp.achievements.map((a: string, j: number) => (
                <div key={j} className="flex items-center gap-1.5 text-[11px]">
                  <Star className="h-3 w-3 text-[#D2F801]" />
                  <span className="text-muted-foreground">{a}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      
      <button className="w-full h-11 rounded-xl border-2 border-dashed border-black/[12%] text-sm text-muted-foreground hover:border-[#0367FC]/40 hover:text-[#0367FC] hover:bg-[#0367FC]/[2%] transition-all duration-300 inline-flex items-center justify-center gap-2">
        <Briefcase className="h-4 w-4" /> Tambah Pengalaman Kerja
      </button>
    </div>
  );
}

function Step3Education({ educations, userSkills }: { educations: any[], userSkills: any[] }) {
  return (
    <div className="space-y-5">
      {/* Education Section */}
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <GraduationCap className="h-4 w-4 text-[#0367FC]" /> Pendidikan
        </h3>
        <div className="space-y-3">
          {educations.map((edu, i) => (
            <div 
              key={edu.id} 
              className="rounded-xl border border-black/[8%] bg-black/[2%] p-4 hover:border-[#0367FC]/30 transition-all duration-300"
              style={{ animation: `fadeInUp 0.4s ease-out ${i * 0.1}s both` }}
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-100 text-amber-700 grid place-items-center">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{edu.institution}</p>
                  <p className="text-xs text-muted-foreground">{edu.degree} {edu.field_of_study && `· ${edu.field_of_study}`}</p>
                </div>
              </div>
              <div className="mt-2 flex gap-3 text-[10px] text-muted-foreground">
                <span>{edu.start_year} — {edu.end_year || "Sekarang"}</span>
                {edu.gpa && <span className="font-mono">GPA: {edu.gpa}/{edu.max_gpa}</span>}
              </div>
            </div>
          ))}
        </div>
        <button className="mt-3 w-full h-10 rounded-xl border-2 border-dashed border-black/[12%] text-sm text-muted-foreground hover:border-[#0367FC]/40 hover:text-[#0367FC] transition-all inline-flex items-center justify-center gap-2">
          <GraduationCap className="h-4 w-4" /> Tambah Pendidikan
        </button>
      </div>

      {/* Skills Section */}
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Wrench className="h-4 w-4 text-[#0367FC]" /> Skills & Keahlian
        </h3>
        <div className="flex flex-wrap gap-2">
          {userSkills.map((skill, i) => (
            <div 
              key={skill.id}
              className="group relative"
              style={{ animation: `fadeInUp 0.3s ease-out ${i * 0.03}s both` }}
            >
              <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-[#0367FC] text-white font-medium hover:bg-[#0367FC]/90 transition-all cursor-default">
                {skill.name}
                <span className="text-[10px] opacity-70">{skill.proficiency_level}/5</span>
              </span>
            </div>
          ))}
        </div>
        <button className="mt-3 h-10 px-4 rounded-xl border-2 border-dashed border-black/[12%] text-sm text-muted-foreground hover:border-[#0367FC]/40 hover:text-[#0367FC] transition-all inline-flex items-center gap-2">
          <Wrench className="h-4 w-4" /> Tambah Skill
        </button>
      </div>
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
      <div className="space-y-4">
        {prefFields.map((field, i) => {
          const Icon = field.icon;
          return (
            <div 
              key={field.key}
              style={{ animation: `fadeInUp 0.4s ease-out ${i * 0.08}s both` }}
            >
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 text-[#0367FC]" /> {field.label}
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
                  className={`w-full h-11 rounded-lg bg-black/[4%] border border-black/[8%] text-sm focus:border-[#0367FC]/40 focus:outline-none focus:ring-2 focus:ring-[#0367FC]/10 transition-all ${field.prefix ? 'pl-10' : 'pl-4'} pr-4`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Job Type */}
      <div style={{ animation: `fadeInUp 0.4s ease-out 0.24s both` }}>
        <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
          <Briefcase className="h-3.5 w-3.5 text-[#0367FC]" /> Tipe Pekerjaan
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          {['full-time', 'part-time', 'contract', 'internship'].map((type) => (
            <button
              key={type}
              onClick={() => setPreferences({...preferences, job_type: type})}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all duration-200 ${
                preferences.job_type === type 
                  ? 'border-[#0367FC] bg-[#0367FC] text-white shadow-md' 
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
          <MapPin className="h-3.5 w-3.5 text-[#0367FC]" /> Model Kerja
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          {['remote', 'hybrid', 'on-site'].map((type) => (
            <button
              key={type}
              onClick={() => setPreferences({...preferences, work_type: type})}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all duration-200 ${
                preferences.work_type === type 
                  ? 'border-[#0367FC] bg-[#0367FC] text-white shadow-md' 
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
          <MapPin className="h-3.5 w-3.5 text-[#0367FC]" /> Lokasi Pencarian
        </label>
        <input 
          value={preferences.search_location}
          onChange={(e) => setPreferences({...preferences, search_location: e.target.value})}
          placeholder="Contoh: Jakarta, Singapore, Remote"
          className="mt-1.5 w-full h-11 rounded-lg bg-black/[4%] border border-black/[8%] px-4 text-sm focus:border-[#0367FC]/40 focus:outline-none focus:ring-2 focus:ring-[#0367FC]/10 transition-all"
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
        className="rounded-xl bg-[#0367FC]/5 border border-[#0367FC]/20 p-4"
        style={{ animation: `fadeInUp 0.4s ease-out 0s both` }}
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-[#0367FC] text-white grid place-items-center text-sm font-bold">
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
          { label: 'Skills', value: userSkills.length, icon: Wrench, color: 'text-[#0367FC]', bg: 'bg-blue-50' },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div 
              key={stat.label}
              className={`rounded-xl ${stat.bg} border border-black/[6%] p-3 text-center transition-all duration-300 hover:scale-105 hover:shadow-sm`}
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
        className="rounded-xl border border-black/[8%] bg-black/[2%] p-4 space-y-2"
        style={{ animation: `fadeInUp 0.4s ease-out 0.4s both` }}
      >
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Target className="h-4 w-4 text-[#0367FC]" /> Preferensi
        </h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2">
            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Gaji harapan:</span>
            <span className="font-medium">Rp {(preferences.desired_salary / 1000000).toFixed(0)}jt</span>
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
            <span className="font-medium">{preferences.notice_period} hari</span>
          </div>
        </div>
      </div>

      {/* Completion Message */}
      <div 
        className="rounded-xl bg-green-50 border border-green-200 p-4 text-center"
        style={{ animation: `fadeInUp 0.5s ease-out 0.6s both` }}
      >
        <div className="h-12 w-12 rounded-full bg-green-100 text-green-600 grid place-items-center mx-auto mb-2">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <p className="text-sm font-semibold text-green-800">Profil Siap!</p>
        <p className="text-xs text-green-600 mt-1">AI akan menggunakan data ini untuk mencari dan melamar pekerjaan otomatis.</p>
      </div>
    </div>
  );
}

export default ProfilePage;
