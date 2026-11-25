import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect, useId } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import { automationApi, AutomationSettings } from "@/services/automationApi";
import { mockAutomationSettings, mockSubscription } from "@/mocks/mockData";
import { PLAN_MODELS } from "@/lib/planInfo";
import { 
  Loader2, Save, User, FileText, Search, Settings, Brain,
  Briefcase, MapPin, DollarSign, Clock, CheckCircle2, ToggleLeft,
  AlertCircle, Sparkles, ChevronRight, Crown, Zap, Lock, BarChart3
} from "lucide-react";
import { toast } from "sonner";
import { describeApiError } from "@/lib/apiErrors";
import { ErrorState } from "@/components/ErrorState";
import { VISA_OPTIONS, visaSelectValue, visaValueToStore } from "@/lib/visaChoice";
import { listToText, numberToText, parseCommaList, parseOptionalNumber, sameList } from "@/lib/settingsForm";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

export const Route = createFileRoute("/automation-settings")({
  beforeLoad: async () => {
    if (isMockMode()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Pengaturan Agen — Applify" }] }),
  component: AutomationSettingsPage,
});

const tabs = [
  { id: 'personal', label: 'Data Pribadi', icon: User },
  { id: 'answers', label: 'Jawaban Lamaran', icon: FileText },
  { id: 'search', label: 'Pencarian', icon: Search },
  { id: 'behavior', label: 'Perilaku Agen', icon: Settings },
  { id: 'ai', label: 'Model AI', icon: Brain },
];

function AutomationSettingsPage() {
  const [settings, setSettings] = useState<AutomationSettings>({});
  const [activeTab, setActiveTab] = useState('personal');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [showSaved, setShowSaved] = useState(false);
  const [tabKey, setTabKey] = useState(0);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');

  const handleTabChange = (tabId: string) => {
    const currentIndex = tabs.findIndex(t => t.id === activeTab);
    const newIndex = tabs.findIndex(t => t.id === tabId);
    setDirection(newIndex > currentIndex ? 'next' : 'prev');
    setActiveTab(tabId);
    setTabKey(k => k + 1);
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    setLoadError("");
    try {
      if (isMockMode()) {
        setSettings(mockAutomationSettings);
        return;
      }
      const data = await automationApi.getSettings();
      setSettings(data);
    } catch (error) {
      // Jangan tampilkan pengaturan contoh: pengguna bisa menyimpannya menimpa pengaturan aslinya.
      setLoadError(describeApiError(error, 'Pengaturan agen belum bisa dimuat.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (!isMockMode()) {
        await automationApi.updateSettings(settings);
      }
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    } catch (error) {
      toast.error(describeApiError(error, 'Pengaturan belum tersimpan.'));
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof AutomationSettings, value: unknown) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-[60vh]" role="status" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-[#0A5BE0]" aria-hidden="true" />
          <span className="ml-3 text-muted-foreground">Memuat pengaturan agen...</span>
        </div>
      </AppShell>
    );
  }

  if (loadError) {
    return (
      <AppShell>
        <header className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold">Pengaturan Agen</h1>
        </header>
        <ErrorState title="Pengaturan agen belum bisa dimuat" message={loadError} onRetry={loadSettings} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Save Toast */}
      {showSaved && (
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-[fadeInUp_0.3s_ease-out]">
          <CheckCircle2 className="h-4 w-4" />
          <span className="text-sm font-semibold" role="status">Pengaturan disimpan!</span>
        </div>
      )}

      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Pengaturan Agen</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Atur data dan preferensi yang dipakai agen saat mencari lowongan dan mengisi formulir lamaran
        </p>
      </header>

      {/* Tabs */}
      <div role="tablist" aria-label="Bagian pengaturan" className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => handleTabChange(tab.id)}
              className={`flex min-h-11 items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                isActive
                  ? 'bg-[#0A5BE0] text-white shadow-lg shadow-[#0A5BE0]/20'
                  : 'bg-black/[4%] text-muted-foreground border-2 border-black/[8%] hover:bg-black/[7%]'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="glass rounded-2xl p-5 md:p-6 overflow-hidden">
        <div
          key={tabKey}
          className={direction === 'next' ? 'animate-slide-right' : 'animate-slide-left'}
        >
          {activeTab === 'personal' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <User className="h-5 w-5 text-[#0A5BE0]" aria-hidden="true" /> Data Pribadi
              </h2>
              <p className="text-sm text-muted-foreground">Data ini dipakai agen untuk mengisi formulir lamaran. Isi seperlunya.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputField label="Nama depan" value={settings.first_name || ''} onChange={(v: string) => updateField('first_name', v)} />
                <InputField label="Nama belakang" value={settings.last_name || ''} onChange={(v: string) => updateField('last_name', v)} />
                <InputField label="Nomor telepon" value={settings.phone_number || ''} onChange={(v: string) => updateField('phone_number', v)} icon={Sparkles} />
                <InputField label="Kota tempat tinggal" value={settings.current_city || ''} onChange={(v: string) => updateField('current_city', v)} icon={MapPin} />
                <InputField label="Alamat jalan" value={settings.street || ''} onChange={(v: string) => updateField('street', v)} />
                <InputField label="Provinsi" value={settings.state || ''} onChange={(v: string) => updateField('state', v)} />
                <InputField label="Kode pos" value={settings.zipcode || ''} onChange={(v: string) => updateField('zipcode', v)} />
                <InputField label="Negara" value={settings.country || ''} onChange={(v: string) => updateField('country', v)} />
              </div>
            </div>
          )}

          {activeTab === 'answers' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#0A5BE0]" aria-hidden="true" /> Jawaban Lamaran
              </h2>
              <p className="text-sm text-muted-foreground">Jawaban tetap untuk pertanyaan yang sering muncul di formulir lamaran</p>
              <div className="space-y-4">
                <InputField label="Lama pengalaman kerja (tahun)" value={settings.years_of_experience || ''} onChange={(v: string) => updateField('years_of_experience', v)} />
                <SelectField 
                  label="Butuh sponsor visa kerja?" 
                  value={visaSelectValue(settings.require_visa)}
                  options={VISA_OPTIONS}
                  onChange={(v: string) => updateField('require_visa', visaValueToStore(v))}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InputField label="Gaji yang diharapkan (Rp, sesuai isian formulir)" type="number" value={numberToText(settings.desired_salary)} onChange={(v: string) => updateField('desired_salary', parseOptionalNumber(v))} icon={DollarSign} />
                  <InputField label="Gaji saat ini (Rp)" type="number" value={numberToText(settings.current_ctc)} onChange={(v: string) => updateField('current_ctc', parseOptionalNumber(v))} icon={DollarSign} />
                </div>
                <InputField label="Masa pemberitahuan (hari)" type="number" value={numberToText(settings.notice_period)} onChange={(v: string) => updateField('notice_period', parseOptionalNumber(v))} placeholder="Misalnya 30" icon={Clock} />
                <InputField label="Alamat profil LinkedIn" value={settings.linkedin_url || ''} onChange={(v: string) => updateField('linkedin_url', v)} />
                <InputField label="Situs web atau portofolio" value={settings.website || ''} onChange={(v: string) => updateField('website', v)} />
                <div>
                  <label htmlFor="setting-cover-letter" className="text-sm font-medium text-foreground">Surat lamaran bawaan</label>
                  <textarea
                    id="setting-cover-letter"
                    rows={6}
                    value={settings.cover_letter || ''}
                    onChange={(e) => updateField('cover_letter', e.target.value)}
                    placeholder="Templat surat lamaran bawaanmu..."
                    className="mt-1.5 w-full rounded-xl bg-black/[4%] border-2 border-black/[8%] p-4 text-base md:text-sm focus:border-[#0A5BE0]/40 focus:outline-none focus:ring-2 focus:ring-[#0A5BE0]/10 transition-all resize-y"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'search' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Search className="h-5 w-5 text-[#0A5BE0]" aria-hidden="true" /> Preferensi Pencarian
              </h2>
              <div className="space-y-4">
                <CommaListField
                  label="Kata kunci pencarian (pisahkan dengan koma)"
                  value={settings.search_keywords}
                  onChange={(list: string[]) => updateField('search_keywords', list)}
                  placeholder="Software Engineer, React Developer, Full Stack"
                />
                <InputField 
                  label="Lokasi pencarian" 
                  value={settings.search_location || ''} 
                  onChange={(v: string) => updateField('search_location', v)} 
                  placeholder="Jakarta, Indonesia atau Remote"
                  icon={MapPin}
                />
                {/* Pilihan "hanya lamaran cepat" tidak ditampilkan: belum ada pencarian yang memakainya. */}
                <CommaListField
                  label="Perusahaan yang dihindari (pisahkan dengan koma)"
                  value={settings.blacklist_companies}
                  onChange={(list: string[]) => updateField('blacklist_companies', list)}
                />
                <CommaListField
                  label="Kata yang dihindari di lowongan (pisahkan dengan koma)"
                  value={settings.blacklist_words}
                  onChange={(list: string[]) => updateField('blacklist_words', list)}
                />
              </div>
            </div>
          )}

          {activeTab === 'behavior' && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Settings className="h-5 w-5 text-[#0A5BE0]" aria-hidden="true" /> Perilaku Agen
              </h2>
              {/* "Selalu pakai jawaban terbaru" tidak ditampilkan: tidak ada bagian server, agen, atau ekstensi yang membacanya. */}
              {/* pause_before_submit tidak lagi ditampilkan sebagai saklar (25 Nov 2026): worker selalu meminta
                  persetujuan sebelum kirim, jadi saklar yang bisa dimatikan menyesatkan. */}
              <div className="rounded-lg border border-[#0A5BE0]/20 bg-[#0A5BE0]/5 p-4" data-testid="always-approve-note">
                <p className="font-semibold text-sm">Selalu minta persetujuan sebelum mengirim</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Agen tidak pernah mengirim lamaran sebelum kamu menekan Setujui. Pengaturan ini tidak bisa dimatikan.
                </p>
              </div>
              <ToggleField 
                label="Berhenti saat ada pertanyaan yang tak bisa dijawab" 
                description="Agen berhenti bila menemukan pertanyaan formulir yang tidak bisa dijawab dari datamu"
                checked={settings.pause_at_failed_question ?? true}
                onChange={(v: boolean) => updateField('pause_at_failed_question', v)}
              />
              <ToggleField
                label="Pakai ekstensi browser otomatis untuk situs yang perlu login"
                description="Bila aktif, ekstensi langsung mulai mengisi formulir setelah kamu menyetujui lamaran, tanpa bertanya lagi. Ekstensi tetap berhenti sebelum kirim: kamu yang menekan Kirim."
                checked={settings.extension_auto_use ?? false}
                onChange={(v: boolean) => updateField('extension_auto_use', v)}
              />
            </div>
          )}

          {activeTab === 'ai' && (
            <AITierDisplay />
          )}

          {/* Save Button */}
          <div className="mt-6 pt-6 border-t border-black/[6%] flex justify-end">
            <button
              onClick={handleSave}
              type="button"
              disabled={saving}
              className="min-h-11 px-8 rounded-xl bg-[#0A5BE0] text-white text-sm font-semibold hover:bg-[#0256d3] transition inline-flex items-center gap-2 disabled:opacity-60 shadow-lg shadow-[#0A5BE0]/20 hover:shadow-[#0A5BE0]/30 hover:-translate-y-0.5"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// Komponen bantu. Setiap label terhubung ke kolomnya lewat htmlFor/id (useId), dan sakelar memakai role="switch".
function InputField({ label, value, onChange, onBlur, type = 'text', placeholder = '', icon: Icon }: any) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-foreground flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5 text-[#0A5BE0]" aria-hidden="true" />}
        {label}
      </label>
      <input
        id={id}
        type={type}
        inputMode={type === 'number' ? 'numeric' : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className="mt-1.5 w-full h-12 rounded-xl bg-black/[4%] border-2 border-black/[8%] px-4 text-base md:text-sm focus:border-[#0A5BE0]/40 focus:outline-none focus:ring-2 focus:ring-[#0A5BE0]/10 transition-all hover:border-black/[12%]"
      />
    </div>
  );
}

/**
 * Kolom daftar dipisah koma. Teks mentah disimpan di kolom ini sendiri, jadi spasi dan koma yang baru diketik
 * tidak hilang. Daftar hasil urai dikirim ke pengaturan setiap ketikan (Simpan selalu membawa isi terbaru), dan
 * teks dirapikan ("a, b") saat kolom ditinggalkan.
 */
function CommaListField({ label, value, onChange, placeholder }: { label: string; value?: string[] | null; onChange: (list: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState(() => listToText(value));
  useEffect(() => {
    // Isi dari luar (data baru dimuat) menimpa kolom hanya bila berbeda dari yang sedang diketik.
    setText((current) => (sameList(parseCommaList(current), value) ? current : listToText(value)));
  }, [value]);
  return (
    <InputField
      label={label}
      value={text}
      placeholder={placeholder}
      onChange={(v: string) => { setText(v); onChange(parseCommaList(v)); }}
      onBlur={() => setText(listToText(parseCommaList(text)))}
    />
  );
}

function SelectField({ label, value, options, onChange }: any) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-foreground">{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full h-12 rounded-xl bg-black/[4%] border-2 border-black/[8%] px-4 text-base md:text-sm focus:border-[#0A5BE0]/40 focus:outline-none focus:ring-2 focus:ring-[#0A5BE0]/10 transition-all appearance-none cursor-pointer"
      >
        {options.map((opt: any) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

function ToggleField({ label, description, checked, onChange }: any) {
  const labelId = useId();
  const descId = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-black/[4%] last:border-0">
      <div>
        <p id={labelId} className="text-sm font-medium">{label}</p>
        <p id={descId} className="text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={descId}
        onClick={() => onChange(!checked)}
        className={`relative h-11 w-14 shrink-0 rounded-full transition-colors duration-200 ${checked ? 'bg-[#0A5BE0]' : 'bg-black/[12%]'}`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-white shadow-sm transition-all duration-200 ${checked ? 'left-[calc(100%-1.75rem)]' : 'left-1'}`}
        />
      </button>
    </div>
  );
}

function AITierDisplay() {
  // The plan that picks the AI model is subscriptions.ai_model_tier (Edge Function and worker read the same column).
  const [tier, setTier] = useState<'free' | 'pro'>(isMockMode() && mockSubscription.ai_model_tier === 'pro' ? 'pro' : 'free');
  useEffect(() => {
    if (isMockMode()) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: sub } = await supabase.from('subscriptions').select('ai_model_tier').eq('user_id', user.id).maybeSingle();
      setTier(sub?.ai_model_tier === 'pro' ? 'pro' : 'free');
    })();
  }, []);
  
  const tierConfig: Record<string, { label: string; color: string; bg: string; border: string; badge: string; icon: any }> = {
    free: { 
      label: 'Gratis', 
      color: 'text-muted-foreground', 
      bg: 'bg-black/[3%]', 
      border: 'border-black/[8%]',
      badge: 'bg-black/[6%] text-muted-foreground border-black/[8%]',
      icon: Lock 
    },
    pro: { 
      label: 'Pro', 
      color: 'text-[#0A5BE0]', 
      bg: 'bg-[#0A5BE0]/5', 
      border: 'border-[#0A5BE0]/20',
      badge: 'bg-[#0A5BE0]/10 text-[#0A5BE0] border-[#0A5BE0]/20',
      icon: Zap 
    },
  };
  
  const config = tierConfig[tier];
  const TierIcon = config.icon;
  
  const currentModels = PLAN_MODELS[tier];
  
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <Brain className="h-5 w-5 text-[#0A5BE0]" aria-hidden="true" /> Model AI
      </h2>
      
      {/* Tier Badge */}
      <div className={`rounded-2xl border-2 ${config.border} ${config.bg} p-4 flex items-center gap-3`}>
        <div className={`h-10 w-10 rounded-xl grid place-items-center bg-[#0A5BE0]`}>
          <TierIcon className={`h-5 w-5 text-white`} />
        </div>
        <div>
          <p className="text-sm font-bold">Model {config.label}</p>
          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium border ${config.badge}`}>
            Aktif
          </span>
        </div>
      </div>
      
      {/* Model Distribution */}
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-[#0A5BE0]" /> Model yang dipakai (urutan percobaan)
        </h3>
        <div className="space-y-3">
          {currentModels.models.map((m, i) => (
            <div 
              key={m.name}
              className="rounded-xl border-2 border-black/[8%] bg-black/[2%] p-4 hover:border-[#0A5BE0]/30 transition-all"
              style={{ animation: `fadeInUp 0.4s ease-out ${i * 0.1}s both` }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-[#0A5BE0]/10 text-[#0A5BE0] grid place-items-center text-xs font-bold">
                    {i + 1}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.desc}</p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-[#0A5BE0]">{m.role}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Note */}
      <div className="rounded-xl bg-amber-50 border-2 border-amber-200 p-4 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800">Catatan</p>
          <p className="text-xs text-amber-700 mt-1">{currentModels.note}</p>
        </div>
      </div>
      
    </div>
  );
}

export default AutomationSettingsPage;
