import { useId, useState, type ReactNode } from "react";
import {
  Briefcase, GraduationCap, Wrench, Building2, Calendar, MapPin, Layers, Star,
  Pencil, Trash2, Plus, X, Loader2, AlertCircle, Trophy,
} from "lucide-react";
import {
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_DESCRIPTION_MAX,
  ACHIEVEMENT_ISSUER_MAX,
  ACHIEVEMENT_TITLE_MAX,
  DEGREE_SUGGESTIONS,
  EMPLOYMENT_TYPES,
  LIMITS,
  LOCATION_TYPES,
  PROFICIENCY_LEVELS,
  SKILL_CATEGORIES,
  achievementCategoryLabel,
  achievementToForm,
  emptyAchievementForm,
  emptyEducationForm,
  emptyExperienceForm,
  emptySkillForm,
  educationToForm,
  experienceToForm,
  formatMonthYear,
  normalizeAchievements,
  normalizeStringList,
  skillToForm,
  sortAchievements,
  sortEducation,
  sortExperiences,
  sortSkills,
  validateAchievementForm,
  validateEducation,
  validateExperience,
  validateSkill,
  type AchievementForm,
  type AchievementRow,
  type EducationForm,
  type EducationRow,
  type ExperienceForm,
  type ExperienceRow,
  type FieldErrors,
  type SkillForm,
  type SkillRow,
} from "@/lib/profileForms";

// Same look as the other profile steps (Step1Basic): bordered grey inputs, #0A5BE0 accents.
const inputCls =
  "mt-1.5 w-full h-11 rounded-lg bg-black/[4%] border-2 border-black/[8%] px-4 text-sm focus:border-[#0A5BE0]/40 focus:outline-none focus:ring-2 focus:ring-[#0A5BE0]/10 transition-all duration-200 hover:border-black/[12%] aria-[invalid=true]:border-red-400";
const textareaCls =
  "mt-1.5 w-full rounded-lg bg-black/[4%] border-2 border-black/[8%] px-4 py-3 text-sm focus:border-[#0A5BE0]/40 focus:outline-none focus:ring-2 focus:ring-[#0A5BE0]/10 transition-all duration-200 hover:border-black/[12%] aria-[invalid=true]:border-red-400";
const labelCls = "text-xs uppercase tracking-wider text-muted-foreground font-semibold";
const dashedBtn =
  "w-full h-11 rounded-xl border-2 border-dashed border-black/[12%] text-sm text-muted-foreground hover:border-[#0A5BE0]/40 hover:text-[#0A5BE0] hover:bg-[#0A5BE0]/[2%] transition-all duration-300 inline-flex items-center justify-center gap-2";

function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: string; children: ReactNode; htmlFor: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className={labelCls}>{label}</label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-600 flex items-center gap-1" role="alert"><AlertCircle className="h-3 w-3 shrink-0" /> {error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function EmptyState({ icon: Icon, title, hint }: { icon: any; title: string; hint: string }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-black/[10%] bg-black/[2%] p-5 text-center">
      <div className="h-10 w-10 rounded-full bg-[#0A5BE0]/10 text-[#0A5BE0] grid place-items-center mx-auto mb-2"><Icon className="h-5 w-5" /></div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto leading-relaxed">{hint}</p>
    </div>
  );
}

function FormShell({ title, saving, onCancel, onSubmit, error, children }: { title: string; saving: boolean; onCancel: () => void; onSubmit: () => void; error: string; children: ReactNode }) {
  return (
    <form
      noValidate
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      className="rounded-xl border-2 border-[#0A5BE0]/30 bg-[#0A5BE0]/[3%] p-4 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{title}</h4>
        <button type="button" onClick={onCancel} aria-label="Tutup formulir" className="h-7 w-7 rounded-lg grid place-items-center text-muted-foreground hover:bg-black/[6%]"><X className="h-4 w-4" /></button>
      </div>
      {children}
      {error && <p className="text-xs text-red-600 bg-red-50 border-2 border-red-100 rounded-lg p-2" role="alert">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} disabled={saving} className="h-10 px-4 rounded-lg border-2 border-black/[8%] bg-black/[4%] text-sm hover:bg-black/[7%] transition disabled:opacity-50">Batal</button>
        <button type="submit" disabled={saving} className="h-10 px-5 rounded-lg bg-[#0A5BE0] text-white text-sm font-semibold hover:bg-[#0A5BE0]/90 transition disabled:opacity-60 inline-flex items-center gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Simpan
        </button>
      </div>
    </form>
  );
}

/**
 * Hapus dengan konfirmasi di tempat: ikon hapus, lalu "Hapus" dan "Batal". Dipakai pengalaman, pendidikan, skill,
 * dan penghargaan. Varian "chip" untuk kapsul biru (skill): ikon X putih dan tombol yang terbaca di atas biru.
 */
export function DeleteButton({ onConfirm, busy, label, variant = "row" }: { onConfirm: () => void; busy: boolean; label: string; variant?: "row" | "chip" }) {
  const [asking, setAsking] = useState(false);
  const chip = variant === "chip";
  if (asking) {
    return (
      <span className="inline-flex items-center gap-1">
        <button type="button" onClick={() => { setAsking(false); onConfirm(); }} disabled={busy} aria-label={`Konfirmasi: ${label}`} className={`h-7 px-2 rounded-md bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-60${chip ? " border border-white/70" : ""}`}>Hapus</button>
        <button type="button" onClick={() => setAsking(false)} aria-label={`Batal: ${label}`} className={chip ? "h-7 px-2 rounded-md border border-white/70 text-xs text-white hover:bg-white/20" : "h-7 px-2 rounded-md border-2 border-black/[8%] text-xs hover:bg-black/[5%]"}>Batal</button>
      </span>
    );
  }
  if (chip) {
    return (
      <button type="button" onClick={() => setAsking(true)} disabled={busy} aria-label={label} title={label} className="h-6 w-6 rounded-full grid place-items-center hover:bg-white/20 disabled:opacity-50">
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
      </button>
    );
  }
  return (
    <button type="button" onClick={() => setAsking(true)} disabled={busy} aria-label={label} title={label} className="h-7 w-7 rounded-md grid place-items-center text-muted-foreground hover:text-red-600 hover:bg-red-50 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>
  );
}

const labelOf = (list: ReadonlyArray<{ value: string | number; label: string }>, v: unknown) => list.find((x) => x.value === v)?.label ?? (typeof v === "string" ? v : "");

// ================================================================================================
// Work experience
// ================================================================================================

export function ExperienceEditor({ items, onSave, onDelete, now }: {
  items: any[];
  onSave: (row: ExperienceRow, id: string | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  now?: Date;
}) {
  const uid = useId();
  // null = list only, "new" = add form, otherwise the id being edited
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<ExperienceForm>(emptyExperienceForm());
  const [errors, setErrors] = useState<FieldErrors<ExperienceForm>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const open = (id: string | null, f: ExperienceForm) => { setEditing(id); setForm(f); setErrors({}); setFormError(""); };
  const set = <K extends keyof ExperienceForm>(k: K, v: ExperienceForm[K]) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    const res = validateExperience(form, now);
    if (!res.ok) { setErrors(res.errors); setFormError("Periksa kolom yang ditandai merah."); return; }
    setSaving(true); setFormError("");
    try {
      await onSave(res.row, editing === "new" ? null : editing);
      setEditing(null);
    } catch (e: any) {
      setFormError(e?.message ? `Gagal menyimpan: ${e.message}` : "Gagal menyimpan. Coba lagi.");
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try { await onDelete(id); } finally { setBusyId(null); }
  };

  const sorted = sortExperiences(items);

  return (
    <div className="space-y-3">
      {sorted.length === 0 && editing === null && (
        <EmptyState
          icon={Briefcase}
          title="Belum ada pengalaman kerja"
          hint="Draf lamaran memakai maksimal tiga pengalaman terbaru. Bila belum pernah bekerja, kamu boleh melewati langkah ini, atau tambahkan magang atau kerja paruh waktu."
        />
      )}

      {sorted.map((exp, i) => {
        if (editing === exp.id) return null;
        const achievements = normalizeAchievements(exp.achievements);
        const skills = normalizeStringList(exp.skills_used);
        return (
          <div key={exp.id} className="rounded-xl border-2 border-black/[8%] bg-black/[2%] p-4 hover:border-[#0A5BE0]/30 transition-all duration-300" style={{ animation: `fadeInUp 0.4s ease-out ${i * 0.05}s both` }}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-lg bg-[#0A5BE0]/10 text-[#0A5BE0] grid place-items-center shrink-0"><Building2 className="h-5 w-5" /></div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{exp.role_title}</p>
                  <p className="text-xs text-muted-foreground truncate">{exp.company_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${exp.is_current ? "bg-green-100 text-green-700" : "bg-black/[5%] text-muted-foreground"}`}>{exp.is_current ? "Saat ini" : "Selesai"}</span>
                <button type="button" onClick={() => open(exp.id, experienceToForm(exp))} aria-label={`Ubah pengalaman ${exp.role_title}`} title="Ubah" className="h-7 w-7 rounded-md grid place-items-center text-muted-foreground hover:text-[#0A5BE0] hover:bg-[#0A5BE0]/10"><Pencil className="h-3.5 w-3.5" /></button>
                <DeleteButton onConfirm={() => remove(exp.id)} busy={busyId === exp.id} label={`Hapus pengalaman ${exp.role_title}`} />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatMonthYear(exp.start_date)} - {exp.is_current ? "Sekarang" : formatMonthYear(exp.end_date) || "-"}</span>
              {exp.location_type && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {labelOf(LOCATION_TYPES, exp.location_type)}</span>}
              {exp.employment_type && <span className="inline-flex items-center gap-1"><Layers className="h-3 w-3" /> {labelOf(EMPLOYMENT_TYPES, exp.employment_type)}</span>}
            </div>
            {exp.description && <p className="mt-2 text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{exp.description}</p>}
            {achievements.length > 0 && (
              <div className="mt-2 space-y-1">
                {achievements.map((a, j) => (
                  <div key={j} className="flex items-start gap-1.5 text-xs"><Star className="h-3 w-3 mt-0.5 text-[#D2F801] shrink-0" /><span className="text-muted-foreground">{a}</span></div>
                ))}
              </div>
            )}
            {skills.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {skills.map((s) => <span key={s} className="text-xs px-2 py-0.5 rounded-md bg-black/[5%] text-muted-foreground">{s}</span>)}
              </div>
            )}
          </div>
        );
      })}

      {editing !== null ? (
        <FormShell title={editing === "new" ? "Tambah pengalaman kerja" : "Ubah pengalaman kerja"} saving={saving} onCancel={() => setEditing(null)} onSubmit={submit} error={formError}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Posisi" htmlFor={`${uid}-role`} error={errors.role_title}>
              <input id={`${uid}-role`} className={inputCls} aria-invalid={!!errors.role_title} maxLength={LIMITS.name} value={form.role_title} onChange={(e) => set("role_title", e.target.value)} placeholder="Contoh: Staf Administrasi" />
            </Field>
            <Field label="Perusahaan" htmlFor={`${uid}-company`} error={errors.company_name}>
              <input id={`${uid}-company`} className={inputCls} aria-invalid={!!errors.company_name} maxLength={LIMITS.name} value={form.company_name} onChange={(e) => set("company_name", e.target.value)} placeholder="Contoh: PT Maju Jaya" />
            </Field>
            <Field label="Jenis pekerjaan" htmlFor={`${uid}-etype`} error={errors.employment_type}>
              <select id={`${uid}-etype`} className={inputCls} value={form.employment_type} onChange={(e) => set("employment_type", e.target.value)}>
                {EMPLOYMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Model kerja" htmlFor={`${uid}-ltype`} error={errors.location_type}>
              <select id={`${uid}-ltype`} className={inputCls} value={form.location_type} onChange={(e) => set("location_type", e.target.value)}>
                {LOCATION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Mulai" htmlFor={`${uid}-start`} error={errors.start_date}>
              <input id={`${uid}-start`} type="month" className={inputCls} aria-invalid={!!errors.start_date} value={form.start_date} onChange={(e) => set("start_date", e.target.value)} />
            </Field>
            <Field label="Selesai" htmlFor={`${uid}-end`} error={errors.end_date}>
              <input id={`${uid}-end`} type="month" className={`${inputCls} disabled:opacity-50`} aria-invalid={!!errors.end_date} disabled={form.is_current} value={form.is_current ? "" : form.end_date} onChange={(e) => set("end_date", e.target.value)} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.is_current} onChange={(e) => set("is_current", e.target.checked)} className="h-4 w-4 accent-[#0A5BE0]" />
            Masih bekerja di sini
          </label>
          <Field label="Deskripsi" htmlFor={`${uid}-desc`} error={errors.description} hint={`${form.description.trim().length}/${LIMITS.longText}. Tulis tugas utama dengan fakta yang benar; draf AI hanya boleh memakai fakta dari profilmu.`}>
            <textarea id={`${uid}-desc`} rows={3} className={textareaCls} aria-invalid={!!errors.description} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Tugas dan tanggung jawab utama" />
          </Field>
          <Field label="Pencapaian (satu per baris)" htmlFor={`${uid}-ach`} error={errors.achievements} hint="Opsional. Tulis hanya yang benar-benar terjadi.">
            <textarea id={`${uid}-ach`} rows={3} className={textareaCls} aria-invalid={!!errors.achievements} value={form.achievements} onChange={(e) => set("achievements", e.target.value)} />
          </Field>
          <Field label="Skill yang dipakai (pisahkan dengan koma)" htmlFor={`${uid}-skills`} error={errors.skills_used}>
            <input id={`${uid}-skills`} className={inputCls} aria-invalid={!!errors.skills_used} value={form.skills_used} onChange={(e) => set("skills_used", e.target.value)} placeholder="Excel, Komunikasi, SQL" />
          </Field>
        </FormShell>
      ) : (
        <button type="button" onClick={() => open("new", emptyExperienceForm())} className={dashedBtn}><Plus className="h-4 w-4" /> Tambah Pengalaman Kerja</button>
      )}
    </div>
  );
}

// ================================================================================================
// Education
// ================================================================================================

export function EducationEditor({ items, onSave, onDelete, now }: {
  items: any[];
  onSave: (row: EducationRow, id: string | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  now?: Date;
}) {
  const uid = useId();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<EducationForm>(emptyEducationForm());
  const [errors, setErrors] = useState<FieldErrors<EducationForm>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const open = (id: string | null, f: EducationForm) => { setEditing(id); setForm(f); setErrors({}); setFormError(""); };
  const set = <K extends keyof EducationForm>(k: K, v: EducationForm[K]) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    const res = validateEducation(form, now);
    if (!res.ok) { setErrors(res.errors); setFormError("Periksa kolom yang ditandai merah."); return; }
    setSaving(true); setFormError("");
    try {
      await onSave(res.row, editing === "new" ? null : editing);
      setEditing(null);
    } catch (e: any) {
      setFormError(e?.message ? `Gagal menyimpan: ${e.message}` : "Gagal menyimpan. Coba lagi.");
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try { await onDelete(id); } finally { setBusyId(null); }
  };

  const sorted = sortEducation(items);

  return (
    <div className="space-y-3">
      {sorted.length === 0 && editing === null && (
        <EmptyState icon={GraduationCap} title="Belum ada riwayat pendidikan" hint="Tambahkan pendidikan terakhirmu, misalnya S1 atau SMK. Riwayat pendidikan dipakai pada CV hasil AI." />
      )}

      {sorted.map((edu, i) => {
        if (editing === edu.id) return null;
        return (
          <div key={edu.id} className="rounded-xl border-2 border-black/[8%] bg-black/[2%] p-4 hover:border-[#0A5BE0]/30 transition-all duration-300" style={{ animation: `fadeInUp 0.4s ease-out ${i * 0.05}s both` }}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-lg bg-amber-100 text-amber-700 grid place-items-center shrink-0"><GraduationCap className="h-5 w-5" /></div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{edu.institution}</p>
                  <p className="text-xs text-muted-foreground truncate">{edu.degree}{edu.field_of_study ? ` · ${edu.field_of_study}` : ""}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => open(edu.id, educationToForm(edu))} aria-label={`Ubah pendidikan ${edu.institution}`} title="Ubah" className="h-7 w-7 rounded-md grid place-items-center text-muted-foreground hover:text-[#0A5BE0] hover:bg-[#0A5BE0]/10"><Pencil className="h-3.5 w-3.5" /></button>
                <DeleteButton onConfirm={() => remove(edu.id)} busy={busyId === edu.id} label={`Hapus pendidikan ${edu.institution}`} />
              </div>
            </div>
            <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
              <span>{edu.start_year ?? "-"} - {edu.is_current ? "Sekarang" : edu.end_year ?? "-"}</span>
              {edu.gpa != null && <span className="font-mono">IPK: {edu.gpa}/{edu.max_gpa ?? 4}</span>}
            </div>
            {edu.description && <p className="mt-2 text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{edu.description}</p>}
          </div>
        );
      })}

      {editing !== null ? (
        <FormShell title={editing === "new" ? "Tambah pendidikan" : "Ubah pendidikan"} saving={saving} onCancel={() => setEditing(null)} onSubmit={submit} error={formError}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Institusi" htmlFor={`${uid}-inst`} error={errors.institution}>
                <input id={`${uid}-inst`} className={inputCls} aria-invalid={!!errors.institution} maxLength={LIMITS.name} value={form.institution} onChange={(e) => set("institution", e.target.value)} placeholder="Contoh: Universitas Kristen Duta Wacana" />
              </Field>
            </div>
            <Field label="Jenjang" htmlFor={`${uid}-degree`} error={errors.degree}>
              <input id={`${uid}-degree`} list={`${uid}-degrees`} className={inputCls} aria-invalid={!!errors.degree} maxLength={LIMITS.shortText} value={form.degree} onChange={(e) => set("degree", e.target.value)} placeholder="S1" />
              <datalist id={`${uid}-degrees`}>{DEGREE_SUGGESTIONS.map((d) => <option key={d} value={d} />)}</datalist>
            </Field>
            <Field label="Jurusan" htmlFor={`${uid}-field`} error={errors.field_of_study}>
              <input id={`${uid}-field`} className={inputCls} aria-invalid={!!errors.field_of_study} maxLength={LIMITS.shortText} value={form.field_of_study} onChange={(e) => set("field_of_study", e.target.value)} placeholder="Contoh: Sistem Informasi" />
            </Field>
            <Field label="Tahun masuk" htmlFor={`${uid}-sy`} error={errors.start_year}>
              <input id={`${uid}-sy`} inputMode="numeric" className={inputCls} aria-invalid={!!errors.start_year} maxLength={4} value={form.start_year} onChange={(e) => set("start_year", e.target.value)} placeholder="2021" />
            </Field>
            <Field label="Tahun lulus" htmlFor={`${uid}-ey`} error={errors.end_year}>
              <input id={`${uid}-ey`} inputMode="numeric" className={`${inputCls} disabled:opacity-50`} aria-invalid={!!errors.end_year} maxLength={4} disabled={form.is_current} value={form.is_current ? "" : form.end_year} onChange={(e) => set("end_year", e.target.value)} placeholder="2025" />
            </Field>
            <Field label="IPK (opsional)" htmlFor={`${uid}-gpa`} error={errors.gpa}>
              <input id={`${uid}-gpa`} inputMode="decimal" className={inputCls} aria-invalid={!!errors.gpa} value={form.gpa} onChange={(e) => set("gpa", e.target.value)} placeholder="3,75" />
            </Field>
            <Field label="Skala IPK" htmlFor={`${uid}-mgpa`} error={errors.max_gpa}>
              <input id={`${uid}-mgpa`} inputMode="decimal" className={inputCls} aria-invalid={!!errors.max_gpa} value={form.max_gpa} onChange={(e) => set("max_gpa", e.target.value)} placeholder="4" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.is_current} onChange={(e) => set("is_current", e.target.checked)} className="h-4 w-4 accent-[#0A5BE0]" />
            Masih menempuh
          </label>
          <Field label="Keterangan (opsional)" htmlFor={`${uid}-edesc`} error={errors.description}>
            <textarea id={`${uid}-edesc`} rows={2} className={textareaCls} aria-invalid={!!errors.description} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
        </FormShell>
      ) : (
        <button type="button" onClick={() => open("new", emptyEducationForm())} className={dashedBtn}><GraduationCap className="h-4 w-4" /> Tambah Pendidikan</button>
      )}
    </div>
  );
}

// ================================================================================================
// Skills
// ================================================================================================

export function SkillsEditor({ items, onSave, onDelete }: {
  items: any[];
  onSave: (row: SkillRow, id: string | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const uid = useId();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<SkillForm>(emptySkillForm());
  const [errors, setErrors] = useState<FieldErrors<SkillForm>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const open = (id: string | null, f: SkillForm) => { setEditing(id); setForm(f); setErrors({}); setFormError(""); };
  const set = <K extends keyof SkillForm>(k: K, v: SkillForm[K]) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    const res = validateSkill(form, { existing: items, editingId: editing === "new" ? null : editing });
    if (!res.ok) { setErrors(res.errors); setFormError("Periksa kolom yang ditandai merah."); return; }
    setSaving(true); setFormError("");
    try {
      await onSave(res.row, editing === "new" ? null : editing);
      setEditing(null);
    } catch (e: any) {
      setFormError(e?.message ? `Gagal menyimpan: ${e.message}` : "Gagal menyimpan. Coba lagi.");
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try { await onDelete(id); } finally { setBusyId(null); }
  };

  const sorted = sortSkills(items);

  return (
    <div className="space-y-3">
      {sorted.length === 0 && editing === null && (
        <EmptyState icon={Wrench} title="Belum ada skill" hint="Draf lamaran memakai daftar skill ini. Tambahkan skill yang benar-benar kamu kuasai, misalnya Excel, Bahasa Inggris, atau Python." />
      )}

      {sorted.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {sorted.map((skill) => (
            <li key={skill.id} className="inline-flex items-center gap-1 text-xs pl-3 pr-1 py-1 rounded-full bg-[#0A5BE0] text-white font-medium">
              <span>{skill.name}</span>
              <span className="text-xs opacity-70" title={labelOf(PROFICIENCY_LEVELS, skill.proficiency_level)}>{skill.proficiency_level}/5</span>
              <button type="button" onClick={() => open(skill.id, skillToForm(skill))} aria-label={`Ubah skill ${skill.name}`} title="Ubah" className="h-6 w-6 rounded-full grid place-items-center hover:bg-white/20"><Pencil className="h-3 w-3" /></button>
              {/* Konfirmasi di tempat ("Hapus" / "Batal"), sama seperti pendidikan dan pengalaman. */}
              <DeleteButton variant="chip" onConfirm={() => remove(skill.id)} busy={busyId === skill.id} label={`Hapus skill ${skill.name}`} />
            </li>
          ))}
        </ul>
      )}

      {editing !== null ? (
        <FormShell title={editing === "new" ? "Tambah skill" : "Ubah skill"} saving={saving} onCancel={() => setEditing(null)} onSubmit={submit} error={formError}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Nama skill" htmlFor={`${uid}-name`} error={errors.name}>
                <input id={`${uid}-name`} className={inputCls} aria-invalid={!!errors.name} maxLength={LIMITS.skillName} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Contoh: Microsoft Excel" />
              </Field>
            </div>
            <Field label="Kategori" htmlFor={`${uid}-cat`} error={errors.category}>
              <select id={`${uid}-cat`} className={inputCls} value={form.category} onChange={(e) => set("category", e.target.value)}>
                {SKILL_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
            <Field label="Tingkat" htmlFor={`${uid}-lvl`} error={errors.proficiency_level}>
              <select id={`${uid}-lvl`} className={inputCls} value={form.proficiency_level} onChange={(e) => set("proficiency_level", e.target.value)}>
                {PROFICIENCY_LEVELS.map((l) => <option key={l.value} value={String(l.value)}>{l.value} - {l.label}</option>)}
              </select>
            </Field>
            <Field label="Lama memakai, tahun (opsional)" htmlFor={`${uid}-yrs`} error={errors.years_experience}>
              <input id={`${uid}-yrs`} inputMode="decimal" className={inputCls} aria-invalid={!!errors.years_experience} value={form.years_experience} onChange={(e) => set("years_experience", e.target.value)} placeholder="2" />
            </Field>
          </div>
        </FormShell>
      ) : (
        <button type="button" onClick={() => open("new", emptySkillForm())} className="h-10 px-4 rounded-xl border-2 border-dashed border-black/[12%] text-sm text-muted-foreground hover:border-[#0A5BE0]/40 hover:text-[#0A5BE0] transition-all inline-flex items-center gap-2"><Plus className="h-4 w-4" /> Tambah Skill</button>
      )}
    </div>
  );
}

// ================================================================================================
// Achievements: penghargaan dan publikasi
// ================================================================================================

export function AchievementEditor({ items, onSave, onDelete, now }: {
  items: any[];
  onSave: (row: AchievementRow, id: string | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  now?: Date;
}) {
  const uid = useId();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<AchievementForm>(emptyAchievementForm());
  const [errors, setErrors] = useState<FieldErrors<AchievementForm>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const open = (id: string | null, f: AchievementForm) => { setEditing(id); setForm(f); setErrors({}); setFormError(""); };
  const set = <K extends keyof AchievementForm>(k: K, v: AchievementForm[K]) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    const res = validateAchievementForm(form, now);
    if (!res.ok) { setErrors(res.errors); setFormError("Periksa kolom yang ditandai merah."); return; }
    setSaving(true); setFormError("");
    try {
      await onSave(res.row, editing === "new" ? null : editing);
      setEditing(null);
    } catch (e: any) {
      setFormError(e?.message ? `Gagal menyimpan: ${e.message}` : "Gagal menyimpan. Coba lagi.");
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try { await onDelete(id); } finally { setBusyId(null); }
  };

  const sorted = sortAchievements(items);

  return (
    <div className="space-y-3">
      {sorted.length === 0 && editing === null && (
        <EmptyState icon={Trophy} title="Belum ada penghargaan atau publikasi" hint="Tambahkan penghargaan, juara lomba, atau publikasi yang benar-benar kamu raih. Draf lamaran boleh menyebutnya, tetapi hanya yang tercantum di sini." />
      )}

      {sorted.map((a, i) => {
        if (editing === a.id) return null;
        const meta = [achievementCategoryLabel(a.category), a.issuer, formatMonthYear(a.achievement_date)].filter(Boolean).join(" · ");
        return (
          <div key={a.id} className="rounded-xl border-2 border-black/[8%] bg-black/[2%] p-4 hover:border-[#0A5BE0]/30 transition-all duration-300" style={{ animation: `fadeInUp 0.4s ease-out ${i * 0.05}s both` }}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-lg bg-purple-100 text-purple-700 grid place-items-center shrink-0"><Trophy className="h-5 w-5" /></div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{a.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{meta}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => open(a.id, achievementToForm(a))} aria-label={`Ubah penghargaan atau publikasi ${a.title}`} title="Ubah" className="h-7 w-7 rounded-md grid place-items-center text-muted-foreground hover:text-[#0A5BE0] hover:bg-[#0A5BE0]/10"><Pencil className="h-3.5 w-3.5" /></button>
                <DeleteButton onConfirm={() => remove(a.id)} busy={busyId === a.id} label={`Hapus penghargaan atau publikasi ${a.title}`} />
              </div>
            </div>
            {a.description && <p className="mt-2 text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{a.description}</p>}
          </div>
        );
      })}

      {editing !== null ? (
        <FormShell title={editing === "new" ? "Tambah penghargaan atau publikasi" : "Ubah penghargaan atau publikasi"} saving={saving} onCancel={() => setEditing(null)} onSubmit={submit} error={formError}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Judul" htmlFor={`${uid}-title`} error={errors.title}>
                <input id={`${uid}-title`} className={inputCls} aria-invalid={!!errors.title} maxLength={ACHIEVEMENT_TITLE_MAX} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Contoh: Juara 1 Lomba Karya Tulis Ilmiah" />
              </Field>
            </div>
            <Field label="Jenis" htmlFor={`${uid}-cat`} error={errors.category}>
              <select id={`${uid}-cat`} className={inputCls} aria-invalid={!!errors.category} value={form.category} onChange={(e) => set("category", e.target.value)}>
                {ACHIEVEMENT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
            <Field label="Penyelenggara atau penerbit (opsional)" htmlFor={`${uid}-issuer`} error={errors.issuer}>
              <input id={`${uid}-issuer`} className={inputCls} aria-invalid={!!errors.issuer} maxLength={ACHIEVEMENT_ISSUER_MAX} value={form.issuer} onChange={(e) => set("issuer", e.target.value)} placeholder="Contoh: Kemendikbudristek" />
            </Field>
            <Field label="Bulan dan tahun (opsional)" htmlFor={`${uid}-date`} error={errors.achievement_date}>
              <input id={`${uid}-date`} type="month" className={inputCls} aria-invalid={!!errors.achievement_date} value={form.achievement_date} onChange={(e) => set("achievement_date", e.target.value)} />
            </Field>
          </div>
          <Field label="Deskripsi (opsional)" htmlFor={`${uid}-adesc`} error={errors.description} hint={`${form.description.trim().length}/${ACHIEVEMENT_DESCRIPTION_MAX}. Tulis hanya yang benar-benar terjadi.`}>
            <textarea id={`${uid}-adesc`} rows={3} className={textareaCls} aria-invalid={!!errors.description} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
        </FormShell>
      ) : (
        <button type="button" onClick={() => open("new", emptyAchievementForm())} className={dashedBtn}><Trophy className="h-4 w-4" /> Tambah Penghargaan atau Publikasi</button>
      )}
    </div>
  );
}
