import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import { automationApi } from "@/services/automationApi";
import ApprovalReviewModal from "@/components/ApprovalReviewModal";
import { mockApprovals, mockApprovalHistory } from "@/mocks/mockData";
import {
  ShieldCheck, History, ChevronRight, Clock, CheckCircle2,
  XCircle, AlertCircle, Loader2, Sparkles
} from "lucide-react";
import { toast } from "sonner";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

export const Route = createFileRoute("/approvals")({
  beforeLoad: async () => {
    if (isMockMode()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Approvals — Applify" }] }),
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
}

function ApprovalsPage() {
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>([]);
  const [history, setHistory] = useState<ApprovalRequest[]>([]);
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [tabKey, setTabKey] = useState(0);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

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

  const loadData = async () => {
    setLoading(true);
    try {
      if (isMockMode()) {
        setPendingApprovals(mockApprovals as unknown as ApprovalRequest[]);
        setHistory(mockApprovalHistory as unknown as ApprovalRequest[]);
        setLoading(false);
        return;
      }
      const [pending, hist] = await Promise.all([
        automationApi.getPendingApprovals(),
        automationApi.getApprovalHistory({ limit: 50 }),
      ]);
      setPendingApprovals(pending as unknown as ApprovalRequest[]);
      setHistory(hist as unknown as ApprovalRequest[]);
    } catch (error) {
      toast.error('Gagal memuat approvals');
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
    loadData();
    toast.success('Aplikasi disetujui!');
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
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-[#0A5BE0]" />
        </div>
      </AppShell>
    );
  }

  const displayApprovals = activeTab === 'pending' ? pendingApprovals : history;

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Application Approvals</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Review dan approve aplikasi AI sebelum dikirim ke perusahaan
        </p>
      </header>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { key: 'pending' as const, label: 'Pending', icon: ShieldCheck, count: pendingApprovals.length },
          { key: 'history' as const, label: 'History', icon: History, count: history.length },
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
              <h3 className="text-lg font-semibold mb-2">Semua sudah di-review!</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Tidak ada pending approvals. AI akan memberitahu kamu saat ada aplikasi baru yang perlu di-review.
              </p>
            </>
          ) : (
            <>
              <div className="h-12 w-12 rounded-full bg-black/[5%] grid place-items-center mx-auto mb-4">
                <History className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Belum ada history</h3>
              <p className="text-sm text-muted-foreground">
                Aplikasi yang di-approve atau di-reject akan muncul di sini.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {displayApprovals.map((request, i) => {
            const config = getStatusConfig(request.status);
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
                      <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium border ${config.text}`}>
                        <StatusIcon className="h-3 w-3" />
                        {request.status}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-black/[4%] text-muted-foreground border-2 border-black/[6%]">
                        <Sparkles className="h-3 w-3" />
                        {request.platform}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{request.company}</p>
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Expires: {new Date(request.expires_at).toLocaleDateString('id-ID')}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <History className="h-3 w-3" />
                        Created: {new Date(request.created_at).toLocaleDateString('id-ID')}
                      </span>
                    </div>
                    {request.rejection_reason && (
                      <p className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded-lg border-2 border-red-100">
                        Alasan: {request.rejection_reason}
                      </p>
                    )}
                  </div>
                  {activeTab === 'pending' && (
                    <button
                      onClick={() => handleReview(request)}
                      className="h-9 px-4 rounded-lg bg-[#0A5BE0] text-white text-xs font-semibold hover:bg-[#0256d3] transition inline-flex items-center gap-1.5 shrink-0 group-hover:shadow-md hover:-translate-y-0.5"
                    >
                      Review <ChevronRight className="h-3 w-3" />
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
