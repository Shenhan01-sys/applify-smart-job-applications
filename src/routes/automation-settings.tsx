import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import { automationApi, AutomationSettings } from "@/services/automationApi";
import { mockAutomationSettings, mockSubscription } from "@/mocks/mockData";
import { 
  Loader2, Save, User, FileText, Search, Settings, Brain,
  Briefcase, MapPin, DollarSign, Clock, CheckCircle2, ToggleLeft,
  AlertCircle, Sparkles, ChevronRight, Crown, Zap, Lock, BarChart3
} from "lucide-react";
import { toast } from "sonner";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

export const Route = createFileRoute("/automation-settings")({
  beforeLoad: async () => {
    if (isMockMode()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Automation Settings — Applify" }] }),
  component: AutomationSettingsPage,
});

const tabs = [
  { id: 'personal', label: 'Personal Info', icon: User },
  { id: 'answers', label: 'Application Answers', icon: FileText },
  { id: 'search', label: 'Search Preferences', icon: Search },
  { id: 'behavior', label: 'Behavior', icon: Settings },
  { id: 'ai', label: 'AI Settings', icon: Brain },
];

function AutomationSettingsPage() {
  const [settings, setSettings] = useState<AutomationSettings>({});
  const [activeTab, setActiveTab] = useState('personal');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
    try {
      if (isMockMode()) {
        setSettings(mockAutomationSettings);
        setLoading(false);
        return;
      }
      const data = await automationApi.getSettings();
      setSettings(data);
    } catch (error) {
      toast.error('Gagal memuat settings');
      setSettings(mockAutomationSettings);
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
      toast.error('Gagal menyimpan settings');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof AutomationSettings, value: any) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-[#0367FC]" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Save Toast */}
      {showSaved && (
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-[fadeInUp_0.3s_ease-out]">
          <CheckCircle2 className="h-4 w-4" />
          <span className="text-sm font-semibold">Settings disimpan!</span>
        </div>
      )}

      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Automation Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Konfigurasi preferensi otomatisasi lamaran kerja AI kamu
        </p>
      </header>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                isActive
                  ? 'bg-[#0367FC] text-white shadow-lg shadow-[#0367FC]/20'
                  : 'bg-black/[4%] text-muted-foreground border border-black/[8%] hover:bg-black/[7%]'
              }`}
            >
              <Icon className="h-4 w-4" />
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
                <User className="h-5 w-5 text-[#0367FC]" /> Personal Information
              </h2>
              <p className="text-sm text-muted-foreground">Data ini digunakan untuk mengisi form lamaran otomatis</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputField label="First Name" value={settings.first_name || ''} onChange={(v: string) => updateField('first_name', v)} />
                <InputField label="Last Name" value={settings.last_name || ''} onChange={(v: string) => updateField('last_name', v)} />
                <InputField label="Phone Number" value={settings.phone_number || ''} onChange={(v: string) => updateField('phone_number', v)} icon={Sparkles} />
                <InputField label="Current City" value={settings.current_city || ''} onChange={(v: string) => updateField('current_city', v)} icon={MapPin} />
                <InputField label="Street" value={settings.street || ''} onChange={(v: string) => updateField('street', v)} />
                <InputField label="State" value={settings.state || ''} onChange={(v: string) => updateField('state', v)} />
                <InputField label="Zip Code" value={settings.zipcode || ''} onChange={(v: string) => updateField('zipcode', v)} />
                <InputField label="Country" value={settings.country || ''} onChange={(v: string) => updateField('country', v)} />
              </div>
            </div>
          )}

          {activeTab === 'answers' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#0367FC]" /> Application Answers
              </h2>
              <p className="text-sm text-muted-foreground">Jawaban yang sudah dikonfigurasi untuk pertanyaan umum lamaran</p>
              <div className="space-y-4">
                <InputField label="Years of Experience" value={settings.years_of_experience || ''} onChange={(v: string) => updateField('years_of_experience', v)} />
                <SelectField 
                  label="Require Visa Sponsorship" 
                  value={settings.require_visa || 'no'} 
                  options={[{value: 'no', label: 'No'}, {value: 'yes', label: 'Yes'}]}
                  onChange={(v: string) => updateField('require_visa', v)} 
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InputField label="Desired Salary (Annual)" type="number" value={settings.desired_salary?.toString() || ''} onChange={(v: string) => updateField('desired_salary', Number(v))} icon={DollarSign} />
                  <InputField label="Current CTC (Annual)" type="number" value={settings.current_ctc?.toString() || ''} onChange={(v: string) => updateField('current_ctc', Number(v))} icon={DollarSign} />
                </div>
                <InputField label="Notice Period (days)" type="number" value={settings.notice_period?.toString() || '30'} onChange={(v: string) => updateField('notice_period', Number(v))} icon={Clock} />
                <InputField label="LinkedIn URL" value={settings.linkedin_url || ''} onChange={(v: string) => updateField('linkedin_url', v)} />
                <InputField label="Website / Portfolio" value={settings.website || ''} onChange={(v: string) => updateField('website', v)} />
                <div>
                  <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Default Cover Letter</label>
                  <textarea
                    rows={6}
                    value={settings.cover_letter || ''}
                    onChange={(e) => updateField('cover_letter', e.target.value)}
                    placeholder="Template cover letter default kamu..."
                    className="mt-1.5 w-full rounded-xl bg-black/[4%] border border-black/[8%] p-4 text-sm focus:border-[#0367FC]/40 focus:outline-none focus:ring-2 focus:ring-[#0367FC]/10 transition-all resize-y"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'search' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Search className="h-5 w-5 text-[#0367FC]" /> Search Preferences
              </h2>
              <div className="space-y-4">
                <InputField 
                  label="Search Keywords (pisahkan koma)" 
                  value={settings.search_keywords?.join(', ') || ''} 
                  onChange={(v: string) => updateField('search_keywords', v.split(',').map(k => k.trim()).filter(Boolean))} 
                  placeholder="Software Engineer, React Developer, Full Stack"
                />
                <InputField 
                  label="Search Location" 
                  value={settings.search_location || ''} 
                  onChange={(v: string) => updateField('search_location', v)} 
                  placeholder="Jakarta, Indonesia atau Remote"
                  icon={MapPin}
                />
                <ToggleField 
                  label="Easy Apply Only" 
                  description="Hanya cari lowongan dengan easy apply"
                  checked={settings.easy_apply_only ?? false}
                  onChange={(v: boolean) => updateField('easy_apply_only', v)}
                />
                <InputField 
                  label="Blacklist Companies (pisahkan koma)" 
                  value={settings.blacklist_companies?.join(', ') || ''} 
                  onChange={(v: string) => updateField('blacklist_companies', v.split(',').map(k => k.trim()).filter(Boolean))} 
                />
                <InputField 
                  label="Blacklist Words (pisahkan koma)" 
                  value={settings.blacklist_words?.join(', ') || ''} 
                  onChange={(v: string) => updateField('blacklist_words', v.split(',').map(k => k.trim()).filter(Boolean))} 
                />
              </div>
            </div>
          )}

          {activeTab === 'behavior' && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Settings className="h-5 w-5 text-[#0367FC]" /> Automation Behavior
              </h2>
              <ToggleField 
                label="Pause Before Submit" 
                description="Berhenti sebelum submit setiap lamaran untuk review kamu"
                checked={settings.pause_before_submit ?? true}
                onChange={(v: boolean) => updateField('pause_before_submit', v)}
              />
              <ToggleField 
                label="Pause at Unknown Questions" 
                description="Berhenti saat AI menemukan pertanyaan yang tidak bisa dijawab"
                checked={settings.pause_at_failed_question ?? true}
                onChange={(v: boolean) => updateField('pause_at_failed_question', v)}
              />
              <ToggleField 
                label="Overwrite Previous Answers" 
                description="Selalu gunakan settings terbaru daripada jawaban yang sudah tersimpan"
                checked={settings.overwrite_previous_answers ?? false}
                onChange={(v: boolean) => updateField('overwrite_previous_answers', v)}
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
              disabled={saving}
              className="h-11 px-8 rounded-xl bg-[#0367FC] text-white text-sm font-semibold hover:bg-[#0256d3] transition inline-flex items-center gap-2 disabled:opacity-60 shadow-lg shadow-[#0367FC]/20 hover:shadow-[#0367FC]/30 hover:-translate-y-0.5"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Menyimpan...' : 'Simpan Settings'}
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// Helper components
function InputField({ label, value, onChange, type = 'text', placeholder = '', icon: Icon }: any) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5 text-[#0367FC]" />}
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full h-11 rounded-xl bg-black/[4%] border border-black/[8%] px-4 text-sm focus:border-[#0367FC]/40 focus:outline-none focus:ring-2 focus:ring-[#0367FC]/10 transition-all hover:border-black/[12%]"
      />
    </div>
  );
}

function SelectField({ label, value, options, onChange }: any) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full h-11 rounded-xl bg-black/[4%] border border-black/[8%] px-4 text-sm focus:border-[#0367FC]/40 focus:outline-none focus:ring-2 focus:ring-[#0367FC]/10 transition-all appearance-none cursor-pointer"
      >
        {options.map((opt: any) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

function ToggleField({ label, description, checked, onChange }: any) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-black/[4%] last:border-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${checked ? 'bg-[#0367FC]' : 'bg-black/[12%]'}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? 'left-[22px]' : 'left-0.5'}`}
        />
      </button>
    </div>
  );
}

function AITierDisplay() {
  const tier = isMockMode() ? mockSubscription.ai_model_tier : 'pro';
  
  const tierConfig: Record<string, { label: string; color: string; bg: string; border: string; badge: string; icon: any }> = {
    free: { 
      label: 'Free', 
      color: 'text-muted-foreground', 
      bg: 'bg-black/[3%]', 
      border: 'border-black/[8%]',
      badge: 'bg-black/[6%] text-muted-foreground border-black/[8%]',
      icon: Lock 
    },
    pro: { 
      label: 'Pro', 
      color: 'text-[#0367FC]', 
      bg: 'bg-[#0367FC]/5', 
      border: 'border-[#0367FC]/20',
      badge: 'bg-[#0367FC]/10 text-[#0367FC] border-[#0367FC]/20',
      icon: Zap 
    },
    ultimate: { 
      label: 'Ultimate', 
      color: 'text-[#D2F801]', 
      bg: 'bg-[#D2F801]/10', 
      border: 'border-[#D2F801]/30',
      badge: 'bg-[#D2F801]/20 text-[#161616] border-[#D2F801]/30',
      icon: Crown 
    },
  };
  
  const config = tierConfig[tier] || tierConfig.pro;
  const TierIcon = config.icon;
  
  const modelConfig: Record<string, { models: { name: string; pct: string; desc: string }[]; note: string }> = {
    free: {
      models: [
        { name: 'DeepSeek v4 Flash', pct: '100%', desc: 'Model cepat untuk generasi cover letter dan analisis dasar' },
      ],
      note: 'Upgrade ke Pro untuk akses model AI yang lebih powerful dengan hasil optimal.',
    },
    pro: {
      models: [
        { name: 'DeepSeek v4 Pro', pct: '60%', desc: 'Model utama untuk cover letter & analisis mendalam' },
        { name: 'DeepSeek v4 Flash', pct: '40%', desc: 'Model pendukung untuk tugas cepat & ringan' },
      ],
      note: 'AI akan otomatis memilih model terbaik untuk setiap lamaran berdasarkan kompleksitas.',
    },
    ultimate: {
      models: [
        { name: 'Claude Sonnet 4.6', pct: '60%', desc: 'Model premium untuk cover letter & strategi lanjutan' },
        { name: 'DeepSeek v4 Pro', pct: '40%', desc: 'Model andalan untuk analisis & matching akurat' },
      ],
      note: 'Akses ke model AI paling canggih untuk hasil lamaran yang optimal dan personalisasi tingkat tinggi.',
    },
  };
  
  const currentModels = modelConfig[tier] || modelConfig.pro;
  
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <Brain className="h-5 w-5 text-[#0367FC]" /> AI Settings
      </h2>
      
      {/* Tier Badge */}
      <div className={`rounded-2xl border-2 ${config.border} ${config.bg} p-4 flex items-center gap-3`}>
        <div className={`h-10 w-10 rounded-xl grid place-items-center ${tier === 'ultimate' ? 'bg-[#D2F801]' : 'bg-[#0367FC]'}`}>
          <TierIcon className={`h-5 w-5 ${tier === 'ultimate' ? 'text-[#161616]' : 'text-white'}`} />
        </div>
        <div>
          <p className="text-sm font-bold">Plan {config.label}</p>
          <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium border ${config.badge}`}>
            Aktif
          </span>
        </div>
      </div>
      
      {/* Model Distribution */}
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-[#0367FC]" /> Model Distribution
        </h3>
        <div className="space-y-3">
          {currentModels.models.map((m, i) => (
            <div 
              key={m.name}
              className="rounded-xl border border-black/[8%] bg-black/[2%] p-4 hover:border-[#0367FC]/30 transition-all"
              style={{ animation: `fadeInUp 0.4s ease-out ${i * 0.1}s both` }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-[#0367FC]/10 text-[#0367FC] grid place-items-center text-xs font-bold">
                    {i + 1}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.desc}</p>
                  </div>
                </div>
                <span className="text-sm font-mono font-bold text-[#0367FC]">{m.pct}</span>
              </div>
              <div className="mt-3 h-1.5 bg-black/[5%] rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full bg-[#0367FC] transition-all duration-700"
                  style={{ width: m.pct, animation: `fadeInUp 0.6s ease-out ${0.2 + i * 0.1}s both` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Note */}
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800">Catatan</p>
          <p className="text-xs text-amber-700 mt-1">{currentModels.note}</p>
        </div>
      </div>
      
      {/* Upgrade CTA for Free */}
      {tier === 'free' && (
        <button className="w-full h-11 rounded-xl bg-[#0367FC] text-white text-sm font-semibold hover:bg-[#0256d3] transition inline-flex items-center justify-center gap-2 shadow-lg shadow-[#0367FC]/20 hover:-translate-y-0.5">
          <Zap className="h-4 w-4" /> Upgrade ke Pro
        </button>
      )}
    </div>
  );
}

export default AutomationSettingsPage;
