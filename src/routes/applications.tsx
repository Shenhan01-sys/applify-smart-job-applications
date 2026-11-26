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
import { applicationSentNote, groupByStatus, isApplicationSent, summarizeApplications } from "@/lib/dashboardStats";
import { highlightedSkills, profileSkillList } from "@/lib/matchScore";
import { profileService } from "@/services/profileService";
import { duplicateApplications, duplicateLabel, jobDisplay, type DuplicateInfo } from "@/lib/applicationCards";
import { PERSONAL_DATA_LINK_LABEL, personalDataHint } from "@/lib/personalData";
import { attemptForApplication, fieldsFilledByQueueJob, needsFillYourself, sentQueueJobIds, type ApplyAttempt, type FormGaps } from "@/lib/formGaps";
import { getApplyState } from "@/services/formGapService";
import AgentEvidence from "@/components/AgentEvidence";
import AgentManualSubmit from "@/components/AgentManualSubmit";
import { describeLogOutcome } from "@/lib/agentApplyStatus";
import { hasAgentEvidence, type AgentLogFacts } from "@/lib/agentEvidence";
import { awaitingCodeState } from "@/lib/securityCode";
import {
  NEEDS_CHECK_APPROVALS_LABEL,
  NEEDS_CHECK_BOARD_COLUMN,
  NEEDS_CHECK_HEADING,
  NEEDS_CHECK_INTRO,
  NEEDS_CHECK_LABEL,
  NEEDS_CHECK_OPEN_FORM_LABEL,
  NEEDS_CHECK_STEPS,
  boardColumnOf,
  groupForBoard,
  isNeedsCheckApplication,
} from "@/lib/needsCheck";
import { questionsToAnswer } from "@/lib/formQuestions";
import {
  FOLLOW_UP_DONE_LABEL,
  followUpBadge,
  nextStatusAfterFollowUpSent,
  showFollowUpDoneBadge,
} from "@/lib/followUp";
import { isManualSent, manualSubmitState, safeJobUrl } from "@/lib/manualSubmit";
import { applyOutcomePreset, extractOutcomeTag, filterApplications, OUTCOME_PRESETS, type OutcomePreset } from "@/lib/applicationFilters";
import { describeApprovalError, getPendingApprovalFor, requestApprovalForDraft } from "@/services/approvalService";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { DndContext, DragOverlay, MouseSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import {
  BOARD_MOUSE_CONSTRAINT,
  BOARD_ROLE_DESCRIPTION,
  BOARD_SCREEN_READER_INSTRUCTIONS,
  BOARD_TOUCH_CONSTRAINT,
  SUBMITTED_BLOCKED_TEXT,
  boardAnnouncements,
  boardCollisionDetection,
  dragEndMove,
  dropIntoSubmittedBlocked,
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
import { loginSearchWithRedirect } from "@/lib/authRedirect";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

export const Route = createFileRoute("/applications")({
  beforeLoad: async ({ location }) => {
    if (isMockMode()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login", search: loginSearchWithRedirect(location) });
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

const jobOf = (app: AIApplicationData) => (app as any).jobs as { title?: string; company?: string; platform_source?: string | null; external_url?: string | null } | undefined;

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

// Lencana "Perlu dicek": situs lowongan meminta kode keamanan lewat email dan kodenya tidak sampai ke agen (lib/needsCheck.ts).
// Kartunya berstatus ready di database dan ditampilkan di kolom Perlu tindak lanjut.
function NeedsCheckBadge() {
  return (
    <span
      data-testid="needs-check-badge"
      title={NEEDS_CHECK_INTRO}
      className="inline-flex items-center gap-1 rounded-full bg-[#FEF3C7] px-2 py-1 text-xs font-medium text-[#92400E]"
    >
      <AlertCircle className="h-3 w-3" aria-hidden="true" />
      {NEEDS_CHECK_LABEL}
      <span className="sr-only">: {NEEDS_CHECK_INTRO}</span>
    </span>
  );
}

// Baris kecil untuk kartu yang lowongannya muncul lebih dari sekali: urutan dan waktu dibuat (lib/applicationCards.ts).
function DuplicateNote({ info, className = "" }: { info?: DuplicateInfo; className?: string }) {
  if (!info) return null;
  return <p className={`text-xs text-muted-foreground/80 ${className}`}>{duplicateLabel(info)}</p>;
}

function DraggableKanbanCard({ app, gaps, fillYourself, needsCheck, duplicate, onOpen }: { app: AIApplicationData; gaps?: FormGaps; fillYourself?: boolean; needsCheck?: boolean; duplicate?: DuplicateInfo; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: app.id, data: app, attributes: { roleDescription: BOARD_ROLE_DESCRIPTION } });
  // Kartu asal tetap di tempat dan memudar; yang mengikuti penunjuk hanya DragOverlay (tanpa transform di sini).
  const style = { opacity: isDragging ? 0.5 : 1 };
  const job = jobOf(app);
  const followUp = followUpBadge(app);

  const outcome = extractOutcomeTag(app.company_response);

  return (
    <div ref={setNodeRef} style={style} className="group">
      <div className="rounded-xl bg-[#F5F5F5] border-2 border-[#E0E0E0] p-3 hover:border-[#0A5BE0] hover:shadow-md transition relative">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none">
          <div aria-hidden="true" className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-[#0A5BE0]/10 text-[#0A5BE0] grid place-items-center opacity-0 group-hover:opacity-100 transition">
            <GripVertical className="h-3 w-3" />
          </div>
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-[#0A5BE0]" aria-hidden="true" />
            <p className="text-sm font-semibold truncate">{jobDisplay(job).title}</p>
          </div>
          <p className="text-xs text-muted-foreground mt-1 truncate">{jobDisplay(job).company}</p>
          <DuplicateNote info={duplicate} className="mt-1 leading-snug" />
          <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {applicationSentNote(app)}
          </div>
          {outcome && (
            <div className="mt-2">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                outcome === "Tawaran"
                  ? "bg-green-100 text-green-800"
                  : outcome === "Wawancara"
                    ? "bg-[#EEF2FF] text-[#3730A3]"
                    : "bg-red-100 text-red-800"
              }`}>
                {outcome}
              </span>
            </div>
          )}
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
          {needsCheck && (
            <div className="mt-2">
              <NeedsCheckBadge />
            </div>
          )}
          {followUp && (
            <div
              className={`mt-2 text-xs px-2 py-1 rounded-full inline-flex items-center gap-1 ${
                followUp.kind === "due" ? "bg-[#FEF3C7] text-[#92400E]" : "bg-[#EEF2FF] text-[#3730A3]"
              }`}
            >
              {followUp.kind === "due" ? <AlertCircle className="h-3 w-3" aria-hidden="true" /> : <Clock className="h-3 w-3" aria-hidden="true" />}
              {followUp.label}
            </div>
          )}
          {showFollowUpDoneBadge(app) && (
            <div className="mt-2 text-xs px-2 py-1 rounded-full inline-flex items-center gap-1 bg-green-100 text-green-800">
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              {FOLLOW_UP_DONE_LABEL}
            </div>
          )}
        </div>
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
        <span className="text-sm font-semibold">{applicationStatusLabel(status)}</span>
        <span className="text-xs font-semibold tabular-nums">{apps.length}</span>
      </div>
      <div className="mt-3 space-y-2">
        {children}
      </div>
    </div>
  );
}

function AppListRow({ app, gaps, fillYourself, needsCheck, duplicate, profileSkills, onOpen }: { app: AIApplicationData; gaps?: FormGaps; fillYourself?: boolean; needsCheck?: boolean; duplicate?: DuplicateInfo; profileSkills: readonly string[] | null; onOpen: () => void }) {
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
        <p className="text-sm font-semibold truncate">{jobDisplay(job).title}</p>
        <p className="text-xs text-muted-foreground truncate">
          {jobDisplay(job).company} · {highlightedSkills(app.tailored_skills, profileSkills).length} skill disorot AI
        </p>
        <DuplicateNote info={duplicate} className="truncate" />
        <span className={`mt-1.5 inline-block px-2.5 py-0.5 rounded-full text-xs font-medium md:hidden ${config.color}`}>
          {applicationStatusLabel(app.status)}
        </span>
        {app.company_response && (
          <p className="mt-1 text-xs text-[#3730A3] truncate">{app.company_response}</p>
        )}
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
        {needsCheck && (
          <span className="mt-1.5 ml-1.5 inline-block align-top md:ml-0">
            <NeedsCheckBadge />
          </span>
        )}
      </div>
      <div className="hidden md:flex items-center gap-4 text-xs">
        <span className={`px-2.5 py-1 rounded-full font-medium ${config.color}`}>{applicationStatusLabel(app.status)}</span>
        <span className="text-muted-foreground inline-flex items-center gap-1">
          <Clock className="h-3 w-3" aria-hidden="true" />
          {applicationSentNote(app)}
        </span>
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
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [activeDragApp, setActiveDragApp] = useState<AIApplicationData | null>(null);
  // Id kartu yang dicoba dipindah ke "Terkirim": dialog menjelaskan bahwa status itu diisi Applify (lib/boardDnd.ts).
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
  const sentByQueue = useMemo(() => sentQueueJobIds(attempts), [attempts]);
  // Lencana "Isi sendiri di situs" hanya untuk lamaran yang belum dikirim dan yang percobaan agennya sungguh ada
  // dan tidak mengisi apa pun (log status incomplete dengan 0 isian terisi atau reason no_fields_filled). Percobaan dicari per lowongan, jadi
  // yang tercatat sebelum lamaran ini dibuat tidak dihitung (attemptForApplication): draf baru yang belum pernah
  // diajukan atau diserahkan ke agen tidak mewarisi kegagalan draf lama untuk lowongan yang sama (temuan 33).
  // Untuk draf yang belum pernah dicoba agen, layar sengaja tidak menampilkan apa-apa, bukan petunjuk semacam
  // "Agen belum mendukung situs ini": tidak ada data di kode yang menyatakan sumber mana yang tidak bisa diisi agen
  // (hasilnya bergantung pada halaman, misalnya perlu masuk dulu), jadi petunjuk itu akan menjadi klaim tanpa bukti.
  const attemptOf = (app: AIApplicationData) => attemptForApplication(attempts[app.job_id], app);
  const fillYourselfFor = (app: AIApplicationData) => canRequestApproval(app.status) && needsFillYourself(attemptOf(app));
  // "Perlu dicek": percobaan agen terbaru berhenti di tunggu kode keamanan (lib/needsCheck.ts). Status di database tetap
  // ready; kartunya hanya ditampilkan di kolom Perlu tindak lanjut dan hitungan terkirim tidak berubah.
  const needsCheckFor = (app: AIApplicationData) => isNeedsCheckApplication(app, agentFacts[app.job_id], !!attemptOf(app));

  // "Tandai: Sudah Kutindaklanjuti" hanya mencatat bahwa pengguna sendiri sudah follow-up. Applify tidak
  // mengirim email follow-up. Status `submitted` tetap di kolom Terkirim, dan kartu di `follow_up`
  // dikembalikan ke `submitted` agar tidak lagi masuk hitungan "Perlu tindak lanjut" (UX-P7-02).
  const handleFollowUp = async (appId: string) => {
    const markDone = (a: AIApplicationData): AIApplicationData =>
      a.id === appId
        ? { ...a, follow_up_sent: true, status: nextStatusAfterFollowUpSent(a.status) as ApplicationStatus }
        : a;
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
    const dragged = applications.find((a) => a.id === move.appId);
    const from = dragged?.status;
    // Kartu "Perlu dicek" sudah tampil di Perlu tindak lanjut: dijatuhkan di kolom itu tidak boleh mengubah status aslinya
    // menjadi follow_up (dihitung terkirim dan tidak bisa kembali ke submitted).
    if (dragged && move.status === NEEDS_CHECK_BOARD_COLUMN && needsCheckFor(dragged)) return;
    // "Terkirim" tidak bisa dipilih pengguna: hanya agen atau email yang mengisinya. Tampilkan penjelasan saja.
    if (dropIntoSubmittedBlocked(from, move.status)) {
      setPendingSubmitted(move.appId);
      return;
    }
    moveApplication(move.appId, move.status);
    // needsCheckFor membaca attempts dan agentFacts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applications, moveApplication, attempts, agentFacts]);

  // Hitungan yang sama dengan penghitung Beranda (lib/dashboardStats.ts): "Terkirim" mencakup semua lamaran yang sudah
  // dikirim (Terkirim, Perlu tindak lanjut, Sudah dibalas, dan Ditutup yang pernah dikirim), bukan hanya kolom Terkirim.
  const stats = summarizeApplications(applications);

  const filteredApps = useMemo(() => {
    // Saringan Siap dikirim dan Perlu tindak lanjut mengikuti kolom papan, jadi kartu "Perlu dicek" ikut Perlu tindak lanjut.
    const byBoardColumn = statusFilter === "ready" || statusFilter === NEEDS_CHECK_BOARD_COLUMN;
    const rows = filterApplications(applications, { query: searchQuery, status: byBoardColumn ? "all" : statusFilter });
    if (!byBoardColumn) return rows;
    return rows.filter((a) => boardColumnOf(a.status, needsCheckFor(a)) === statusFilter);
    // needsCheckFor membaca attempts dan agentFacts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applications, searchQuery, statusFilter, attempts, agentFacts]);
  const hasActiveFilter = searchQuery.trim() !== "" || statusFilter !== "all";

  useEffect(() => {
    setNoteDraft(selectedApp?.company_response ?? "");
  }, [selectedApp?.id, selectedApp?.company_response]);

  const handleSaveCompanyResponse = async (rawValue: string) => {
    if (!selectedApp) return;
    setSavingNote(true);
    try {
      const updated = await aiApplicationService.updateCompanyResponse(selectedApp.id, rawValue);
      const nextResponse = updated?.company_response ?? (rawValue.trim() ? rawValue.trim() : undefined);
      const nextAt = updated?.response_received_at ?? (nextResponse ? new Date().toISOString() : undefined);
      setApplications((prev) =>
        prev.map((a) => (a.id === selectedApp.id ? { ...a, company_response: nextResponse, response_received_at: nextAt } : a)),
      );
      setSelectedApp((prev) => (prev && prev.id === selectedApp.id ? { ...prev, company_response: nextResponse, response_received_at: nextAt } : prev));
      toast.success(nextResponse ? "Hasil dan catatan lamaran tersimpan." : "Catatan lamaran dibersihkan.");
    } catch (err) {
      console.error("Gagal menyimpan catatan lamaran:", err);
      toast.error("Catatan lamaran belum tersimpan. Coba lagi.");
    } finally {
      setSavingNote(false);
    }
  };

  // Same grouping function as the Dashboard counters (lib/dashboardStats.ts), so both screens show the same numbers.
  const groupedApps: Record<ApplicationStatus, AIApplicationData[]> = groupByStatus(applications);
  // Kolom papan: sama dengan groupedApps, kecuali kartu "Perlu dicek" yang ikut ke Perlu tindak lanjut.
  const displayedGroupedApps: Record<ApplicationStatus, AIApplicationData[]> = groupForBoard(
    hasActiveFilter ? filteredApps : applications,
    needsCheckFor,
  );
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
  const selectedNeedsCheck = selectedApp ? needsCheckFor(selectedApp) : false;
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
  // Agen berhenti sebelum kirim (situs belum diizinkan, dan sebagainya): pengguna bisa membuka formulir, menyalin isian,
  // atau menjalankan agen lagi. Pertanyaan, kode keamanan, dan hasil lain yang punya alur sendiri tidak masuk (lib/manualSubmit.ts).
  const selectedManualState = manualSubmitState(selectedFacts);
  // Log lama yang ditandai terkirim oleh pengguna sendiri: bukan kiriman agen, jadi tidak ada bukti dari situs untuk ditampilkan.
  const selectedManualSent = isManualSent(selectedFacts);
  const selectedSkills = selectedApp ? highlightedSkills(selectedApp.tailored_skills, profileSkills) : [];

  return (
    <AppShell>
      <header className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Lamaran Saya</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {stats.total > 0
              ? `${stats.total} lamaran · ${stats.sent} terkirim · ${stats.responded} sudah dibalas`
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
              { l: "Total Lamaran", v: stats.total, hint: "" },
              // Terkirim = isApplicationSent(): kolom Terkirim ditambah yang sudah pindah ke Tindak Lanjut, Dibalas, atau Ditutup.
              { l: "Terkirim", v: stats.sent, hint: stats.sent > groupedApps.submitted.length ? `${groupedApps.submitted.length} di kolom Terkirim, sisanya sudah pindah kolom` : "" },
              { l: "Tindak Lanjut", v: stats.followUp, hint: "" },
              { l: "Sudah Dibalas", v: stats.responded, hint: "" },
            ].map((s) => (
              <div key={s.l} className="rounded-xl border-2 border-[#999999] bg-white p-4">
                <p className="text-xs font-medium text-muted-foreground">{s.l}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{s.v}</p>
                {s.hint && <p className="mt-0.5 text-xs text-muted-foreground">{s.hint}</p>}
              </div>
            ))}
          </div>

          {/* Cari & Saring Lamaran (UX-P7-06) */}
          {applications.length > 0 && (
            <div className="mb-4 flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Cari lamaran"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari posisi, perusahaan, atau catatan..."
                  className="min-h-11 w-full rounded-xl border-2 border-[#999999] bg-white pl-9 pr-3 text-sm focus:border-[#0A5BE0] focus:outline-none"
                />
              </div>
              <select
                aria-label="Saring status lamaran"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="min-h-11 rounded-xl border-2 border-[#999999] bg-white px-3 text-sm focus:border-[#0A5BE0] focus:outline-none"
              >
                <option value="all">Semua status ({applications.length})</option>
                <option value="active">Aktif (selain Ditutup)</option>
                {APPLICATION_STATUSES.map((s) => (
                  <option key={s} value={s}>{applicationStatusLabel(s)}</option>
                ))}
              </select>
            </div>
          )}

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
            ) : filteredApps.length === 0 && hasActiveFilter ? (
              <div className="text-center py-12 rounded-2xl border-2 border-dashed border-black/[10%] bg-white/60">
                <p className="text-sm font-semibold">Tidak ada lamaran yang cocok dengan pencarian atau filter ini.</p>
                <button
                  type="button"
                  onClick={() => { setSearchQuery(""); setStatusFilter("all"); }}
                  className="mt-3 inline-flex min-h-11 items-center rounded-xl border-2 border-[#0A5BE0]/40 px-4 text-sm font-semibold text-[#0A5BE0] hover:bg-[#0A5BE0]/5"
                >
                  Tampilkan semua lamaran
                </button>
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
                      return jobDisplay(card ? jobOf(card) : undefined).title;
                    }),
                  }}
                >
                  <div className="hidden md:grid grid-cols-3 lg:grid-cols-6 gap-3">
                    {APPLICATION_STATUSES.map((status) => (
                      <DroppableColumn key={status} status={status} apps={displayedGroupedApps[status]}>
                        {displayedGroupedApps[status].map((app) => (
                          <DraggableKanbanCard key={app.id} app={app} gaps={formGaps[app.job_id]} fillYourself={fillYourselfFor(app)} needsCheck={needsCheckFor(app)} duplicate={duplicates.get(app.id)} onOpen={() => setSelectedApp(app)} />
                        ))}
                      </DroppableColumn>
                    ))}
                  </div>
                  {/* Portal ke body: di dalam wadah beranimasi (transform) `position: fixed` bergeser dari penunjuk. */}
                  {typeof document !== "undefined" && createPortal(
                    <DragOverlay>
                      {activeDragApp ? (
                        <div className="rounded-xl bg-white border-2 border-[#0A5BE0] p-3 shadow-lg rotate-2">
                          <p className="text-sm font-semibold">{jobDisplay(jobOf(activeDragApp)).title}</p>
                          <p className="text-xs text-muted-foreground">{jobDisplay(jobOf(activeDragApp)).company}</p>
                        </div>
                      ) : null}
                    </DragOverlay>,
                    document.body,
                  )}
                </DndContext>
                {/* Layar sempit: papan disembunyikan, jadi daftar ditampilkan sebagai gantinya */}
                <div className="md:hidden space-y-3">
                  {filteredApps.map((app) => <AppListRow key={app.id} app={app} gaps={formGaps[app.job_id]} fillYourself={fillYourselfFor(app)} needsCheck={needsCheckFor(app)} duplicate={duplicates.get(app.id)} profileSkills={profileSkills} onOpen={() => setSelectedApp(app)} />)}
                </div>
              </>
            ) : (
              <div className="space-y-3">
                {filteredApps.map((app) => <AppListRow key={app.id} app={app} gaps={formGaps[app.job_id]} fillYourself={fillYourselfFor(app)} needsCheck={needsCheckFor(app)} duplicate={duplicates.get(app.id)} profileSkills={profileSkills} onOpen={() => setSelectedApp(app)} />)}
              </div>
            )}
          </div>
        </>
      )}

      {/* Antrean tugas agen: tempat memantau tombol "Isi Formulir Saja". Di bawah papan, bukan di atasnya: panel
          baru muncul beberapa detik setelah halaman terbuka dan tingginya berubah-ubah (kosong, satu tugas, sepuluh
          tugas), jadi di atas papan ia menggeser papan sekitar 230 px ke bawah (temuan 31, uji klik 21 November 2026). */}
      <QueuePanel onApplyFinished={reloadAfterApply} fieldsFilledByQueue={fieldsFilledByQueue} sentByQueue={sentByQueue} />

      {/* Detail lamaran: dialog Radix (Esc menutup, fokus terkunci di dalam, dibaca pembaca layar sebagai dialog) */}
      <Dialog open={!!pendingSubmitted} onOpenChange={(open) => { if (!open) setPendingSubmitted(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{SUBMITTED_BLOCKED_TEXT.title}</DialogTitle>
            <DialogDescription>{SUBMITTED_BLOCKED_TEXT.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setPendingSubmitted(null)}
              className="min-h-11 rounded-xl bg-[#0A5BE0] px-5 text-sm font-semibold text-white hover:bg-[#0256d3] transition"
            >
              {SUBMITTED_BLOCKED_TEXT.ok}
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
                  {jobDisplay(selectedJob).title}
                </DialogTitle>
                <DialogDescription>{jobDisplay(selectedJob).company}</DialogDescription>
              </DialogHeader>

              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${(statusConfig[selectedApp.status] ?? statusConfig.draft).color}`}>
                    {applicationStatusLabel(selectedApp.status)}
                  </span>
                  {selectedFillYourself && <FillYourselfBadge />}
                  {isApplicationSent(selectedApp) && selectedApp.submitted_at && (
                    <span className="text-xs text-muted-foreground">
                      Dikirim {new Date(selectedApp.submitted_at).toLocaleDateString("id-ID")}
                    </span>
                  )}
                  <label className="ml-auto flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Ubah status</span>
                    <select
                      value={selectedApp.status}
                      onChange={(e) => {
                        const target = e.target.value as ApplicationStatus;
                        if (dropIntoSubmittedBlocked(selectedApp.status, target)) {
                          setPendingSubmitted(selectedApp.id);
                          return;
                        }
                        moveApplication(selectedApp.id, target);
                      }}
                      className="min-h-11 rounded-lg border-2 border-[#999999] bg-white px-3 text-base md:text-sm"
                    >
                      {APPLICATION_STATUSES.map((s) => (
                        <option key={s} value={s} disabled={dropIntoSubmittedBlocked(selectedApp.status, s) || (selectedNeedsCheck && s === NEEDS_CHECK_BOARD_COLUMN)}>
                          {applicationStatusLabel(s)}
                        </option>
                      ))}
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
                        {selectedNeedsCheck && (
                          <div data-testid="needs-check-panel" className="rounded-xl bg-[#FEF3C7] p-3 text-sm text-[#92400E] space-y-2">
                            <p id="detail-needs-check-heading" className="font-semibold">{NEEDS_CHECK_HEADING}</p>
                            <p>{NEEDS_CHECK_INTRO}</p>
                            <ol aria-labelledby="detail-needs-check-heading" className="list-decimal space-y-0.5 break-words pl-5">
                              {NEEDS_CHECK_STEPS.map((step, i) => <li key={i}>{step}</li>)}
                            </ol>
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              {safeJobUrl(selectedJob?.external_url) && (
                                <a
                                  href={safeJobUrl(selectedJob?.external_url) as string}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex min-h-11 items-center rounded-lg bg-[#0A5BE0] px-4 text-sm font-semibold text-white hover:bg-[#0256d3]"
                                >
                                  {NEEDS_CHECK_OPEN_FORM_LABEL}
                                </a>
                              )}
                              <Link
                                to="/approvals"
                                className="inline-flex min-h-11 items-center rounded-lg border-2 border-[#92400E]/40 bg-white px-4 text-sm font-semibold text-[#92400E] hover:bg-black/[4%]"
                              >
                                {NEEDS_CHECK_APPROVALS_LABEL}
                              </Link>
                            </div>
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
                        {selectedManualState && (
                          <AgentManualSubmit
                            className="mt-0"
                            approvalId={selectedFacts?.approval_request_id}
                            row={selectedFacts}
                            jobUrl={selectedJob?.external_url}
                            loadCoverLetter
                          />
                        )}
                        {!selectedIssue && !selectedAwaitingCode && !selectedManualState && <p className="text-sm text-muted-foreground">
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
                      {selectedManualSent ? "Ditandai terkirim manual" : selectedSent ? "Bukti pengiriman" : "Bukti dari agen"}
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

                <div className="rounded-xl border-2 border-[#16150F]/10 p-4 space-y-3">
                  <h3 className="text-sm font-semibold">Hasil & Catatan Lamaran</h3>
                  <div className="flex flex-wrap gap-2">
                    {OUTCOME_PRESETS.map((preset: OutcomePreset) => {
                      const active = extractOutcomeTag(noteDraft) === preset;
                      return (
                        <button
                          key={preset}
                          type="button"
                          disabled={savingNote}
                          onClick={() => {
                            const next = applyOutcomePreset(noteDraft, preset);
                            setNoteDraft(next);
                            handleSaveCompanyResponse(next);
                          }}
                          aria-pressed={active}
                          className={`min-h-11 rounded-lg border-2 px-3 text-xs font-semibold transition ${
                            active
                              ? "border-[#0A5BE0] bg-[#0A5BE0] text-white"
                              : "border-[#999999] bg-white text-foreground hover:border-[#0A5BE0]"
                          }`}
                        >
                          {preset}
                        </button>
                      );
                    })}
                    {selectedApp.company_response && (
                      <button
                        type="button"
                        disabled={savingNote}
                        onClick={() => { setNoteDraft(""); handleSaveCompanyResponse(""); }}
                        className="min-h-11 rounded-lg border-2 border-black/15 px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
                      >
                        Bersihkan hasil
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={2}
                    maxLength={1000}
                    aria-label="Catatan pribadi atau balasan perusahaan"
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Catat jadwal wawancara, alasan penolakan, atau balasan HRD di sini..."
                    className="w-full rounded-xl border-2 border-[#999999] bg-white p-3 text-sm focus:border-[#0A5BE0] focus:outline-none"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {selectedApp.response_received_at
                        ? `Diperbarui ${new Date(selectedApp.response_received_at).toLocaleDateString("id-ID")}`
                        : "Disimpan di lamaranmu sendiri."}
                    </span>
                    <button
                      type="button"
                      disabled={savingNote || noteDraft.trim() === (selectedApp.company_response ?? "").trim()}
                      onClick={() => handleSaveCompanyResponse(noteDraft)}
                      className="min-h-11 rounded-xl bg-[#0A5BE0] px-4 text-sm font-semibold text-white hover:bg-[#0256d3] transition disabled:opacity-50"
                    >
                      {savingNote ? "Menyimpan..." : "Simpan catatan"}
                    </button>
                  </div>
                </div>

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
                {showFollowUpDoneBadge(selectedApp) && (
                  <div className="rounded-xl bg-green-50 border-2 border-green-200 p-4 flex items-center gap-2 text-sm font-medium text-green-800">
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {FOLLOW_UP_DONE_LABEL}
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
