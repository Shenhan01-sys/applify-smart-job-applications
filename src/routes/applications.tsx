import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import { aiApplicationService, type AIApplicationData } from "@/services/aiApplicationService";
import { mockAIApplications } from "@/mocks/mockData";
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent, useDraggable, useDroppable } from "@dnd-kit/core";
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
} from "lucide-react";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

export const Route = createFileRoute("/applications")({
  beforeLoad: async () => {
    if (isMockMode()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Applications — Applify" }] }),
  component: AppsPage,
});

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: "Draft", color: "bg-[#999999] text-white", icon: FileText },
  ready: { label: "Ready", color: "bg-[#0367FC] text-white", icon: CheckCircle2 },
  submitted: { label: "Submitted", color: "bg-[#D2F801] text-[#161616]", icon: Send },
  follow_up: { label: "Follow-up", color: "bg-[#F59E0B] text-white", icon: Mail },
  responded: { label: "Responded", color: "bg-green-500 text-white", icon: CheckCircle2 },
  closed: { label: "Closed", color: "bg-[#999999] text-white", icon: X },
};

function DraggableKanbanCard({ app, onClick }: { app: AIApplicationData; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: app.id, data: app });
  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    opacity: isDragging ? 0.5 : 1,
  } : { opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="group cursor-grab active:cursor-grabbing">
      <div
        onClick={(e) => {
          // Only trigger click if not dragging
          if (!isDragging) onClick();
        }}
        className="rounded-xl bg-[#F5F5F5] border border-[#E0E0E0] p-3 cursor-pointer hover:border-[#0367FC] hover:shadow-md transition relative"
      >
        <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-[#0367FC]/10 text-[#0367FC] grid place-items-center opacity-0 group-hover:opacity-100 transition">
          <GripVertical className="h-3 w-3" />
        </div>
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-[#0367FC]" />
          <p className="text-sm font-semibold truncate">{(app as any).jobs?.title || "Job"}</p>
        </div>
        <p className="text-xs text-muted-foreground mt-1 truncate">{(app as any).jobs?.company || "Company"}</p>
        <div className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          {app.submitted_at
            ? `${Math.floor((Date.now() - new Date(app.submitted_at).getTime()) / 86400000)} hari lalu`
            : "Draft"}
        </div>
        {app.follow_up_scheduled && !app.follow_up_sent && (
          <div className="mt-2 text-[10px] bg-[#FEF3C7] text-[#92400E] px-2 py-1 rounded-full inline-flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Follow-up pending
          </div>
        )}
      </div>
    </div>
  );
}

function DroppableColumn({ status, label, color, apps, children }: {
  status: string; label: string; color: string; apps: AIApplicationData[]; children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status, data: { status } });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-2xl border-2 p-3 min-h-[400px] transition-colors ${
        isOver ? 'border-[#0367FC] bg-[#0367FC]/5' : 'border-[#999999] bg-white'
      }`}
    >
      <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${color}`}>
        <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
        <span className="text-xs font-mono">{apps.length}</span>
      </div>
      <div className="mt-3 space-y-2">
        {children}
      </div>
    </div>
  );
}

function AppsPage() {
  const [applications, setApplications] = useState<AIApplicationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [viewKey, setViewKey] = useState(0);
  const [selectedApp, setSelectedApp] = useState<AIApplicationData | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [activeDragApp, setActiveDragApp] = useState<AIApplicationData | null>(null);

  const handleViewChange = (newView: "kanban" | "list") => {
    setView(newView);
    setViewKey(k => k + 1);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    loadApplications();
  }, []);

  const loadApplications = async () => {
    try {
      setLoading(true);
      if (isMockMode()) {
        setApplications(mockAIApplications as unknown as AIApplicationData[]);
        setLoading(false);
        return;
      }
      const data = await aiApplicationService.getApplications();
      setApplications(data.length ? data : (mockAIApplications as unknown as AIApplicationData[]));
    } catch (err) {
      console.error("Error loading applications:", err);
      setApplications(mockAIApplications as unknown as AIApplicationData[]);
    } finally {
      setLoading(false);
    }
  };

  const handleFollowUp = async (appId: string) => {
    try {
      if (isMockMode()) {
        setApplications(prev => prev.map(a => a.id === appId ? { ...a, follow_up_sent: true } : a));
        return;
      }
      await aiApplicationService.markFollowUpSent(appId);
      loadApplications();
    } catch (err) {
      console.error("Error marking follow-up:", err);
    }
  };

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const app = applications.find(a => a.id === event.active.id);
    if (app) setActiveDragApp(app);
  }, [applications]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragApp(null);
    const { active, over } = event;
    if (!over) return;

    const draggedApp = applications.find(a => a.id === active.id);
    if (!draggedApp) return;

    const targetStatus = over.data.current?.status as string;
    if (targetStatus && draggedApp.status !== targetStatus) {
      setApplications(prev => prev.map(a => a.id === draggedApp.id ? { ...a, status: targetStatus as any } : a));
    }
  }, [applications]);

  const updateAppStatus = (appId: string, newStatus: string) => {
    setApplications(prev => prev.map(a => a.id === appId ? { ...a, status: newStatus as any } : a));
  };

  const stats = {
    total: applications.length,
    submitted: applications.filter((a) => a.status === "submitted").length,
    followUp: applications.filter((a) => a.status === "follow_up").length,
    responded: applications.filter((a) => a.status === "responded").length,
  };

  const groupedApps = {
    draft: applications.filter((a) => a.status === "draft"),
    ready: applications.filter((a) => a.status === "ready"),
    submitted: applications.filter((a) => a.status === "submitted"),
    follow_up: applications.filter((a) => a.status === "follow_up"),
    responded: applications.filter((a) => a.status === "responded"),
    closed: applications.filter((a) => a.status === "closed"),
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#0367FC]" />
          <span className="ml-3 text-muted-foreground">Memuat aplikasi...</span>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <header className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">AI Applications</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {stats.total > 0
              ? `${stats.total} aplikasi AI · ${stats.submitted} terkirim · ${stats.responded} mendapat response`
              : "Belum ada aplikasi AI. Pergi ke Job Feed untuk memulai."}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleViewChange("kanban")}
            className={`hidden md:inline-flex h-10 px-3 rounded-lg items-center gap-2 text-sm border-2 transition ${
              view === "kanban"
                ? "bg-[#0367FC] text-white border-[#0367FC]"
                : "border-[#999999] text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-4 w-4" /> Kanban
          </button>
          <button
            onClick={() => handleViewChange("list")}
            className={`h-10 px-3 rounded-lg inline-flex items-center gap-2 text-sm border-2 transition ${
              view === "list"
                ? "bg-[#0367FC] text-white border-[#0367FC]"
                : "border-[#999999] text-muted-foreground hover:text-foreground"
            }`}
          >
            <List className="h-4 w-4" /> List
          </button>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { l: "Total Aplikasi", v: stats.total },
          { l: "Terkirim", v: stats.submitted },
          { l: "Follow-up", v: stats.followUp },
          { l: "Response", v: stats.responded },
        ].map((s) => (
          <div key={s.l} className="rounded-xl border-2 border-[#999999] bg-white p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.l}</p>
            <p className="font-mono text-xl md:text-2xl font-bold mt-1">{s.v}</p>
          </div>
        ))}
      </div>

      <div key={viewKey} className="animate-view-enter">
      {applications.length === 0 ? (
        <div className="text-center py-16">
          <Bot className="h-12 w-12 mx-auto text-[#999999] mb-4" />
          <h3 className="text-lg font-semibold mb-2">Belum ada aplikasi AI</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Pergi ke halaman Job Feed dan klik "AI Apply Sekarang" pada lowongan yang menarik.
          </p>
        </div>
      ) : view === "kanban" ? (
        /* Kanban View with Drag & Drop */
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="hidden md:grid grid-cols-3 lg:grid-cols-6 gap-3">
            {Object.entries(groupedApps).map(([status, apps]) => {
              const config = statusConfig[status];
              return (
                <DroppableColumn
                  key={status}
                  status={status}
                  label={config.label}
                  color={config.color}
                  apps={apps}
                >
                  {apps.map((app) => (
                    <DraggableKanbanCard
                      key={app.id}
                      app={app}
                      onClick={() => { setSelectedApp(app); setShowDetail(true); }}
                    />
                  ))}
                </DroppableColumn>
              );
            })}
          </div>
          <DragOverlay>
            {activeDragApp ? (
              <div className="rounded-xl bg-white border-2 border-[#0367FC] p-3 shadow-lg rotate-2">
                <p className="text-sm font-semibold">{(activeDragApp as any).jobs?.title || "Job"}</p>
                <p className="text-xs text-muted-foreground">{(activeDragApp as any).jobs?.company || "Company"}</p>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        /* List View */
        <div className="space-y-3">
          {applications.map((app) => {
            const config = statusConfig[app.status];
            const Icon = config.icon;
            return (
              <div
                key={app.id}
                onClick={() => { setSelectedApp(app); setShowDetail(true); }}
                className="rounded-xl border-2 border-[#999999] bg-white p-4 flex items-center gap-4 cursor-pointer hover:border-[#0367FC] transition"
              >
                <div className="h-10 w-10 rounded-lg bg-[#0367FC]/10 grid place-items-center shrink-0">
                  <Bot className="h-5 w-5 text-[#0367FC]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {(app as any).jobs?.title || "Job Position"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {(app as any).jobs?.company || "Company"} · {app.tailored_skills?.length || 0} skills matched
                  </p>
                </div>
                <div className="hidden md:flex items-center gap-4 text-xs">
                  <span className={`px-2.5 py-1 rounded-full font-medium ${config.color}`}>
                    {config.label}
                  </span>
                  {app.submitted_at && (
                    <span className="text-muted-foreground inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {Math.floor((Date.now() - new Date(app.submitted_at).getTime()) / 86400000)}d
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>

      {/* Detail Modal */}
      {showDetail && selectedApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl border-2 border-[#999999] overflow-hidden flex flex-col">
            <div className="p-5 border-b border-[#E0E0E0] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bot className="h-5 w-5 text-[#0367FC]" />
                <div>
                  <h3 className="font-bold">{(selectedApp as any).jobs?.title || "Application"}</h3>
                  <p className="text-sm text-muted-foreground">{(selectedApp as any).jobs?.company || "Company"}</p>
                </div>
              </div>
              <button
                onClick={() => setShowDetail(false)}
                className="h-9 w-9 rounded-lg border border-[#999999] grid place-items-center hover:border-[#0367FC] transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${statusConfig[selectedApp.status].color}`}>
                  {statusConfig[selectedApp.status].label}
                </span>
                {selectedApp.submitted_at && (
                  <span className="text-xs text-muted-foreground">
                    Submitted {new Date(selectedApp.submitted_at).toLocaleDateString("id-ID")}
                  </span>
                )}
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-[#0367FC]" />
                  AI Cover Letter
                </h4>
                <div className="rounded-xl bg-[#F5F5F5] p-4 text-sm whitespace-pre-wrap leading-relaxed">
                  {selectedApp.cover_letter}
                </div>
              </div>

              {selectedApp.tailored_skills?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <Zap className="h-4 w-4 text-[#0367FC]" />
                    Tailored Skills
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedApp.tailored_skills.map((skill, i) => (
                      <span key={i} className="text-xs bg-[#0367FC]/10 text-[#0367FC] px-2.5 py-1 rounded-full font-medium">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedApp.ai_notes && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <Bot className="h-4 w-4 text-[#0367FC]" />
                    AI Strategy Notes
                  </h4>
                  <div className="rounded-xl bg-[#F5F5F5] p-4 text-sm whitespace-pre-wrap">
                    {selectedApp.ai_notes}
                  </div>
                </div>
              )}

              {selectedApp.status === "submitted" && selectedApp.follow_up_scheduled && !selectedApp.follow_up_sent && (
                <div className="rounded-xl bg-[#FEF3C7] border border-[#FEF3C7] p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-4 w-4 text-[#92400E]" />
                    <span className="text-sm font-semibold text-[#92400E]">Follow-up Scheduled</span>
                  </div>
                  <p className="text-xs text-[#92400E]">
                    AI akan mengirim follow-up email pada{" "}
                    {new Date(selectedApp.follow_up_scheduled).toLocaleDateString("id-ID", {
                      weekday: "long", day: "numeric", month: "long",
                    })}
                  </p>
                  <button
                    onClick={() => handleFollowUp(selectedApp.id)}
                    className="mt-3 h-9 px-4 rounded-lg bg-[#92400E] text-white text-xs font-semibold hover:opacity-90 transition inline-flex items-center gap-1.5"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    Kirim Follow-up Sekarang
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
