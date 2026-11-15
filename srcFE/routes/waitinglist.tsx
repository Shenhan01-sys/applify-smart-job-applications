import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import {
  Sparkles, ArrowLeft, ArrowRight, CheckCircle2, Loader2, AlertCircle,
  User, GraduationCap, Hash, BookOpen, Briefcase, MapPin, Rocket, ShieldCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export const Route = createFileRoute("/waitinglist")({
  head: () => ({ meta: [{ title: "Waitinglist Early Access — Applify" }] }),
  component: WaitinglistPage,
});

const WORK_STATUS_OPTIONS = [
  "Mahasiswa Aktif",
  "Fresh Graduate (< 1 tahun)",
  "Part-time Worker",
  "Full-time Worker",
  "Freelance / Gig",
  "Menganggur",
  "Lainnya",
] as const;

interface FormState {
  full_name: string;
  university: string;
  age: string;
  major: string;
  work_status: string;
  job_goal: string;
  location_goal: string;
}

const INITIAL: FormState = {
  full_name: "",
  university: "",
  age: "",
  major: "",
  work_status: "",
  job_goal: "",
  location_goal: "",
};

function WaitinglistPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<0 | 1>(0);

  const update = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const validateStep0 = () => {
    if (!form.full_name.trim()) return "Nama lengkap wajib diisi.";
    if (!form.university.trim()) return "Asal universitas wajib diisi.";
    const ageNum = parseInt(form.age, 10);
    if (!form.age || isNaN(ageNum) || ageNum < 14 || ageNum > 100) return "Umur harus 14–100.";
    if (!form.major.trim()) return "Program studi wajib diisi.";
    return null;
  };

  const onNext = (e: FormEvent) => {
    e.preventDefault();
    const err = validateStep0();
    if (err) { setError(err); return; }
    setError(null);
    setStep(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.work_status) { setError("Pilih status kerja saat ini."); return; }
    if (!form.job_goal.trim()) { setError("Goals pekerjaan wajib diisi."); return; }
    if (!form.location_goal.trim()) { setError("Goals lokasi pekerjaan wajib diisi."); return; }
    setError(null);
    setSubmitting(true);

    const payload = {
      full_name: form.full_name.trim(),
      university: form.university.trim(),
      age: parseInt(form.age, 10),
      major: form.major.trim(),
      work_status: form.work_status,
      job_goal: form.job_goal.trim(),
      location_goal: form.location_goal.trim(),
      email: user?.email ?? null,
      user_id: user?.id ?? null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      referrer: typeof document !== "undefined" ? document.referrer : null,
    };

    const { error: dbErr } = await supabase.from("waitinglist").insert(payload);
    setSubmitting(false);

    if (dbErr) {
      setError("Gagal menyimpan. Coba lagi sebentar ya.");
      toast.error("Gagal daftar waitinglist");
      return;
    }

    try { localStorage.setItem("applify:waitinglist-joined", "1"); } catch {}
    toast.success("Selamat! Kamu resmi di waitinglist Applify.");
    navigate({ to: "/login" });
  };

  const progress = step === 0 ? 50 : 100;

  return (
    <div className="min-h-screen bg-[#F4F1E8]">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-[#F4F1E8]/85 border-b border-[color:var(--border)]">
        <div className="max-w-3xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg gradient-primary text-white font-bold">A</div>
            <span className="text-lg font-bold">Applify</span>
          </Link>
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Kembali ke beranda
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-8 py-10 md:py-16">
        {/* Hero */}
        <div className="text-center max-w-xl mx-auto">
          <div className="inline-flex items-center gap-2 h-7 px-3 rounded-full bg-[#D2F801] text-[#16150F] text-[10px] font-bold uppercase tracking-wider">
            <Sparkles className="h-3 w-3" /> Early Access
          </div>
          <h1 className="mt-4 font-display text-3xl md:text-4xl font-extrabold tracking-tight">
            Gabung <span className="text-gradient-primary">waitinglist</span> Applify.
          </h1>
          <p className="mt-3 text-muted-foreground">
            Dapet akses lebih awal + bonus 1 bulan Pro gratis saat launch. Isi formulir singkat, sekitar 30 detik.
          </p>
        </div>

        {/* Progress bar */}
        <div className="mt-8 mb-6">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span>Step {step + 1} dari 2</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-black/[8%] overflow-hidden">
            <div
              className="h-full gradient-primary transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Form card */}
        <form
          onSubmit={step === 0 ? onNext : onSubmit}
          className="glass rounded-3xl p-6 md:p-8 space-y-5"
        >
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-[#C0341A]/30 bg-[#C0341A]/[6%] p-3 text-sm text-[#C0341A]">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 0 && (
            <>
              <SectionHeader
                icon={User}
                title="Biar kenalan dulu"
                subtitle="Biar kami bisa follow-up yang relevan."
              />
              <Field
                label="Nama lengkap"
                required
                icon={User}
                value={form.full_name}
                onChange={(v) => update("full_name", v)}
                placeholder="Citra Pratiwi"
              />
              <Field
                label="Asal universitas / kampus"
                required
                icon={GraduationCap}
                value={form.university}
                onChange={(v) => update("university", v)}
                placeholder="Universitas Udayana"
              />
              <div className="grid sm:grid-cols-2 gap-4">
                <Field
                  label="Umur"
                  required
                  type="number"
                  icon={Hash}
                  value={form.age}
                  onChange={(v) => update("age", v)}
                  placeholder="22"
                  min={14}
                  max={100}
                />
                <Field
                  label="Program studi"
                  required
                  icon={BookOpen}
                  value={form.major}
                  onChange={(v) => update("major", v)}
                  placeholder="Teknik Informatika"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  className="h-11 px-6 rounded-xl gradient-primary text-white font-semibold text-sm hover:opacity-90 transition inline-flex items-center gap-2"
                >
                  Lanjut <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <SectionHeader
                icon={Briefcase}
                title="Goals kariermu"
                subtitle="Biar kami bisa matching ke lowongan yang tepat."
              />

              <div>
                <label className="block text-sm font-semibold mb-1.5">
                  Status kerja saat ini <span className="text-[#C0341A]">*</span>
                </label>
                <div className="grid sm:grid-cols-2 gap-2">
                  {WORK_STATUS_OPTIONS.map((opt) => {
                    const active = form.work_status === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => update("work_status", opt)}
                        className={`text-left rounded-xl border-2 px-3.5 py-2.5 text-sm transition ${
                          active
                            ? "border-[#0A5BE0] bg-[#0A5BE0]/[4%] font-semibold"
                            : "border-[color:var(--border)] bg-white hover:bg-black/[3%]"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`h-4 w-4 rounded-full border-2 grid place-items-center shrink-0 ${
                            active ? "border-[#0A5BE0]" : "border-[color:var(--border)]"
                          }`}>
                            {active && <div className="h-2 w-2 rounded-full bg-[#0A5BE0]" />}
                          </div>
                          <span>{opt}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <Field
                label="Goals pekerjaan (apa yang kamu incar?)"
                required
                icon={Briefcase}
                value={form.job_goal}
                onChange={(v) => update("job_goal", v)}
                placeholder="Product Manager di startup fintech / sustainability"
              />
              <Field
                label="Goals lokasi pekerjaan"
                required
                icon={MapPin}
                value={form.location_goal}
                onChange={(v) => update("location_goal", v)}
                placeholder="Denpasar, Bali · atau remote untuk SEA"
              />

              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => { setError(null); setStep(0); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  className="h-11 px-5 rounded-xl border-2 border-[color:var(--border)] bg-white text-sm font-semibold hover:bg-black/[3%] transition inline-flex items-center gap-2"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Kembali
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-11 px-6 rounded-xl gradient-primary text-white font-semibold text-sm hover:opacity-90 transition disabled:opacity-60 inline-flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Menyimpan…
                    </>
                  ) : (
                    <>
                      <Rocket className="h-4 w-4" /> Submit & Lanjut Login
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </form>

        {/* Trust strip */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-xs text-muted-foreground">
          <div className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-[#1C9656]" />
            Data tersimpan aman di Supabase
          </div>
          <span className="hidden sm:inline">·</span>
          <div className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#1C9656]" />
            Tidak ada spam
          </div>
        </div>
      </main>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: typeof User; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3 pb-2">
      <div className="h-9 w-9 rounded-lg gradient-primary grid place-items-center text-white shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <h2 className="font-display text-lg font-extrabold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  type = "text",
  icon: Icon,
  value,
  onChange,
  placeholder,
  min,
  max,
}: {
  label: string;
  required?: boolean;
  type?: string;
  icon: typeof User;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold mb-1.5">
        {label} {required && <span className="text-[#C0341A]">*</span>}
      </label>
      <div className="relative">
        <Icon className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          min={min}
          max={max}
          className="w-full h-11 pl-10 pr-3 rounded-xl border-2 border-[color:var(--border)] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0A5BE0]/30 focus:border-[#0A5BE0] transition"
        />
      </div>
    </div>
  );
}
