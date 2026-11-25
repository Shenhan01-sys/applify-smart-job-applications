import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import { automationApi } from "@/services/automationApi";
import ApprovalReviewModal from "@/components/ApprovalReviewModal";
import EmailApplyPanel from "@/components/EmailApplyPanel";
import AgentApplyStatus from "@/components/AgentApplyStatus";
import AgentQuestions from "@/components/AgentQuestions";
import AgentSecurityCode from "@/components/AgentSecurityCode";
import AgentManualSubmit from "@/components/AgentManualSubmit";
import ExtensionConsent from "@/components/ExtensionConsent";
import LockedClaimBanner from "@/components/LockedClaimBanner";
import { isAgentApplyActive } from "@/lib/agentApplyStatus";
import { extensionConsentState } from "@/lib/extensionConsent";
import { pendingEmptyState } from "@/lib/approvalsEmpty";
import { AGENT_POLL_MS, CODE_POLL_MS, pollIntervalMs } from "@/lib/securityCode";
import { emptyEmailApplyData, loadEmailApplyData, type EmailApplyData } from "@/services/emailApplyService";
import { platformLabel } from "@/lib/platforms";
import { splitApprovalTabs, type ApprovalStage } from "@/lib/approvalTabs";
import { describeApiError } from "@/lib/apiErrors";
import { ErrorState } from "@/components/ErrorState";
import { mockApprovals, mockApprovalHistory } from "@/mocks/mockData";
import {
  ShieldCheck, History, ChevronRight, Clock, CheckCircle2,
  XCircle, AlertCircle, Loader2, Sparkles, type LucideIcon
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
  resume_url?: string | null;
}

type StageStyle = { icon: LucideIcon; text: string };

const AMBER = 'bg-amber-100 text-amber-800 border-amber-200';
const GREEN = 'bg-green-100 text-green-800 border-green-200';
const RED = 'bg-red-100 text-red-800 border-red-200';
const GRAY = 'bg-gray-100 text-gray-800 border-gray-200';
const BLUE = 'bg-blue-100 text-blue-800 border-blue-200';

/** Ikon dan warna lencana per tahap (lib/approvalTabs.ts). Labelnya datang dari placement.label. */
const STAGE_STYLE: Record<ApprovalStage, StageStyle> = {
  review:          { icon: Clock,        text: AMBER },
  checking:        { icon: AlertCircle,  text: GRAY },
  not_started:     { icon: Clock,        text: GRAY },
  processing:      { icon: Loader2,      text: BLUE },
  needs_action:    { icon: AlertCircle,  text: AMBER },
  filled_not_sent: { icon: AlertCircle,  text: AMBER },
  unverified:      { icon: AlertCircle,  text: AMBER },
  test_mode:       { icon: AlertCircle,  text: GRAY },
  failed_retry:    { icon: XCircle,      text: RED },
  sent:            { icon: CheckCircle2, text: GREEN },
  rejected:        { icon: XCircle,      text: RED },
  expired:         { icon: AlertCircle,  text: GRAY },
  replaced:        { icon: AlertCircle,  text: GRAY },
};

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
  // Persetujuan yang jawaban approve-nya meminta izin ekstensi (lamaran belum diantre). Hanya ingatan halaman ini:
  // sesudah dimuat ulang, blok izin tampil karena persetujuan itu belum punya tugas agen.
  const [consentIds, setConsentIds] = useState<Set<string>>(() => new Set());

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

  // While the agent is still working on an approved application, refresh its status every 15 s, or every 5 s
  // while it waits for the security code (the code window is short and the next log row should show quickly).
  const agentRows = Object.values(emailData.agent);
  const agentActive = agentRows.some((r) => isAgentApplyActive(r));
  const awaitingCode = pollIntervalMs(agentRows) === CODE_POLL_MS;
  useEffect(() => {
    if (!agentActive || isMockMode()) return;
    const t = window.setInterval(() => {
      loadEmailApplyData(history).then(setEmailData).catch(() => {});
    }, awaitingCode ? CODE_POLL_MS : AGENT_POLL_MS);
    return () => window.clearInterval(t);
  }, [agentActive, awaitingCode, history]);

  // Sesudah backend menerima kode keamanan: baca status agen sekarang juga, tanpa menunggu putaran berikutnya.
  const handleCodeSent = () => {
    if (isMockMode()) return;
    loadEmailApplyData(history).then(setEmailData).catch(() => {});
  };

  // Sesudah pengguna menjawab pertanyaan agen dan backend menerima tugas ulang: tandai tugasnya menunggu
  // (supaya status berubah dan polling 15 detik jalan), lalu baca status sebenarnya dari database.
  const handleAgentRerun = (approvalId: string) => {
    setEmailData((d) => ({ ...d, agent: { ...d.agent, [approvalId]: { ...d.agent[approvalId], status: 'pending', error_message: null } } }));
  };

  // Sesudah pengguna mengizinkan Ekstensi Browser dan backend mengantre tugasnya: tandai menunggu ekstensi (status berubah,
  // polling 15 detik jalan), lalu baca status sebenarnya dari database.
  const handleConsentGranted = (approvalId: string) => {
    setConsentIds((ids) => {
      if (!ids.has(approvalId)) return ids;
      const next = new Set(ids);
      next.delete(approvalId);
      return next;
    });
    setEmailData((d) => ({ ...d, agent: { ...d.agent, [approvalId]: { status: 'pending', job_type: 'extension_apply', error_message: null, fields_filled: null } } }));
    if (isMockMode()) return;
    loadEmailApplyData(history).then(setEmailData).catch(() => {});
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

  const handleApproved = (result?: { consentRequired: boolean }) => {
    const approvedId = selectedRequest?.id;
    setModalOpen(false);
    setSelectedRequest(null);
    // Situs yang perlu login: lamaran belum diantre. Persetujuannya tetap di tab Menunggu (belum terkirim),
    // dan blok "Izinkan ekstensi" langsung terlihat di kartunya.
    if (result?.consentRequired && approvedId) {
      setConsentIds((ids) => new Set(ids).add(approvedId));
    }
    loadData(); // the modal already confirmed the approval with a toast
  };

  const handleRejected = () => {
    setModalOpen(false);
    setSelectedRequest(null);
    loadData();
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

  // Menunggu memuat yang belum selesai (termasuk yang sudah disetujui tetapi belum terkirim). Riwayat hanya yang terkirim atau ditutup.
  const tabs = splitApprovalTabs([...pendingApprovals, ...history], (a) => ({
    agent: emailData.agent[a.id],
    sent: emailData.used.has(a.id),
    emailJob: emailData.jobs[a.id],
    testMode: emailData.testMode.has(a.id),
    agentKnown: emailData.agentKnown,
    consentRequired: consentIds.has(a.id),
  }));
  const displayApprovals = activeTab === 'pending' ? tabs.pending : tabs.history;

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
          { key: 'pending' as const, label: 'Menunggu', icon: ShieldCheck, count: tabs.pending.length },
          { key: 'history' as const, label: 'Riwayat', icon: History, count: tabs.history.length },
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
          {activeTab === 'pending' ? (() => {
            // Belum pernah ada persetujuan: bukan "semua sudah diperiksa", karena belum ada yang diperiksa.
            const empty = pendingEmptyState(tabs.history.length);
            return (
              <>
                <div className={`h-12 w-12 rounded-full grid place-items-center mx-auto mb-4 ${empty.kind === 'all_checked' ? 'bg-green-100' : 'bg-black/[5%]'}`}>
                  {empty.kind === 'all_checked'
                    ? <CheckCircle2 className="h-6 w-6 text-green-500" />
                    : <ShieldCheck className="h-6 w-6 text-muted-foreground" />}
                </div>
                <h3 className="text-lg font-semibold mb-2" data-testid="pending-empty-title">{empty.title}</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">{empty.body}</p>
                <Link to="/jobs" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#0A5BE0] px-5 text-sm font-semibold text-white hover:bg-[#0256d3] transition">Cari lowongan</Link>
              </>
            );
          })() : (
            <>
              <div className="h-12 w-12 rounded-full bg-black/[5%] grid place-items-center mx-auto mb-4">
                <History className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Belum ada riwayat</h3>
              <p className="text-sm text-muted-foreground">
                Lamaran yang sudah terkirim, kamu tolak, atau kedaluwarsa akan muncul di sini.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {displayApprovals.map(({ item: request, placement }, i) => {
            const config = STAGE_STYLE[placement.stage];
            const StatusIcon = config.icon;
            const approved = request.status === 'approved';
            const consent = approved
              ? extensionConsentState({
                  approvalStatus: request.status,
                  platform: request.platform,
                  jobUrl: emailData.jobUrls[request.id],
                  row: emailData.agent[request.id],
                  agentKnown: emailData.agentKnown,
                  submitted: emailData.used.has(request.id),
                  consentRequired: consentIds.has(request.id),
                })
              : { show: false as const };
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
                        <StatusIcon className={`h-3 w-3${placement.stage === 'processing' ? ' animate-spin' : ''}`} aria-hidden="true" />
                        {placement.label}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-black/[4%] text-muted-foreground border-2 border-black/[6%]">
                        <Sparkles className="h-3 w-3" />
                        {platformLabel(request.platform)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{request.company}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                      {(placement.tab === 'pending' || placement.stage === 'expired') && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Berlaku sampai {new Date(request.expires_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      {placement.tab === 'history' && request.reviewed_at && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Ditinjau {new Date(request.reviewed_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      )}
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
                    {approved && (
                      <AgentApplyStatus row={emailData.agent[request.id]} jobUrl={emailData.jobUrls[request.id]} consentShown={consent.show && !!consent.reason} />
                    )}
                    {consent.show && consent.reason && (
                      <ExtensionConsent approvalId={request.id} reason={consent.reason} onGranted={handleConsentGranted} />
                    )}
                    {approved && (
                      <AgentSecurityCode approvalId={request.id} row={emailData.agent[request.id]} onRerun={handleAgentRerun} onCodeSent={handleCodeSent} />
                    )}
                    {approved && (
                      <AgentQuestions approvalId={request.id} row={emailData.agent[request.id]} onRerun={handleAgentRerun} />
                    )}
                    {approved && (
                      <AgentManualSubmit
                        approvalId={request.id}
                        row={emailData.agent[request.id]}
                        jobUrl={emailData.jobUrls[request.id]}
                        coverLetter={request.cover_letter ?? null}
                        onRerun={handleAgentRerun}
                      />
                    )}
                    {approved && (
                      <LockedClaimBanner approvalId={request.id} row={emailData.agent[request.id]} onResolved={loadData} />
                    )}
                    {approved && (() => {
                      const agentRow = emailData.agent[request.id];
                      const blockedByAgent =
                        agentRow?.claim_state === 'locked_stuck'
                          ? 'locked_stuck' as const
                          : agentRow?.log_status === 'submit_unverified' || agentRow?.submit_blocked === 'prior_unverified'
                            ? 'submit_unverified' as const
                            : null;
                      return (
                        <EmailApplyPanel
                          approval={request}
                          gmailConnected={emailData.gmail}
                          used={emailData.used.has(request.id)}
                          job={emailData.jobs[request.id]}
                          suggestions={emailData.suggestions[request.id]}
                          testMode={emailData.testMode.has(request.id)}
                          plan={emailData.attachmentPlans[request.id]}
                          sent={emailData.sentAttachments[request.id]}
                          agentBlockedReason={blockedByAgent}
                          onQueued={(id) =>
                            setEmailData((d) => ({ ...d, jobs: { ...d.jobs, [id]: { status: 'pending', error_message: null } } }))
                          }
                        />
                      );
                    })()}
                  </div>
                  {placement.stage === 'review' && (
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
