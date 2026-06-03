import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import { useLinkedInSession } from "@/hooks/useAutomation";
import { mockLinkedInStatus } from "@/mocks/mockData";
import { 
  Shield, ShieldCheck, ShieldAlert, RefreshCw, Clock, 
  CheckCircle2, AlertCircle, Loader2, Linkedin, BookOpen,
  Lock, KeyRound, Trash2, Sparkles
} from "lucide-react";
import { toast } from "sonner";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

export const Route = createFileRoute("/linkedin-session")({
  beforeLoad: async () => {
    if (isMockMode()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "LinkedIn Session — Applify" }] }),
  component: LinkedInSessionPage,
});

function LinkedInSessionPage() {
  const { sessionStatus, loading: hookLoading, checkSession, importSession, verifySession } = useLinkedInSession();
  const [cookiesJson, setCookiesJson] = useState('');
  const [importing, setImporting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [activeTab, setActiveTab] = useState<'manual' | 'guide'>('manual');
  const [tabKey, setTabKey] = useState(0);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const [status, setStatus] = useState(sessionStatus);

  const tabOrder: ('manual' | 'guide')[] = ['manual', 'guide'];
  const handleTabChange = (tab: 'manual' | 'guide') => {
    const currentIndex = tabOrder.indexOf(activeTab);
    const newIndex = tabOrder.indexOf(tab);
    setDirection(newIndex > currentIndex ? 'next' : 'prev');
    setActiveTab(tab);
    setTabKey(k => k + 1);
  };

  useEffect(() => {
    if (isMockMode()) {
      setStatus(mockLinkedInStatus);
      return;
    }
    setStatus(sessionStatus);
  }, [sessionStatus]);

  const handleImport = async () => {
    if (!cookiesJson.trim()) {
      toast.error('Harap paste cookies JSON kamu');
      return;
    }
    try {
      setImporting(true);
      const cookies = JSON.parse(cookiesJson);
      if (isMockMode()) {
        setStatus({ hasSession: true, isValid: true, lastUsed: new Date().toISOString(), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });
        toast.success('Session berhasil di-import!');
      } else {
        await importSession(cookies);
      }
      setCookiesJson('');
    } catch (error) {
      toast.error('Format JSON tidak valid. Periksa cookies kamu.');
    } finally {
      setImporting(false);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      if (isMockMode()) {
        await new Promise(r => setTimeout(r, 1500));
        toast.success('Session valid!');
      } else {
        await verifySession();
      }
    } catch (error) {
      toast.error('Gagal verifikasi session');
    } finally {
      setVerifying(false);
    }
  };

  const getSessionConfig = () => {
    if (!status?.hasSession) {
      return { 
        icon: ShieldAlert, 
        color: 'text-red-500', 
        bg: 'bg-red-50', 
        border: 'border-red-200',
        badge: 'bg-red-100 text-red-800 border-red-200',
        text: 'Tidak Ada Session' 
      };
    }
    if (status?.isValid) {
      return { 
        icon: ShieldCheck, 
        color: 'text-green-500', 
        bg: 'bg-green-50', 
        border: 'border-green-200',
        badge: 'bg-green-100 text-green-800 border-green-200',
        text: 'Aktif' 
      };
    }
    return { 
      icon: Shield, 
      color: 'text-amber-500', 
      bg: 'bg-amber-50', 
      border: 'border-amber-200',
      badge: 'bg-amber-100 text-amber-800 border-amber-200',
      text: 'Expired' 
    };
  };

  const config = getSessionConfig();
  const StatusIcon = config.icon;

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <Linkedin className="h-7 w-7 text-[#0A66C2]" /> LinkedIn Session
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Kelola browser session LinkedIn untuk otomatisasi lamaran kerja
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* LEFT: Session Management */}
        <div className="space-y-5">
          {/* Status Card */}
          <div className={`rounded-2xl border-2 ${config.border} ${config.bg} p-5 transition-all duration-300`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`h-12 w-12 rounded-xl ${config.bg} grid place-items-center border-2 ${config.border}`}>
                  <StatusIcon className={`h-6 w-6 ${config.color}`} />
                </div>
                <div>
                  <p className="text-sm font-bold">Session Status</p>
                  <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium border ${config.badge}`}>
                    {config.text}
                  </span>
                </div>
              </div>
              {status?.hasSession && (
                <div className="flex gap-2">
                  <button
                    onClick={handleVerify}
                    disabled={verifying}
                    className="h-9 px-3 rounded-lg border-2 border-black/[8%] bg-white text-xs font-medium hover:bg-black/[4%] transition inline-flex items-center gap-1.5"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${verifying ? 'animate-spin' : ''}`} />
                    {verifying ? 'Verifying...' : 'Verify'}
                  </button>
                </div>
            )}
            </div>
          </div>

            {status?.hasSession ? (
              <div className="mt-4 pt-4 border-t border-black/[6%] space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Used</span>
                  <span className="font-medium">{status.lastUsed ? new Date(status.lastUsed).toLocaleDateString('id-ID') : 'Never'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expires At</span>
                  <span className="font-medium">{status.expiresAt ? new Date(status.expiresAt).toLocaleDateString('id-ID') : 'Unknown'}</span>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-2 text-amber-700 bg-amber-100 p-3 rounded-xl text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p className="text-xs">Tidak ada session LinkedIn aktif. Import cookies di bawah untuk mengaktifkan otomatisasi.</p>
              </div>
            )}
          </div>

          {/* Import Tabs */}
          <div className="glass rounded-2xl p-5">
            <div className="flex gap-2 mb-4">
              {[
                { key: 'manual' as const, label: 'Manual Import', icon: KeyRound },
                { key: 'guide' as const, label: 'Panduan', icon: BookOpen },
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    onClick={() => handleTabChange(tab.key)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                      activeTab === tab.key
                        ? 'bg-[#0367FC] text-white shadow-lg shadow-[#0367FC]/20'
                        : 'bg-black/[4%] text-muted-foreground border-2 border-black/[8%] hover:bg-black/[7%]'
                    }`}
                  >
                    <Icon className="h-4 w-4" /> {tab.label}
                  </button>
                );
              })}
            </div>

            <div key={tabKey} className={direction === 'next' ? 'animate-slide-right' : 'animate-slide-left'}>
            {activeTab === 'manual' && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Cookies JSON</label>
                  <textarea
                    rows={6}
                    className="mt-1.5 w-full rounded-xl bg-black/[4%] border-2 border-black/[8%] p-3 font-mono text-xs focus:border-[#0367FC]/40 focus:outline-none focus:ring-2 focus:ring-[#0367FC]/10 transition-all resize-y"
                    placeholder={`Paste cookies di sini dalam format JSON:\n[\n  {"name": "li_at", "value": "...", "domain": ".linkedin.com"}\n]`}
                    value={cookiesJson}
                    onChange={(e) => setCookiesJson(e.target.value)}
                  />
                </div>
                <button
                  onClick={handleImport}
                  disabled={importing || !cookiesJson.trim()}
                  className="h-10 px-5 rounded-xl bg-[#0367FC] text-white text-sm font-semibold hover:bg-[#0256d3] transition inline-flex items-center gap-2 disabled:opacity-60 shadow-lg shadow-[#0367FC]/20 hover:shadow-[#0367FC]/30 hover:-translate-y-0.5"
                >
                  {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  {importing ? 'Importing...' : 'Import Session'}
                </button>
              </div>
            )}

            {activeTab === 'guide' && (
              <div className="space-y-3 text-sm">
                <h4 className="font-semibold">Cara export cookies LinkedIn:</h4>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>Buka LinkedIn di browser dan login ke akun kamu</li>
                  <li>Buka Developer Tools (F12 atau Ctrl+Shift+I)</li>
                  <li>Pergi ke tab Application → Cookies → https://www.linkedin.com</li>
                  <li>Cari dan copy cookies: <code>li_at</code>, <code>JSESSIONID</code>, <code>bcookie</code></li>
                  <li>Paste dalam format JSON di tab Manual Import</li>
                </ol>
                <div className="mt-3 p-3 rounded-xl bg-blue-50 border-2 border-blue-200 text-blue-800">
                  <p className="font-medium text-xs">Catatan Keamanan</p>
                  <p className="text-[11px] mt-1 opacity-80">
                    Cookies dienkripsi sebelum disimpan dan tidak pernah dibagikan. Kamu bisa mencabut akses kapan saja dengan logout dari LinkedIn di browser.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Security Info */}
        <div className="space-y-5">
          <div className="glass rounded-2xl p-5">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Lock className="h-5 w-5 text-[#0367FC]" /> Informasi Keamanan
            </h2>
            <div className="space-y-4">
              {[
                { icon: CheckCircle2, color: 'text-green-500', title: 'Encrypted Storage', desc: 'Session cookies dienkripsi dengan AES-256 sebelum disimpan' },
                { icon: Shield, color: 'text-[#0367FC]', title: 'User Control', desc: 'Kamu bisa mencabut akses kapan saja dengan logout dari LinkedIn' },
                { icon: Clock, color: 'text-amber-500', title: 'Session Expiry', desc: 'Session expired setelah 30 hari dan harus di-import ulang' },
                { icon: Trash2, color: 'text-red-500', title: 'One-Click Revoke', desc: 'Hapus session kapan saja dari halaman ini' },
              ].map((item, i) => {
                const Icon = item.icon;
                return (
                  <div 
                    key={i} 
                    className="flex items-start gap-3 p-3 rounded-xl bg-black/[2%] border-2 border-black/[6%] hover:border-black/[10%] transition-all"
                    style={{ animation: `fadeInUp 0.35s ease-out ${i * 0.08}s both` }}
                  >
                    <Icon className={`h-5 w-5 ${item.color} shrink-0 mt-0.5`} />
                    <div>
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Platform Tips */}
          <div className="glass rounded-2xl p-5">
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" /> Tips
            </h2>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>• Jangan share cookies kamu dengan siapa pun</p>
              <p>• Import ulang jika mendapat error saat apply</p>
              <p>• Pastikan kamu login dengan akun LinkedIn yang benar</p>
              <p>• Verifikasi session secara berkala untuk memastikan valid</p>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default LinkedInSessionPage;
