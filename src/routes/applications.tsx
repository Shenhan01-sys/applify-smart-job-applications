import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import { aiApplicationService, APPLICATION_STATUSES, type AIApplicationData, type ApplicationStatus } from "@/services/aiApplicationService";
import { mockAIApplications } from "@/mocks/mockData";
import { QueuePanel } from "@/components/QueuePanel";
import { ErrorState } from "@/components/ErrorState";
import { describeError } from "@/lib/authErrors";
import { FILL_YOURSELF_LABEL, NO_FIELDS_FILLED_TEXT, applicationStatusLabel } from "@/lib/statusLabels";
import { canRequestApproval } from "@/lib/draftApproval";
import { groupByStatus } from "@/lib/dashboardStats";
import { highlightedSkills, profileSkillList } from "@/lib/matchScore";
import { profileService } from "@/services/profileService";
import { duplicateApplications, duplicateLabel, type DuplicateInfo } from "@/lib/applicationCards";
import { PERSONAL_DATA_LINK_LABEL, personalDataHint } from "@/lib/personalData";
import { attemptForApplication, fieldsFilledByQueueJob, needsFillYourself, type ApplyAttempt, type FormGaps } from "@/lib/formGaps";
import { getApplyState } from "@/services/formGapService";
import AgentEvidence from "@/components/AgentEvidence";
import { describeLogOutcome } from "@/lib/agentApplyStatus";
import { hasAgentEvidence, type AgentLogFacts } from "@/lib/agentEvidence";
import { awaitingCodeState } from "@/lib/securityCode";
import { questionsToAnswer } from "@/lib/formQuestions";
import { describeApprovalError, getPendingApprovalFor, requestApprovalForDraft } from "@/services/approvalService";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { DndContext, DragOverlay, MouseSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import {
  BOARD_MOUSE_CONSTRAINT,
  BOARD_ROLE_DESCRIPTION,
  BOARD_SCREEN_READER_INSTRUCTIONS,
  BOARD_TOUCH_CONSTRAINT,
  SUBMITTED_CONFIRM_TEXT,
  boardAnnouncements,
  boardCollisionDetection,
  dragEndMove,
  dropNeedsConfirmation,
} from "@/lib/boardDnd";
import {
  LayoutGrid,
  List,
  Bot,
  Clock,
  CheckCircle2,
  Send,
  Mail,
  Loader2,
  FileText,
  Zap,
  AlertCircle,
  X,
  GripVertical,
  Search,
  ShieldCheck,
} from "lucide-react";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

export const Route = createFileRoute("/applications")({
  beforeLoad: async () => {
    if (isMockMode()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Lamaran Saya — Applify" }] }),
  component: AppsPage,
});

// Kode status tetap bahasa Inggris di database; hanya label tampilannya yang Indonesia (statusLabels.ts).
const statusConfig: Record<string, { color: string; icon: any }> = {
  draft: { color: "bg-[#6B6B6B] text-white", icon: FileText },
  ready: { color: "bg-[#0A5BE0] text-white", icon: CheckCircle2 },
  submitted: { color: "bg-[#D2F801] text-[#16150F]", icon: Send },
  follow_up: { color: "bg-[#B45309] text-white", icon: Mail },
  responded: { color: "bg-green-700 text-white", icon: CheckCircle2 },
  closed: { color: "bg-[#6B6B6B] text-white", icon: X },
};

const daysAgo = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
const jobOf = (app: AIApplicationData) => (app as any).jobs as { title?: string; company?: string; platform_source?: string | null } | undefined;

// Persetujuan untuk draf yang dibuka di jendela detail: belum diperiksa, sedang diperiksa, belum ada, sudah menunggu,
// atau antreannya tidak bisa diperiksa (tombol tetap ada; pengajuan memeriksa lagi dan melaporkan galatnya sendiri).
type ApprovalUi = { state: "idle" } | { state: "checking" } | { state: "none" } | { state: "pending"; id: string } | { state: "unknown" };

// Lencana untuk lamaran "Siap dikirim" yang formulirnya masih punya isian wajib kosong (dari log percobaan agen).
function FormGapBadge({ gaps }: { gaps: FormGaps }) {
  const detail = `${gaps.remaining.length} isian wajib masih kosong`;
  return (
    <span title={detail} className="inline-flex items-center gap-1 rounded-full bg-[#FEF3C7] px-2 py-1 text-xs font-medium text-[#92400E]">
      <AlertCircle className="h-3 w-3" aria-hidden="true" />
      Perlu dilengkapi
      <span className="sr-only">: {detail}</span>
    </span>
  );
}

// Lencana bila agen tidak berhasil mengisi satu isian pun (halaman mungkin meminta masuk): lamaran belum
// terkirim, pengguna mengisi sendiri di situs lowongan. Dasarnya log percobaan terbaru (reason no_fields_filled).
function FillYourselfBadge() {
  return (
    <span title={NO_FIELDS_FILLED_TEXT} className="inline-flex items-center gap-1 rounded-full bg-[#FEF3C7] px-2 py-1 text-xs font-medium text-[#92400E]">
      <AlertCircle className="h-3 w-3" aria-hidden="true" />
      {FILL_YOURSELF_LABEL}
      <span className="sr-only">: {NO_FIELDS_FILLED_TEXT}</span>
    </span>
  );
}

// Baris kecil untuk kartu yang lowongannya muncul lebih dari sekali: urutan dan waktu dibuat (lib/applicationCards.ts).
function DuplicateNote({ info, className = "" }: { info?: DuplicateInfo; className?: string }) {
  if (!info) return null;
  return <p className={`text-xs text-muted-foreground/80 ${className}`}>{duplicateLabel(info)}</p>;
}

function DraggableKanbanCard({ app, gaps, fillYourself, duplicate, onOpen }: { app: AIApplicationData; gaps?: FormGaps; fillYourself?: boolean; duplicate?: DuplicateInfo; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: app.id, data: app, attributes: { roleDescription: BOARD_ROLE_DESCRIPTION } });
  // Kartu asal tetap di tempat dan memudar; yang mengikuti penunjuk hanya DragOverlay (tanpa transform di sini).
  const style = { opacity: isDragging ? 0.5 : 1 };
  const job = jobOf(app);

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="group cursor-grab active:cursor-grabbing">
      <div className="rounded-xl bg-[#F5F5F5] border-2 border-[#E0E0E0] p-3 hover:border-[#0A5BE0] hover:shadow-md transition relative">
        <div aria-hidden="true" className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-[#0A5BE0]/10 text-[#0A5BE0] grid place-items-center opacity-0 group-hover:opacity-100 transition">
          <GripVertical className="h-3 w-3" />
        </div>
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-[#0A5BE0]" aria-hidden="true" />
          <p className="text-sm font-semibold truncate">{job?.title || "Lowongan"}</p>
        </div>
        <p className="text-xs text-muted-foreground mt-1 truncate">{job?.company || "Perusahaan"}</p>
        <DuplicateNote info={duplicate} className="mt-1 leading-snug" />
        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" aria-hidden="true" />
          {app.submitted_at ? `${daysAgo(app.submitted_at)} hari lalu` : "Belum dikirim"}
        </div>
        {app.status === "ready" && gaps && (
          <div className="mt-2">
            <FormGapBadge gaps={gaps} />
          </div>
        )}
        {fillYourself && (
          <div className="mt-2">
            <FillYourselfBadge />
          </div>
        )}
        {app.follow_up_scheduled && !app.follow_up_sent && (
          <div className="mt-2 text-xs bg-[#FEF3C7] text-[#92400E] px-2 py-1 rounded-full inline-flex items-center gap-1">
            <AlertCircle className="h-3 w-3" aria-hidden="true" />
            Perlu tindak lanjut
          </div>
        )}
        <button
          type="button"
          // Tombol ini bukan bagian dari seretan: tekan mouse, sentuhan, dan keyboard di sini tidak boleh memulai drag.
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onClick={onOpen}
          className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-lg border-2 border-[#0A5BE0]/30 text-sm font-medium text-[#0A5BE0] hover:bg-[#0A5BE0]/5"
        >
          Lihat detail
        </button>
      </div>
    </div>
  );
}

function DroppableColumn({ status, apps, children }: {
  status: string; apps: AIApplicationData[]; children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status, data: { status } });
  const config = statusConfig[status];
  return (
    <div
      ref={setNodeRef}
      role="group"
      aria-label={`Kolom ${applicationStatusLabel(status)}, ${apps.length} lamaran`}
      className={`rounded-2xl border-2 p-3 min-h-[400px] transition-colors ${
        isOver ? 'border-[#0A5BE0] bg-[#0A5BE0]/5' : 'border-[#999999] bg-white'
      }`}
    >
      <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${config.color}`}>
        <span className="text-xs font-semibold uppercase tracking-wider">{applicationStatusLabel(status)}</span>
        <span className="text-xs font-mono">{apps.length}</span>
      </div>
      <div className="mt-3 space-y-2">
        {children}
      </div>
    </div>
  );
}

function AppListRow({ app, gaps, fillYourself, duplicate, profileSkills, onOpen }: { app: AIApplicationData; gaps?: FormGaps; fillYourself?: boolean; duplicate?: DuplicateInfo; profileSkills: readonly string[] | null; onOpen: () => void }) {
  const config = statusConfig[app.status] ?? statusConfig.draft;
  const job = jobOf(app);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full min-h-11 rounded-xl border-2 border-[#999999] bg-white p-4 flex items-center gap-4 text-left hover:border-[#0A5BE0] transition"
    >
      <div className="h-10 w-10 rounded-lg bg-[#0A5BE0]/10 grid place-items-center shrink-0" aria-hidden="true">
        <Bot className="h-5 w-5 text-[#0A5BE0]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{job?.title || "Posisi"}</p>
        <p className="text-xs text-muted-foreground truncate">
          {job?.company || "Perusahaan"} · {highlightedSkills(app.tailored_skills, profileSkills).length} skill disorot AI
        </p>
        <DuplicateNote info={duplicate} className="truncate" />
        <span className={`mt-1.5 inline-block px-2.5 py-0.5 rounded-full text-xs font-medium md:hidden ${config.color}`}>
          {applicationStatusLabel(app.status)}
        </span>
        {app.status === "ready" && gaps && (
          <span className="mt-1.5 ml-1.5 inline-block align-top md:ml-0">
            <FormGapBadge gaps={gaps} />
          </span>
        )}
        {fillYourself && (
          <span className="mt-1.5 ml-1.5 inline-block align-top md:ml-0">
            <FillYourselfBadge />
          </span>
        )}
      </div>
      <div className="hidden md:flex items-center gap-4 text-xs">
        <span className={`px-2.5 py-1 rounded-full font-medium ${config.color}`}>{applicationStatusLabel(app.status)}</span>
        {app.submitted_at && (
          <span className="text-muted-foreground inline-flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {daysAgo(app.submitted_at)} hari lalu
          </span>
        )}
      </div>
    </button>
  );
}

export function AppsPage() {
  const [applications, setApplications] = useState<AIApplicationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  // Di ponsel kolom Kanban tidak muat, jadi daftar jadi tampilan awal.
  const [view, setView] = useState<"kanban" | "list">(() =>
    typeof window !== "undefined" && window.innerWidth < 768 ? "list" : "kanban",
  );
  const [viewKey, setViewKey] = useState(0);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const [selectedApp, setSelectedApp] = useState<AIApplicationData | null>(null);
  const [activeDragApp, setActiveDragApp] = useState<AIApplicationData | null>(null);
  // Id kartu yang dijatuhkan di "Terkirim" dan menunggu konfirmasi pengguna (lib/boardDnd.ts, dropNeedsConfirmation).
  const [pendingSubmitted, setPendingSubmitted] = useState<string | null>(null);
  const [approvalUi, setApprovalUi] = useState<ApprovalUi>({ state: "idle" });
  const [approvalBusy, setApprovalBusy] = useState(false);
  // Galat pengajuan tampil di dalam jendela, tepat di atas tombolnya, dan juga lewat toast.
  const [approvalError, setApprovalError] = useState("");
  // Isian wajib yang masih kosong saat agen berhenti, per job_id. Hanya untuk lamaran berstatus ready.
  const [formGaps, setFormGaps] = useState<Record<string, FormGaps>>({});
  // Percobaan agen terbaru per job_id, apa pun hasilnya: dasar lencana "Isi sendiri di situs"
  // dan teks di jendela detail. Naik satu setiap kali tugas apply selesai, supaya log baru dibaca lagi.
  const [attempts, setAttempts] = useState<Record<string, ApplyAttempt>>({});
  // Fakta percobaan agen terbaru per job_id (hasil kirim, isian yang diisi, jalur tangkapan layar) untuk blok
  // "Bukti dari agen" di jendela detail. Dibaca dari log yang sama dengan `attempts`.
  const [agentFacts, setAgentFacts] = useState<Record<string, AgentLogFacts>>({});
  const [applyReloads, setApplyReloads] = useState(0);
  // Skill profil untuk menyaring "Skill yang Disorot" saat ditampilkan: draf lama (dibuat sebelum penyaringan di
  // Edge Function) masih memuat skill lowongan yang tidak ada di profil (temuan 30, uji klik 21 November 2026).
  // null = belum dimuat atau gagal dimuat (hanya penyaring frasa yang berlaku); mode demo tidak memakainya.
  const [profileSkills, setProfileSkills] = useState<string[] | null>(null);
  useEffect(() => {
    if (isMockMode()) return;
    let alive = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const skills = profileSkillList(await profileService.getSkillSource(user.id));
        if (alive) setProfileSkills(skills);
      } catch (err) {
        console.warn("Skill profil belum bisa dimuat untuk menyaring Skill yang Disorot:", err);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Draf yang belum dikirim: periksa apakah sudah menunggu persetujuan, supaya tidak diajukan dua kali.
  const selectedId = selectedApp?.id;
  const selectedStatus = selectedApp?.status;
  useEffect(() => {
    setApprovalError("");
    if (!selectedId || !canRequestApproval(selectedStatus)) {
      setApprovalUi({ state: "idle" });
      return;
    }
    let alive = true;
    setApprovalUi({ state: "checking" });
    getPendingApprovalFor(selectedId)
      .then((pending) => {
        if (alive) setApprovalUi(pending ? { state: "pending", id: pending.id } : { state: "none" });
      })
      .catch((err) => {
        console.error("Error checking pending approval:", err);
        if (alive) setApprovalUi({ state: "unknown" });
      });
    return () => {
      alive = false;
    };
  }, [selectedId, selectedStatus]);

  const handleRequestApproval = async (app: AIApplicationData) => {
    const job = jobOf(app);
    setApprovalBusy(true);
    setApprovalError("");
    try {
      // Sama dengan tombol "Ajukan ke Persetujuan" di jendela Lamar dengan AI.
      const { approval, created } = await requestApprovalForDraft({
        applicationId: app.id,
        jobId: app.job_id,
        jobTitle: job?.title,
        company: job?.company,
        platform: job?.platform_source,
        coverLetter: app.cover_letter,
      });
      setApprovalUi({ state: "pending", id: approval.id });
      toast.success(created ? "Draf masuk antrean persetujuan. Setujui di halaman Persetujuan." : "Draf ini sudah ada di antrean persetujuan.");
    } catch (err) {
      console.error("Error requesting approval:", err);
      const message = describeApprovalError(err, "Draf belum bisa diajukan.");
      setApprovalError(message);
      toast.error(message);
    } finally {
      setApprovalBusy(false);
    }
  };

  const viewOrder: ("kanban" | "list")[] = ["kanban", "list"];
  const handleViewChange = (newView: "kanban" | "list") => {
    const currentIndex = viewOrder.indexOf(view);
    const newIndex = viewOrder.indexOf(newView);
    setDirection(newIndex > currentIndex ? 'next' : 'prev');
    setView(newView);
    setViewKey(k => k + 1);
  };

  // Mouse, sentuhan, dan keyboard (lib/boardDnd.ts). Bukan PointerSensor: seretan jari dibatalkan peramban saat halaman menggulir.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: BOARD_MOUSE_CONSTRAINT }),
    useSensor(TouchSensor, { activationConstraint: BOARD_TOUCH_CONSTRAINT }),
    useSensor(KeyboardSensor),
  );

  const loadApplications = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      if (isMockMode()) {
        setApplications(mockAIApplications as unknown as AIApplicationData[]);
        return;
      }
      // Tanpa data contoh: akun nyata yang belum punya lamaran melihat state kosong, bukan lamaran palsu.
      setApplications(await aiApplicationService.getApplications());
    } catch (err) {
      console.error("Error loading applications:", err);
      setApplications([]);
      setLoadError(describeError(err, "Daftar lamaran belum bisa dimuat."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  // Tugas apply di antrean baru selesai: worker sudah mengubah lamaran dan menulis log percobaan, padahal daftar
  // ini dimuat sekali saat halaman dibuka. Muat ulang tanpa kerangka pemuatan; bila gagal, daftar yang ada
  // dipertahankan (galatnya hanya dicatat). Pembacaan log ikut diulang lewat applyReloads, dalam satu render
  // dengan daftar baru, jadi hanya ada satu kueri log.
  const reloadAfterApply = useCallback(async () => {
    if (isMockMode()) return;
    try {
      const fresh = await aiApplicationService.getApplications();
      setApplications(fresh);
      setSelectedApp((prev) => (prev ? fresh.find((a) => a.id === prev.id) ?? prev : prev));
      setApplyReloads((n) => n + 1);
    } catch (err) {
      console.warn("Lamaran belum bisa dimuat ulang setelah tugas agen selesai:", err);
    }
  }, []);

  // Semua lamaran yang punya lowongan: ambil hasil percobaan agen dari log (kekurangan isian, apakah agen tidak
  // mengisi apa pun, dan bukti pengiriman untuk lamaran yang sudah terkirim). Tidak memblokir halaman; bila gagal,
  // lencana, daftar kekurangan, dan bukti tidak tampil dan halaman tetap berfungsi. Lencana dan daftar kekurangan
  // tetap hanya untuk draf dan ready (dijaga di tempat pemakaiannya). Kuncinya berubah juga saat kartu dipindah
  // antarkolom, jadi data ikut diperbarui.
  const agentJobKey = useMemo(
    () => [...new Set(applications.filter((a) => a.job_id).map((a) => a.job_id))].sort().join(","),
    [applications],
  );
  useEffect(() => {
    if (!agentJobKey) {
      setFormGaps({});
      setAttempts({});
      setAgentFacts({});
      return;
    }
    let alive = true;
    getApplyState(agentJobKey.split(","))
      .then(({ gaps, attempts: latest, agentFacts: facts }) => {
        if (!alive) return;
        setFormGaps(gaps);
        setAttempts(latest);
        setAgentFacts(facts);
      })
      .catch((err) => {
        console.warn("Hasil percobaan agen belum bisa dimuat:", err);
        if (alive) {
          setFormGaps({});
          setAttempts({});
          setAgentFacts({});
        }
      });
    return () => {
      alive = false;
    };
  }, [agentJobKey, applyReloads]);

  // Id tugas antrean -> isian yang terisi pada percobaan itu, untuk petunjuk tugas apply yang selesai tanpa
  // mengisi apa pun. Hanya percobaan terbaru per lowongan yang dikenal; tugas lama tidak diberi petunjuk khusus.
  // Dihitung dari aturan yang sama dengan lencana kartu (needsFillYourself): label antrean dan lencana tidak bisa berbeda.
  const fieldsFilledByQueue = useMemo(() => fieldsFilledByQueueJob(attempts), [attempts]);
  // Lencana "Isi sendiri di situs" hanya untuk lamaran yang belum dikirim dan yang percobaan agennya sungguh ada
  // dan tidak mengisi apa pun (log status incomplete dengan 0 isian terisi atau reason no_fields_filled). Percobaan dicari per lowongan, jadi
  // yang tercatat sebelum lamaran ini dibuat tidak dihitung (attemptForApplication): draf baru yang belum pernah
  // diajukan atau diserahkan ke agen tidak mewarisi kegagalan draf lama untuk lowongan yang sama (temuan 33).
  // Untuk draf yang belum pernah dicoba agen, layar sengaja tidak menampilkan apa-apa, bukan petunjuk semacam
  // "Agen belum mendukung situs ini": tidak ada data di kode yang menyatakan sumber mana yang tidak bisa diisi agen
  // (hasilnya bergantung pada halaman, misalnya perlu masuk dulu), jadi petunjuk itu akan menjadi klaim tanpa bukti.
  const attemptOf = (app: AIApplicationData) => attemptForApplication(attempts[app.job_id], app);
  const fillYourselfFor = (app: AIApplicationData) => canRequestApproval(app.status) && needsFillYourself(attemptOf(app));

  // "Tandai: Sudah Kutindaklanjuti" hanya mencatat bahwa pengguna sendiri sudah follow-up. Applify tidak
  // mengirim email follow-up. Pengingat Telegram worker memakai satu chat milik pengelola (TELEGRAM_CHAT_ID),
  // bukan chat pengguna, jadi layar tidak menjanjikan pengingat ke pengguna.
  const handleFollowUp = async (appId: string) => {
    const markDone = (a: AIApplicationData): AIApplicationData =>
      a.id === appId ? { ...a, follow_up_sent: true, status: a.status === "submitted" ? "follow_up" : a.status } : a;
    try {
      if (isMockMode()) {
        setApplications(prev => prev.map(markDone));
        setSelectedApp(prev => (prev ? markDone(prev) : prev));
        return;
      }
      await aiApplicationService.markFollowUpSent(appId);
      setSelectedApp(prev => (prev ? markDone(prev) : prev));
      toast.success("Tercatat: kamu sudah follow-up.");
      loadApplications();
    } catch (err) {
      console.error("Error marking follow-up:", err);
      toast.error(describeError(err, "Catatan follow-up belum tersimpan. Coba lagi."));
    }
  };

  // Pindah status (seret kartu atau pilih dari daftar). Kartu dipindah dulu di layar; bila gagal tersimpan,
  // dikembalikan dan pengguna diberi tahu lewat toast.
  const moveApplication = useCallback((appId: string, targetStatus: ApplicationStatus) => {
    const current = applications.find(a => a.id === appId);
    if (!current || current.status === targetStatus) return;
    const previousStatus = current.status;
    setApplications(prev => prev.map(a => a.id === appId ? { ...a, status: targetStatus } : a));
    setSelectedApp(prev => (prev && prev.id === appId ? { ...prev, status: targetStatus } : prev));
    if (isMockMode()) return;
    aiApplicationService.updateStatus(appId, targetStatus).then(() => {
      toast.success(`Status diubah menjadi "${applicationStatusLabel(targetStatus)}".`);
    }).catch((err) => {
      console.error("Gagal menyimpan status:", err);
      setApplications(prev => prev.map(a => a.id === appId ? { ...a, status: previousStatus } : a));
      setSelectedApp(prev => (prev && prev.id === appId ? { ...prev, status: previousStatus } : prev));
      toast.error(describeError(err, "Status belum tersimpan, jadi kartu dikembalikan ke kolom semula. Coba lagi."));
    });
  }, [applications]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const app = applications.find(a => a.id === event.active.id);
    if (app) setActiveDragApp(app);
  }, [applications]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragApp(null);
    const move = dragEndMove(event);
    if (!move) return;
    const from = applications.find((a) => a.id === move.appId)?.status;
    // "Terkirim" lewat seret perlu konfirmasi: Applify belum mengirim apa pun, jadi statusnya harus pilihan sadar pengguna.
    if (dropNeedsConfirmation(from, move.status)) {
      setPendingSubmitted(move.appId);
      return;
    }
    moveApplication(move.appId, move.status);
  }, [applications, moveApplication]);

  const stats = {
    total: applications.length,
    submitted: applications.filter((a) => a.status === "submitted").length,
    followUp: applications.filter((a) => a.status === "follow_up").length,
    responded: applications.filter((a) => a.status === "responded").length,
  };

  // Same grouping function as the Dashboard counters (lib/dashboardStats.ts), so both screens show the same numbers.
  const groupedApps: Record<ApplicationStatus, AIApplicationData[]> = groupByStatus(applications);
  // Lowongan yang sama dengan lebih dari satu lamaran: kartunya diberi urutan dan waktu dibuat agar bisa dibedakan.
  const duplicates = useMemo(
    () => duplicateApplications(applications.map((a) => ({ id: a.id, created_at: a.created_at, job_id: a.job_id, title: jobOf(a)?.title, company: jobOf(a)?.company }))),
    [applications],
  );

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20" role="status" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-[#0A5BE0]" aria-hidden="true" />
          <span className="ml-3 text-muted-foreground">Memuat lamaranmu...</span>
        </div>
      </AppShell>
    );
  }

  const selectedJob = selectedApp ? jobOf(selectedApp) : undefined;
  const selectedGaps = selectedApp && selectedApp.status === "ready" ? formGaps[selectedApp.job_id] : undefined;
  const selectedAttempt = selectedApp ? attemptOf(selectedApp) : undefined;
  const selectedFillYourself = selectedApp ? fillYourselfFor(selectedApp) : false;
  // Hasil percobaan agen terbaru untuk lamaran ini (hanya percobaan sesudah lamaran dibuat, lihat attemptForApplication).
  const selectedFacts = selectedApp && selectedAttempt ? agentFacts[selectedApp.job_id] : undefined;
  const selectedOutcome = describeLogOutcome(selectedFacts);
  // Terkirim menurut log: agen menekan kirim dan halaman konfirmasi terdeteksi. Hanya ini yang disebut "Bukti pengiriman".
  const selectedSent = selectedOutcome?.tone === "sent";
  // Hasil lain (kirim belum terkonfirmasi, ditolak formulir, terisi sebagian) menggantikan teks "berhenti sebelum tombol kirim".
  const selectedIssue = selectedOutcome && !selectedSent ? selectedOutcome : null;
  // Pertanyaan wajib yang belum bisa dijawab agen (percobaan terbaru, belum terkirim). Dijawab di halaman Persetujuan.
  const selectedQuestionCount = questionsToAnswer(selectedFacts).length;
  // Agen menahan formulir karena situs lowongan mengirim kode keamanan ke email. Kodenya dimasukkan di halaman Persetujuan.
  const selectedAwaitingCode = awaitingCodeState(selectedFacts).waiting;
  const selectedSkills = selectedApp ? highlightedSkills(selectedApp.tailored_skills, profileSkills) : [];

  return (
    <AppShell>
      <header className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Lamaran Saya</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {stats.total > 0
              ? `${stats.total} lamaran · ${stats.submitted} terkirim · ${stats.responded} sudah dibalas`
              : "Belum ada lamaran. Mulai dari halaman Lowongan."}
          </p>
        </div>
        <div className="flex gap-2" role="group" aria-label="Pilih tampilan">
          <button
            type="button"
            onClick={() => handleViewChange("kanban")}
            aria-pressed={view === "kanban"}
            className={`hidden md:inline-flex min-h-11 px-3 rounded-lg items-center gap-2 text-sm border-2 transition ${
              view === "kanban"
                ? "bg-[#0A5BE0] text-white border-[#0A5BE0]"
                : "border-[#999999] text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-4 w-4" aria-hidden="true" /> Papan
          </button>
          <button
            type="button"
            onClick={() => handleViewChange("list")}
            aria-pressed={view === "list"}
            className={`min-h-11 px-3 rounded-lg inline-flex items-center gap-2 text-sm border-2 transition ${
              view === "list"
                ? "bg-[#0A5BE0] text-white border-[#0A5BE0]"
                : "border-[#999999] text-muted-foreground hover:text-foreground"
            }`}
          >
            <List className="h-4 w-4" aria-hidden="true" /> Daftar
          </button>
        </div>
      </header>

      {loadError ? (
        <ErrorState title="Daftar lamaran belum bisa dimuat" message={loadError} onRetry={loadApplications} />
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { l: "Total Lamaran", v: stats.total },
              { l: "Terkirim", v: stats.submitted },
              { l: "Tindak Lanjut", v: stats.followUp },
              { l: "Sudah Dibalas", v: stats.responded },
            ].map((s) => (
              <div key={s.l} className="rounded-xl border-2 border-[#999999] bg-white p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{s.l}</p>
                <p className="font-mono text-xl md:text-2xl font-bold mt-1">{s.v}</p>
              </div>
            ))}
          </div>

          <div key={viewKey} className={direction === 'next' ? 'animate-slide-right' : 'animate-slide-left'}>
            {applications.length === 0 ? (
              <div className="text-center py-16 rounded-2xl border-2 border-dashed border-black/[10%]">
                <Bot className="h-12 w-12 mx-auto text-[#999999] mb-4" aria-hidden="true" />
                <h2 className="text-lg font-semibold mb-2">Belum ada lamaran</h2>
                <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                  Pilih lowongan di halaman Lowongan, lalu tekan "Lamar dengan AI". Draf surat lamaran yang dibuat AI
                  akan tersimpan dan muncul di sini.
                </p>
                <Link to="/jobs" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0A5BE0] px-6 text-sm font-semibold text-white hover:bg-[#0256d3] transition">
                  <Search className="h-4 w-4" aria-hidden="true" /> Cari lowongan
                </Link>
              </div>
            ) : view === "kanban" ? (
              <>
                <DndContext
                  sensors={sensors}
                  collisionDetection={boardCollisionDetection}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDragCancel={() => setActiveDragApp(null)}
                  accessibility={{
                    screenReaderInstructions: { draggable: BOARD_SCREEN_READER_INSTRUCTIONS },
                    announcements: boardAnnouncements((id) => {
                      const card = applications.find((a) => a.id === id);
                      return (card && jobOf(card)?.title) || "Lowongan";
                    }),
                  }}
                >
                  <div className="hidden md:grid grid-cols-3 lg:grid-cols-6 gap-3">
                    {APPLICATION_STATUSES.map((status) => (
                      <DroppableColumn key={status} status={status} apps={groupedApps[status]}>
                        {groupedApps[status].map((app) => (
                          <DraggableKanbanCard key={app.id} app={app} gaps={formGaps[app.job_id]} fillYourself={fillYourselfFor(app)} duplicate={duplicates.get(app.id)} onOpen={() => setSelectedApp(app)} />
                        ))}
                      </DroppableColumn>
                    ))}
                  </div>
                  {/* Portal ke body: di dalam wadah beranimasi (transform) `position: fixed` bergeser dari penunjuk. */}
                  {typeof document !== "undefined" && createPortal(
                    <DragOverlay>
                      {activeDragApp ? (
                        <div className="rounded-xl bg-white border-2 border-[#0A5BE0] p-3 shadow-lg rotate-2">
                          <p className="text-sm font-semibold">{jobOf(activeDragApp)?.title || "Lowongan"}</p>
                          <p className="text-xs text-muted-foreground">{jobOf(activeDragApp)?.company || "Perusahaan"}</p>
                        </div>
                      ) : null}
                    </DragOverlay>,
                    document.body,
                  )}
                </DndContext>
                {/* Layar sempit: papan disembunyikan, jadi daftar ditampilkan sebagai gantinya */}
                <div className="md:hidden space-y-3">
                  {applications.map((app) => <AppListRow key={app.id} app={app} gaps={formGaps[app.job_id]} fillYourself={fillYourselfFor(app)} duplicate={duplicates.get(app.id)} profileSkills={profileSkills} onOpen={() => setSelectedApp(app)} />)}
                </div>
              </>
            ) : (
              <div className="space-y-3">
                {applications.map((app) => <AppListRow key={app.id} app={app} gaps={formGaps[app.job_id]} fillYourself={fillYourselfFor(app)} duplicate={duplicates.get(app.id)} profileSkills={profileSkills} onOpen={() => setSelectedApp(app)} />)}
              </div>
            )}
          </div>
        </>
      )}

      {/* Antrean tugas agen: tempat memantau tombol "Isi Formulir Saja". Di bawah papan, bukan di atasnya: panel
          baru muncul beberapa detik setelah halaman terbuka dan tingginya berubah-ubah (kosong, satu tugas, sepuluh
          tugas), jadi di atas papan ia menggeser papan sekitar 230 px ke bawah (temuan 31, uji klik 21 November 2026). */}
      <QueuePanel onApplyFinished={reloadAfterApply} fieldsFilledByQueue={fieldsFilledByQueue} />

      {/* Detail lamaran: dialog Radix (Esc menutup, fokus terkunci di dalam, dibaca pembaca layar sebagai dialog) */}
      <Dialog open={!!pendingSubmitted} onOpenChange={(open) => { if (!open) setPendingSubmitted(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{SUBMITTED_CONFIRM_TEXT.title}</DialogTitle>
            <DialogDescription>{SUBMITTED_CONFIRM_TEXT.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setPendingSubmitted(null)}
              className="min-h-11 rounded-xl border-2 border-[#999999] bg-white px-5 text-sm font-semibold hover:bg-black/[4%] transition"
            >
              {SUBMITTED_CONFIRM_TEXT.cancel}
            </button>
            <button
              type="button"
              onClick={() => {
                if (pendingSubmitted) moveApplication(pendingSubmitted, "submitted");
                setPendingSubmitted(null);
              }}
              className="min-h-11 rounded-xl bg-[#0A5BE0] px-5 text-sm font-semibold text-white hover:bg-[#0256d3] transition"
            >
              {SUBMITTED_CONFIRM_TEXT.confirm}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedApp} onOpenChange={(open) => { if (!open) setSelectedApp(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedApp && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 pr-6">
                  <Bot className="h-5 w-5 text-[#0A5BE0]" aria-hidden="true" />
                  {selectedJob?.title || "Lamaran"}
                </DialogTitle>
                <DialogDescription>{selectedJob?.company || "Perusahaan"}</DialogDescription>
              </DialogHeader>

              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${(statusConfig[selectedApp.status] ?? statusConfig.draft).color}`}>
                    {applicationStatusLabel(selectedApp.status)}
                  </span>
                  {selectedFillYourself && <FillYourselfBadge />}
                  {selectedApp.submitted_at && (
                    <span className="text-xs text-muted-foreground">
                      Dikirim {new Date(selectedApp.submitted_at).toLocaleDateString("id-ID")}
                    </span>
                  )}
                  <label className="ml-auto flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Ubah status</span>
                    <select
                      value={selectedApp.status}
                      onChange={(e) => moveApplication(selectedApp.id, e.target.value as ApplicationStatus)}
                      className="min-h-11 rounded-lg border-2 border-[#999999] bg-white px-3 text-base md:text-sm"
                    >
                      {APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{applicationStatusLabel(s)}</option>)}
                    </select>
                  </label>
                </div>

                {/* Draf yang belum dikirim bisa diajukan dari sini, tanpa membuka lagi jendela Lamar dengan AI */}
                {canRequestApproval(selectedApp.status) && (
                  <div className="rounded-xl border-2 border-[#16150F]/10 p-4 space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-[#0A5BE0]" aria-hidden="true" />
                      Persetujuan
                    </h3>
                    {approvalUi.state === "pending" ? (
                      <>
                        <p className="text-sm text-muted-foreground">
                          Draf ini sudah menunggu persetujuanmu (berlaku 1 jam). Tanpa persetujuan, agen tidak akan mengirim.
                        </p>
                        <Link
                          to="/approvals"
                          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#16150F] px-5 text-sm font-semibold text-white hover:-translate-y-0.5 hover:shadow-lg transition"
                        >
                          <ShieldCheck className="h-4 w-4 text-[#D2F801]" aria-hidden="true" />
                          Buka Persetujuan
                        </Link>
                      </>
                    ) : (
                      <>
                        {selectedIssue && (
                          <div
                            data-testid="agent-outcome"
                            className={`rounded-xl p-3 text-sm space-y-1 ${selectedIssue.tone === "unverified" ? "bg-[#FEF3C7] text-[#92400E]" : "bg-[#F5F5F5]"}`}
                          >
                            <p className="font-semibold">{selectedIssue.label}</p>
                            <p>{selectedIssue.hint}</p>
                          </div>
                        )}
                        {selectedQuestionCount > 0 && (
                          <p data-testid="agent-questions-link" className="rounded-xl bg-[#FEF3C7] p-3 text-sm text-[#92400E]">
                            Agen butuh jawabanmu untuk {selectedQuestionCount} pertanyaan. Jawab di halaman{" "}
                            <Link to="/approvals" className="font-semibold underline underline-offset-4">Persetujuan</Link>.
                          </p>
                        )}
                        {selectedAwaitingCode && (
                          <p data-testid="agent-code-link" className="rounded-xl bg-[#FEF3C7] p-3 text-sm text-[#92400E]">
                            Agen menunggu kode keamanan dari emailmu. Masukkan di halaman{" "}
                            <Link to="/approvals" className="font-semibold underline underline-offset-4">Persetujuan</Link>.
                          </p>
                        )}
                        {!selectedIssue && !selectedAwaitingCode && <p className="text-sm text-muted-foreground">
                          {selectedFillYourself
                            ? // Agen tidak mengisi satu isian pun: lamaran belum terkirim, jadi jangan menulis bahwa formulir sudah dibuka dan diisi.
                              NO_FIELDS_FILLED_TEXT
                            : selectedApp.status === "ready"
                              ? (selectedAttempt?.fieldsFilled ?? 0) > 0
                                ? // Status ready ditulis worker sesudah mengisi sebagian atau seluruh formulir. Teks ini hanya untuk percobaan yang mengisi minimal satu isian (fields_filled > 0).
                                  "Agen sudah membuka formulir lowongan ini dan berhenti sebelum tombol kirim. Pengiriman otomatis belum diizinkan (selama uji coba, pengiriman dimatikan), jadi lamaran tidak terkirim dan tetap di kolom Siap dikirim. Bila ada data yang kurang, lengkapi dulu lalu ajukan lagi supaya agen mengisi ulang."
                                : // Ready lewat Ubah status, atau percobaan agen tidak tercatat: tidak ada bukti agen mengisi formulir.
                                  "Draf ini ditandai siap dikirim, tetapi belum ada catatan bahwa agen berhasil mengisi formulirnya. Kirim sendiri di situs lowongan, atau ajukan lagi supaya agen mencoba mengisi formulir."
                              : "Draf ini belum diajukan. Tinjau suratnya, lalu ajukan ke persetujuan. Agen tidak mengirim apa pun sebelum kamu menyetujuinya."}
                        </p>}
                        {selectedGaps && (
                          <div className="rounded-xl bg-[#FEF3C7] p-3 text-sm text-[#92400E] space-y-2">
                            <p id="detail-form-gaps-heading" className="font-semibold">Isian wajib yang masih kosong saat agen berhenti:</p>
                            <ol aria-labelledby="detail-form-gaps-heading" className="list-decimal space-y-0.5 break-words pl-5">
                              {selectedGaps.remaining.map((label, i) => <li key={i}>{label}</li>)}
                            </ol>
                            {selectedGaps.cvAttached === false && (
                              <p>
                                CV belum terlampir. Unggah CV di <Link to="/profile" className="font-semibold underline underline-offset-4">Profil Saya</Link>.
                              </p>
                            )}
                            {personalDataHint(selectedGaps.remaining) && (
                              <p data-testid="personal-data-hint">
                                {personalDataHint(selectedGaps.remaining)}{" "}
                                <Link to="/automation-settings" className="font-semibold underline underline-offset-4">{PERSONAL_DATA_LINK_LABEL}</Link>
                              </p>
                            )}
                            <p>
                              Lengkapi datanya di <Link to="/profile" className="font-semibold underline underline-offset-4">Profil Saya</Link> atau{" "}
                              <Link to="/automation-settings" className="font-semibold underline underline-offset-4">Pengaturan Agen</Link>, lalu ajukan lagi.
                            </p>
                          </div>
                        )}
                        {approvalUi.state === "unknown" && (
                          <p className="text-xs text-[#92400E]">
                            Antrean persetujuan belum bisa diperiksa. Pengajuan akan memeriksanya lagi dan memberi tahu bila gagal.
                          </p>
                        )}
                        {approvalError && (
                          <div role="alert" id="detail-approval-error" className="rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {approvalError}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRequestApproval(selectedApp)}
                          disabled={approvalBusy || approvalUi.state === "checking"}
                          aria-describedby={approvalError ? "detail-approval-error" : undefined}
                          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#16150F] px-5 text-sm font-semibold text-white hover:-translate-y-0.5 hover:shadow-lg transition disabled:opacity-60 disabled:hover:translate-y-0"
                        >
                          {approvalBusy || approvalUi.state === "checking" ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <ShieldCheck className="h-4 w-4 text-[#D2F801]" aria-hidden="true" />
                          )}
                          {approvalUi.state === "checking" ? "Memeriksa antrean..." : approvalBusy ? "Mengajukan..." : approvalError ? "Coba ajukan lagi" : selectedApp.status === "ready" ? "Ajukan lagi ke Persetujuan" : "Ajukan ke Persetujuan"}
                        </button>
                      </>
                    )}
                  </div>
                )}

                {selectedFacts && (selectedSent || hasAgentEvidence(selectedFacts)) && (
                  <div data-testid="agent-proof" className="rounded-xl border-2 border-[#16150F]/10 p-4 space-y-2">
                    <h3 className="text-sm font-semibold flex items-center gap-1.5">
                      <Bot className="h-4 w-4 text-[#0A5BE0]" aria-hidden="true" />
                      {selectedSent ? "Bukti pengiriman" : "Bukti dari agen"}
                    </h3>
                    {selectedSent && selectedOutcome && <p className="text-sm text-muted-foreground">{selectedOutcome.hint}</p>}
                    <AgentEvidence screenshots={selectedFacts.screenshots} filledFields={selectedFacts.filled_fields} loggedAt={selectedFacts.logged_at} />
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-[#0A5BE0]" aria-hidden="true" />
                    Surat Lamaran dari AI
                  </h3>
                  <div className="rounded-xl bg-[#F5F5F5] p-4 text-sm whitespace-pre-wrap leading-relaxed">
                    {selectedApp.cover_letter}
                  </div>
                </div>

                {selectedSkills.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                      <Zap className="h-4 w-4 text-[#0A5BE0]" aria-hidden="true" />
                      Skill yang Disorot
                    </h3>
                    <ul className="flex flex-wrap gap-2">
                      {selectedSkills.map((skill, i) => (
                        <li key={i} className="text-xs bg-[#0A5BE0]/10 text-[#0A5BE0] px-2.5 py-1 rounded-full font-medium">
                          {skill}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedApp.ai_notes && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                      <Bot className="h-4 w-4 text-[#0A5BE0]" aria-hidden="true" />
                      Catatan Strategi AI
                    </h3>
                    <div className="rounded-xl bg-[#F5F5F5] p-4 text-sm whitespace-pre-wrap">
                      {selectedApp.ai_notes}
                    </div>
                  </div>
                )}

                {(selectedApp.status === "submitted" || selectedApp.status === "follow_up") &&
                  selectedApp.follow_up_scheduled &&
                  !selectedApp.follow_up_sent && (
                  <div className="rounded-xl bg-[#FEF3C7] border-2 border-[#FEF3C7] p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="h-4 w-4 text-[#92400E]" aria-hidden="true" />
                      <span className="text-sm font-semibold text-[#92400E]">
                        {selectedApp.status === "follow_up" ? "Saatnya tindak lanjut" : "Saran tindak lanjut"}
                      </span>
                    </div>
                    <p className="text-xs text-[#92400E]">
                      Disarankan menghubungi perusahaan sekitar{" "}
                      {new Date(selectedApp.follow_up_scheduled).toLocaleDateString("id-ID", {
                        weekday: "long", day: "numeric", month: "long",
                      })}
                      . Applify belum mengirim pengingat ke akunmu, jadi catat tanggal ini sendiri. Pesan tindak lanjut
                      kamu kirim sendiri; Applify tidak mengirim email tindak lanjut.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleFollowUp(selectedApp.id)}
                      title="Hanya mencatat bahwa kamu sudah menghubungi perusahaan. Tidak ada email yang dikirim."
                      className="mt-3 min-h-11 px-4 rounded-lg bg-[#92400E] text-white text-sm font-semibold hover:opacity-90 transition inline-flex items-center gap-1.5"
                    >
                      <Mail className="h-4 w-4" aria-hidden="true" />
                      Tandai: Sudah Kutindaklanjuti
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
