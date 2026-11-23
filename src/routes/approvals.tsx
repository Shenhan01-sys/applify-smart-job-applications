import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import { automationApi } from "@/services/automationApi";
import ApprovalReviewModal from "@/components/ApprovalReviewModal";
import EmailApplyPanel from "@/components/EmailApplyPanel";
import AgentApplyStatus from "@/components/AgentApplyStatus";
import AgentQuestions from "@/components/AgentQuestions";
import { isAgentApplyActive } from "@/lib/agentApplyStatus";
import { emptyEmailApplyData, loadEmailApplyData, type EmailApplyData } from "@/services/emailApplyService";
import { platformLabel } from "@/lib/platforms";
import { approvalStatusLabel, effectiveApprovalStatus } from "@/lib/statusLabels";
import { describeApiError } from "@/lib/apiErrors";
import { ErrorState } from "@/components/ErrorState";
import { mockApprovals, mockApprovalHistory } from "@/mocks/mockData";
import {
  ShieldCheck, History, ChevronRight, Clock, CheckCircle2,
  XCircle, AlertCircle, Loader2, Sparkles
} from "lucide-react";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

export const Route = createFileRoute("/approvals")({
  beforeLoad: async () => {
    if (isMockMode()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Persetujuan Lamaran — Applify" }] }),
  component: ApprovalsPage,
});

interface ApprovalRequest {
  id: string;
  job_title: string;
  company: string;
  platform: string;
  status: string;
  expires_at: string;
  created_at: string;
  reviewed_at?: string;
  rejection_reason?: string;
  job_id?: string | null;
  application_id?: string | null;
  cover_letter?: string | null;
}

function ApprovalsPage() {
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>([]);
  const [history, setHistory] = useState<ApprovalRequest[]>([]);
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [tabKey, setTabKey] = useState(0);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  // Data for the "Kirim lewat Email" action on approved history rows.
  const [emailData, setEmailData] = useState<EmailApplyData>(emptyEmailApplyData());

  const tabOrder: ('pending' | 'history')[] = ['pending', 'history'];
  const handleTabChange = (tab: 'pending' | 'history') => {
    const currentIndex = tabOrder.indexOf(activeTab);
    const newIndex = tabOrder.indexOf(tab);
    setDirection(newIndex > currentIndex ? 'next' : 'prev');
    setActiveTab(tab);
    setTabKey(k => k + 1);
  };

  useEffect(() => {
    loadData();
  }, []);

  // While the agent is still working on an approved application, refresh its status every 15 s.
  const agentActive = Object.values(emailData.agent).some(isAgentApplyActive);
  useEffect(() => {
    if (!agentActive || isMockMode()) return;
    const t = window.setInterval(() => {
      loadEmailApplyData(history).then(setEmailData).catch(() => {});
    }, 15_000);
    return () => window.clearInterval(t);
  }, [agentActive, history]);

  // Sesudah pengguna menjawab pertanyaan agen dan backend menerima tugas ulang: tandai tugasnya menunggu
  // (supaya status berubah dan polling 15 detik jalan), lalu baca status sebenarnya dari database.
  const handleAgentRerun = (approvalId: string) => {
    setEmailData((d) => ({ ...d, agent: { ...d.agent, [approvalId]: { ...d.agent[approvalId], status: 'pending', error_message: null } } }));
  };

  const loadData = async () => {
    setLoading(true);
    setLoadError("");
    try {
      if (isMockMode()) {
        setPendingApprovals(mockApprovals as unknown as ApprovalRequest[]);
        setHistory(mockApprovalHistory as unknown as ApprovalRequest[]);
        loadEmailApplyData(mockApprovalHistory as unknown as ApprovalRequest[]).then(setEmailData).catch(() => {});
        setLoading(false);
        return;
      }
      const [pending, hist] = await Promise.all([
        automationApi.getPendingApprovals(),
        automationApi.getApprovalHistory({ limit: 50 }),
      ]);
      setPendingApprovals(pending as unknown as ApprovalRequest[]);
      setHistory(hist as unknown as ApprovalRequest[]);
      // Best effort: without it the email action just stays disabled with an explanation.
      loadEmailApplyData(hist as unknown as ApprovalRequest[]).then(setEmailData).catch((err) => {
        console.warn('[approvals] email action data unavailable:', err);
        setEmailData(emptyEmailApplyData());
      });
    } catch (error) {
      // Tanpa data contoh: galat ditampilkan di halaman dengan tombol "Coba lagi".
      setPendingApprovals([]);
      setHistory([]);
      setLoadError(describeApiError(error, 'Daftar persetujuan belum bisa dimuat.'));
    } finally {
      setLoading(false);
    }
  };

  const handleReview = (request: ApprovalRequest) => {
    setSelectedRequest(request);
    setModalOpen(true);
  };

  const handleApproved = () => {
    setModalOpen(false);
    setSelectedRequest(null);
    loadData(); // the modal already confirmed the approval with a toast
  };

  const handleRejected = () => {
    setModalOpen(false);
    setSelectedRequest(null);
    loadData();
  };

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { icon: any; color: string; bg: string; border: string; text: string }> = {
      pending:   { icon: Clock,       color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200', text: 'bg-amber-100 text-amber-800 border-amber-200' },
      approved:  { icon: CheckCircle2, color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-200', text: 'bg-green-100 text-green-800 border-green-200' },
      rejected:  { icon: XCircle,      color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200',   text: 'bg-red-100 text-red-800 border-red-200' },
      expired:   { icon: AlertCircle,  color: 'text-gray-600',   bg: 'bg-gray-50',   border: 'border-gray-200',  text: 'bg-gray-100 text-gray-800 border-gray-200' },
    };
    return configs[status] || configs.pending;
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-[60vh]" role="status" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-[#0A5BE0]" aria-hidden="true" />
          <span className="ml-3 text-muted-foreground">Memuat daftar persetujuan...</span>
        </div>
      </AppShell>
    );
  }

  if (loadError) {
    return (
      <AppShell>
        <header className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold">Persetujuan Lamaran</h1>
        </header>
        <ErrorState title="Daftar persetujuan belum bisa dimuat" message={loadError} onRetry={loadData} />
      </AppShell>
    );
  }

  const displayApprovals = activeTab === 'pending' ? pendingApprovals : history;

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Persetujuan Lamaran</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Periksa draf lamaran yang disiapkan AI. Tidak ada lamaran yang dikirim sebelum kamu menyetujuinya di sini.
        </p>
      </header>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { key: 'pending' as const, label: 'Menunggu', icon: ShieldCheck, count: pendingApprovals.length },
          { key: 'history' as const, label: 'Riwayat', icon: History, count: history.length },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-[#0A5BE0] text-white shadow-lg shadow-[#0A5BE0]/20'
                  : 'bg-black/[4%] text-muted-foreground border-2 border-black/[8%] hover:bg-black/[7%]'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20' : 'bg-black/[6%]'}`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div key={tabKey} className={direction === 'next' ? 'animate-slide-right' : 'animate-slide-left'}>
      {displayApprovals.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border-2 border-dashed border-black/[8%]">
          {activeTab === 'pending' ? (
            <>
              <div className="h-12 w-12 rounded-full bg-green-100 grid place-items-center mx-auto mb-4">
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Tidak ada yang perlu disetujui</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Semua permintaan sudah kamu periksa. Buat draf lamaran dari halaman Lowongan (tombol "Ajukan ke Persetujuan"); permintaan baru muncul di sini.
              </p>
              <Link to="/jobs" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#0A5BE0] px-5 text-sm font-semibold text-white hover:bg-[#0256d3] transition">Cari lowongan</Link>
            </>
          ) : (
            <>
              <div className="h-12 w-12 rounded-full bg-black/[5%] grid place-items-center mx-auto mb-4">
                <History className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Belum ada riwayat</h3>
              <p className="text-sm text-muted-foreground">
                Lamaran yang sudah kamu setujui atau tolak akan muncul di sini.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {displayApprovals.map((request, i) => {
            const shownStatus = effectiveApprovalStatus(request.status, request.expires_at);
            const config = getStatusConfig(shownStatus);
            const StatusIcon = config.icon;
            return (
              <div
                key={request.id}
                className="rounded-2xl border-2 border-[#999999] bg-white p-4 hover:border-[#0A5BE0]/40 hover:shadow-md transition-all duration-200 group"
                style={{ animation: `fadeInUp 0.35s ease-out ${i * 0.05}s both` }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold truncate">{request.job_title}</h3>
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium border ${config.text}`}>
                        <StatusIcon className="h-3 w-3" />
                        {approvalStatusLabel(shownStatus)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-black/[4%] text-muted-foreground border-2 border-black/[6%]">
                        <Sparkles className="h-3 w-3" />
                        {platformLabel(request.platform)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{request.company}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Berlaku sampai {new Date(request.expires_at).toLocaleDateString('id-ID')}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <History className="h-3 w-3" />
                        Dibuat {new Date(request.created_at).toLocaleDateString('id-ID')}
                      </span>
                    </div>
                    {request.rejection_reason && (
                      <p className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded-lg border-2 border-red-100">
                        Alasan: {request.rejection_reason}
                      </p>
                    )}
                    {activeTab === 'history' && request.status === 'approved' && (
                      <AgentApplyStatus row={emailData.agent[request.id]} />
                    )}
                    {activeTab === 'history' && request.status === 'approved' && (
                      <AgentQuestions approvalId={request.id} row={emailData.agent[request.id]} onRerun={handleAgentRerun} />
                    )}
                    {activeTab === 'history' && request.status === 'approved' && (
                      <EmailApplyPanel
                        approval={request}
                        gmailConnected={emailData.gmail}
                        used={emailData.used.has(request.id)}
                        job={emailData.jobs[request.id]}
                        suggestions={emailData.suggestions[request.id]}
                        onQueued={(id) =>
                          setEmailData((d) => ({ ...d, jobs: { ...d.jobs, [id]: { status: 'pending', error_message: null } } }))
                        }
                      />
                    )}
                  </div>
                  {activeTab === 'pending' && (
                    <button
                      onClick={() => handleReview(request)}
                      className="min-h-11 px-4 rounded-lg bg-[#0A5BE0] text-white text-sm font-semibold hover:bg-[#0256d3] transition inline-flex items-center gap-1.5 shrink-0 group-hover:shadow-md hover:-translate-y-0.5"
                    >
                      Periksa <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>

      {selectedRequest && (
        <ApprovalReviewModal
          request={selectedRequest as any}
          open={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setSelectedRequest(null);
          }}
          onApproved={handleApproved}
          onRejected={handleRejected}
        />
      )}
    </AppShell>
  );
}

export default ApprovalsPage;
