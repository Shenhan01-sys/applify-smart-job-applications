import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { platformLabel } from "@/lib/platforms";
import { classifyJobChannel } from "@/lib/applyChannel";
import { listOrEmpty, postedDate, radarFromMatches } from "@/lib/jobCardData";
import { HIGH_MATCH_THRESHOLD, NO_PROFILE_SKILLS_TEXT, matchCaption, type JobMatch } from "@/lib/matchScore";
import { JOB_LABELS, jobTypeLabel, marketPositionLabel, workplaceLabel } from "@/lib/jobLabels";
import {
  CLOSED_JOB_NOTE,
  GLINTS_DETAIL_NOTE,
  isClosedJob,
  shouldCheckSource,
  benchmarkScale,
  benchmarkText,
  benchmarkView,
  enrichFailureNote,
  formatMoney,
  formatMoneyRange,
  isProvisionalMatch,
  isThinDetail,
  matchBreakdown,
  mergeJobUpdate,
  needsDetail,
  needsGlintsNote,
  PROVISIONAL_MATCH_NOTE,
  salaryText,
  skillAnalysisNote,
  type BenchmarkView,
  type MatchBreakdown,
  type SalaryBenchmarkResult,
} from "@/lib/jobDetail";
import { automationApi } from "@/services/automationApi";
import {
  MapPin,
  Briefcase,
  DollarSign,
  Calendar,
  ExternalLink,
  Brain,
  Target,
  TrendingUp,
  Building2,
  Zap,
  ChevronDown,
  ChevronUp,
  Bookmark,
  BookmarkCheck,
  Bot,
  Clock,
  FileText,
  Send,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Loader2,
} from "lucide-react";

export interface JobData {
  id: string;
  title: string;
  company: string;
  company_logo?: string;
  location: string;
  type: string;
  workplace_type: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency: string;
  salary_period: string;
  description: string;
  requirements: string[];
  responsibilities: string[];
  benefits: string[];
  platform_source: string;
  external_url?: string;
  match_score: number;
  acceptance_potential: number;
  company_culture_score: number;
  growth_potential: number;
  ai_strategy: string;
  ai_actions: AIAction[];
  skill_gaps: SkillGap[];
  skill_matches: SkillMatch[];
  salary_benchmark: SalaryBenchmark;
  status: string;
  posted_at: string;
}

interface AIAction {
  step: number;
  title: string;
  description: string;
  status: "pending" | "in-progress" | "done";
  estimated_time: string;
}

interface SkillGap {
  skill: string;
  required_level: number;
  user_level: number;
  gap: number;
}

interface SkillMatch {
  skill: string;
  level: number;
  matched: boolean;
}

interface SalaryBenchmark {
  market_average: number;
  market_high: number;
  market_low: number;
  percentile: number;
}

function CircularProgress({ value, label, color, size = 80, title }: { value: number | null; label: string; color: string; size?: number; title?: string }) {
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // null = not measured: an empty ring and a dash, never 0% or a default number
  const offset = circumference - ((value ?? 0) / 100) * circumference;

  return (
    <div className="flex flex-col items-center" title={title}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#EFEFEF"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold" style={{ color: value === null ? "#999999" : color }}>
            {value === null ? "—" : `${value}%`}
          </span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground mt-1 font-medium">{label}</span>
    </div>
  );
}

function RadarChart({ skills }: { skills: { name: string; value: number }[] }) {
  const size = 140;
  const center = size / 2;
  const radius = 55;
  const angleStep = (2 * Math.PI) / skills.length;

  const points = skills.map((skill, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const r = (skill.value / 100) * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  });

  const polyPoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  // Ringkasan teks untuk pembaca layar: nilai tiap skill ada di label, bukan hanya di bentuk grafik.
  const summary = skills.map((sk) => `${sk.name} ${Math.round(sk.value)} persen`).join(", ");

  return (
    <div className="flex items-center justify-center">
      <svg width={size} height={size} role="img" aria-label={`Grafik radar kecocokan skill: ${summary}`}>
        {/* Background circles */}
        {[25, 50, 75, 100].map((level) => (
          <circle
            key={level}
            cx={center}
            cy={center}
            r={(level / 100) * radius}
            fill="none"
            stroke="#E0E0E0"
            strokeWidth={1}
            strokeDasharray="2,2"
          />
        ))}
        {/* Axes */}
        {skills.map((_, i) => {
          const angle = i * angleStep - Math.PI / 2;
          const x = center + radius * Math.cos(angle);
          const y = center + radius * Math.sin(angle);
          return (
            <line
              key={i}
              x1={center}
              y1={center}
              x2={x}
              y2={y}
              stroke="#E0E0E0"
              strokeWidth={1}
            />
          );
        })}
        {/* Data polygon */}
        <polygon
          points={polyPoints}
          fill="rgba(3, 103, 252, 0.15)"
          stroke="#0A5BE0"
          strokeWidth={2}
        />
        {/* Data points */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="#0A5BE0" />
        ))}
        {/* Labels */}
        {skills.map((skill, i) => {
          const angle = i * angleStep - Math.PI / 2;
          const labelRadius = radius + 15;
          const x = center + labelRadius * Math.cos(angle);
          const y = center + labelRadius * Math.sin(angle);
          return (
            <text
              key={i}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-[#666666]"
              style={{ fontSize: 10 }}
            >
              {skill.name}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function TimelineItem({ action, isLast }: { action: AIAction; isLast: boolean }) {
  const statusColors = {
    done: "bg-green-500",
    "in-progress": "bg-[#0A5BE0] animate-pulse",
    pending: "bg-[#E0E0E0]",
  };

  const statusIcons = {
    done: <CheckCircle2 className="h-3 w-3 text-white" />,
    "in-progress": <Bot className="h-3 w-3 text-white" />,
    pending: <Clock className="h-3 w-3 text-[#999999]" />,
  };

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${statusColors[action.status]}`}>
          {statusIcons[action.status]}
        </div>
        {!isLast && <div className="w-0.5 h-8 bg-[#E0E0E0] mt-1" />}
      </div>
      <div className="flex-1 pb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{action.title}</span>
          <span className="text-xs text-muted-foreground bg-[#F5F5F5] px-2 py-0.5 rounded-full">
            {action.estimated_time}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
      </div>
    </div>
  );
}

function SalaryBar({ current, marketAvg, marketHigh, marketLow }: { current: number; marketAvg: number; marketHigh: number; marketLow: number }) {
  const max = marketHigh * 1.1;
  const currentPct = (current / max) * 100;
  const avgPct = (marketAvg / max) * 100;
  const lowPct = (marketLow / max) * 100;
  const highPct = (marketHigh / max) * 100;

  return (
    <div className="space-y-2">
      <div className="relative h-3 bg-[#EFEFEF] rounded-full">
        <div
          className="absolute top-0 bottom-0 bg-[#D2F801] rounded-full"
          style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%`, opacity: 0.3 }}
        />
        <div
          className="absolute top-0 bottom-0 bg-[#0A5BE0] rounded-full"
          style={{ left: `${avgPct - 0.5}%`, width: "1%" }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-[#0A5BE0] rounded-full border-2 border-white shadow-md"
          style={{ left: `${currentPct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{formatCurrency(marketLow)}</span>
        <span className="text-[#0A5BE0] font-semibold">{JOB_LABELS.card.marketAverage}</span>
        <span className="text-muted-foreground">{formatCurrency(marketHigh)}</span>
      </div>
    </div>
  );
}

/** Donat kecocokan: skill yang cocok (hijau) melawan yang belum ada di profil (kuning). Angkanya dari computeMatch. */
function MatchDonut({ breakdown }: { breakdown: MatchBreakdown }) {
  const size = 96;
  const stroke = 12;
  const center = size / 2;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const matchedLength = breakdown.share * circumference;

  return (
    <div className="flex items-center gap-4">
      <svg
        width={size}
        height={size}
        className="shrink-0"
        role="img"
        aria-label={`Grafik donat kecocokan skill: ${breakdown.matched} cocok dan ${breakdown.missing} belum dimiliki dari ${breakdown.total} skill yang diminta`}
      >
        <circle cx={center} cy={center} r={radius} fill="none" stroke="#F59E0B" strokeWidth={stroke} />
        {breakdown.matched > 0 && (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#22C55E"
            strokeWidth={stroke}
            strokeDasharray={`${matchedLength} ${circumference - matchedLength}`}
            transform={`rotate(-90 ${center} ${center})`}
          />
        )}
        <text x={center} y={center} textAnchor="middle" dominantBaseline="central" className="fill-[#16150F] font-bold" style={{ fontSize: 16 }}>
          {breakdown.matched}/{breakdown.total}
        </text>
      </svg>
      <ul className="space-y-1 text-xs">
        <li className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#22C55E]" aria-hidden="true" />
          {breakdown.matched} cocok
        </li>
        <li className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#F59E0B]" aria-hidden="true" />
          {breakdown.missing} belum dimiliki
        </li>
      </ul>
    </div>
  );
}

/**
 * Batang pembanding gaji: pita rentang tengah (p25 sampai p75) lowongan serupa, garis median, dan rentang gaji
 * lowongan ini. Angkanya ada di legenda dan kalimat di bawahnya, jadi batangnya sendiri disembunyikan dari pembaca layar.
 */
function BenchmarkBar({ view }: { view: Extract<BenchmarkView, { kind: "compare" }> }) {
  const s = benchmarkScale(view);
  const jobRange = formatMoneyRange(view.jobMin, view.jobMax, view.currency);
  return (
    <div className="space-y-2">
      <div className="relative h-4 rounded-full bg-[#EFEFEF]" aria-hidden="true">
        <div className="absolute inset-y-0 rounded-full bg-[#0A5BE0]/20" style={{ left: `${s.bandLeft}%`, width: `${s.bandWidth}%` }} />
        <div className="absolute -inset-y-1 w-0.5 bg-[#16150F]" style={{ left: `${s.medianAt}%` }} />
        <div className="absolute inset-y-0.5 rounded-full bg-[#0A5BE0]" style={{ left: `${s.jobLeft}%`, width: `${s.jobWidth}%` }} />
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-full bg-[#0A5BE0]/20" aria-hidden="true" />
          Rentang tengah {formatMoneyRange(view.p25, view.p75, view.currency)}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-0.5 bg-[#16150F]" aria-hidden="true" />
          Median {formatMoney(view.median, view.currency)}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-full bg-[#0A5BE0]" aria-hidden="true" />
          Lowongan ini {jobRange}
        </li>
      </ul>
    </div>
  );
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function cleanJobDescription(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Ids whose full detail was already requested in this page load; a card used on its own gets this fallback. */
const DETAIL_ATTEMPTS_FALLBACK = new Set<string>();

// Jawaban server yang berarti detail sudah diambil sebelumnya, bukan gagal. Sebagian lowongan memang tidak punya judul
// kualifikasi di halamannya (sapuan 24 lowongan, 20 November 2026), sehingga requirements tetap kosong walau deskripsi lengkap.
const DETAIL_SETTLED_REASONS = new Set(["sudah lengkap", "tidak ada data baru"]);

type DetailState ={ phase: "idle" } | { phase: "loading" } | { phase: "failed"; note: string };
type BenchmarkState = { phase: "idle" } | { phase: "loading" } | { phase: "ready"; data: SalaryBenchmarkResult } | { phase: "unavailable" };

export function JobCard({ job, match, matchUnavailable, isSaved, onToggleSave, onApply, onJobUpdated, detailAttempts = DETAIL_ATTEMPTS_FALLBACK }: {
  job: JobData;
  /** Per-user match (lib/matchScore.ts); null while it is being worked out or when the profile could not be read. */
  match: JobMatch | null;
  /** Why `match` is null, when it is not just loading. */
  matchUnavailable?: string;
  isSaved: boolean;
  onToggleSave: () => void;
  onApply: () => void;
  /** Called with the job row after the server filled in its full detail, so the page can replace it and recompute the match. */
  onJobUpdated?: (job: JobData) => void;
  /** Page-level set of job ids whose detail was already requested, so a collapsed and re-opened card never asks twice. */
  detailAttempts?: Set<string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAllRequirements, setShowAllRequirements] = useState(false);
  const [detail, setDetail] = useState<DetailState>({ phase: "idle" });
  const [detailRetry, setDetailRetry] = useState(0);
  const [bench, setBench] = useState<BenchmarkState>({ phase: "idle" });
  const benchRequested = useRef(false);

  // First time the card is opened: JobStreet and Dealls rows only hold a teaser, so the server fetches the full
  // posting (description, requirements, salary). Once per job id; Glints cannot be fetched (see GLINTS_DETAIL_NOTE).
  // Cards whose detail is already complete are checked too, silently: only the source page knows whether the posting
  // was closed (the server then sets status "closed" and the card says so).
  useEffect(() => {
    if (!expanded || !shouldCheckSource(job) || detailAttempts.has(job.id)) return;
    detailAttempts.add(job.id);
    const showProgress = needsDetail(job);
    if (showProgress) setDetail({ phase: "loading" });
    (async () => {
      try {
        const res = await automationApi.enrichJob(job.id);
        const merged = res?.job ? mergeJobUpdate(job, res.job) : null;
        if (!res) {
          setDetail({ phase: "idle" });
        } else if (merged && isClosedJob(merged)) {
          onJobUpdated?.(merged);
          setDetail({ phase: "idle" });
        } else if (!showProgress) {
          if (merged && res.enriched) onJobUpdated?.(merged);
          setDetail({ phase: "idle" });
        } else if (merged && (res.enriched || !isThinDetail(merged) || DETAIL_SETTLED_REASONS.has(String(res.reason ?? "")))) {
          // Uji klik 20 November 2026: server menjawab enriched:false "sudah lengkap" karena percobaan sebelumnya
          // sudah menyimpan detailnya. Baris lengkap yang dikirim balik tetap dipakai, bukan dianggap gagal.
          onJobUpdated?.(merged);
          setDetail({ phase: "idle" });
        } else {
          setDetail({ phase: "failed", note: enrichFailureNote(res.reason) });
        }
      } catch (err) {
        console.error("Error enriching job:", err);
        setDetail(showProgress ? { phase: "failed", note: enrichFailureNote() } : { phase: "idle" });
      }
    })();
  }, [expanded, job.id, detailRetry]);

  // Gagal karena jaringan atau server (misalnya 503 saat layanan login tidak terjangkau) bisa dicoba lagi.
  const retryDetail = () => {
    detailAttempts.delete(job.id);
    setDetailRetry((n) => n + 1);
  };

  // Salary comparison with similar postings: fetched when the card is first opened, once per card.
  useEffect(() => {
    if (!expanded || benchRequested.current) return;
    benchRequested.current = true;
    setBench({ phase: "loading" });
    (async () => {
      try {
        const res = await automationApi.getSalaryBenchmark(job.id);
        setBench(res ? { phase: "ready", data: res } : { phase: "unavailable" });
      } catch (err) {
        console.error("Error loading salary benchmark:", err);
        setBench({ phase: "unavailable" });
      }
    })();
  }, [expanded, job.id]);

  const salary = salaryText(job);
  const benchView = bench.phase === "ready" ? benchmarkView(job, bench.data) : null;
  // "idle" counts as loading: the card is only open after the effect above has had its turn.
  const benchLoading = bench.phase === "idle" || bench.phase === "loading";
  const detailLoading = detail.phase === "loading";
  const thinDetail = isThinDetail(job);
  const closed = isClosedJob(job);
  const channelInfo = classifyJobChannel(job);
  const channelPillClass =
    channelInfo.badgeTone === "ats"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : channelInfo.badgeTone === "email"
        ? "bg-blue-50 text-blue-800 border-blue-200"
        : channelInfo.badgeTone === "manual"
          ? "bg-amber-50 text-amber-900 border-amber-200"
          : "bg-[#EEF4FF] text-[#0A5BE0] border-[#0A5BE0]/20";

  // A row from the job sources has none of the AI analysis (see lib/jobCardData.ts): show only what exists.
  // The skill chart below comes from `match` (computeMatch); skill_matches is only an extra source when present.
  const radarSkills = radarFromMatches(job.skill_matches);
  const breakdown = matchBreakdown(match);
  const skillGaps = listOrEmpty<SkillGap>(job.skill_gaps);
  const aiActions = listOrEmpty<AIAction>(job.ai_actions);
  const requirements = listOrEmpty<string>(job.requirements);
  const responsibilities = listOrEmpty<string>(job.responsibilities);
  const benefits = listOrEmpty<string>(job.benefits);
  const cleanedDescription = cleanJobDescription(job.description);
  const visibleRequirements = showAllRequirements ? requirements : requirements.slice(0, 4);
  // The score is per user (skills in the profile against skills the posting names), never jobs.match_score, which is
  // one global number. Acceptance, culture and growth scores are not shown: no flow measures them for anyone.
  const matchScore = match?.score ?? null;
  const posted = postedDate(job as { posted_at?: unknown; created_at?: unknown });

  const matchColor = (matchScore ?? 0) >= HIGH_MATCH_THRESHOLD ? "#22C55E" : (matchScore ?? 0) >= 50 ? "#0A5BE0" : "#F59E0B";

  return (
    <div className="rounded-2xl border-2 border-[#999999] bg-white overflow-hidden hover:border-[#0A5BE0] transition-colors">
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-bold text-lg truncate">{job.title}</h3>
              {matchScore !== null && matchScore >= HIGH_MATCH_THRESHOLD && (
                <span className="shrink-0 inline-flex items-center gap-1 text-xs bg-[#D2F801] text-[#16150F] px-2 py-0.5 rounded-full font-semibold">
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                  {isProvisionalMatch(job) ? "Cocok (perkiraan)" : JOB_LABELS.card.matchBadge}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                {job.company}
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {job.location}
              </span>
              <span className="inline-flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5" />
                {jobTypeLabel(job.type)}
              </span>
              {job.workplace_type && (
                <span className="inline-flex items-center gap-1">
                  <Zap className="h-3.5 w-3.5" />
                  {workplaceLabel(job.workplace_type)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleSave}
              aria-pressed={isSaved}
              aria-label={isSaved ? `Hapus ${job.title} dari lowongan tersimpan` : `Simpan lowongan ${job.title}`}
              className="h-11 w-11 rounded-lg border border-[#999999] grid place-items-center hover:border-[#0A5BE0] transition"
            >
              {isSaved ? (
                <BookmarkCheck className="h-4 w-4 text-[#0A5BE0]" aria-hidden="true" />
              ) : (
                <Bookmark className="h-4 w-4 text-[#666666]" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Match: a percentage with its basis ("N dari M skill cocok"), or a dash with the reason it is missing. */}
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-[#E0E0E0]">
          <CircularProgress
            value={matchScore}
            label={JOB_LABELS.card.matchLabel}
            color={matchColor}
            size={70}
            title="Persentase skill yang disebut lowongan dan ada di profilmu. Tanda — berarti belum bisa dihitung."
          />
          <div className="min-w-0 text-sm">
            {match === null ? (
              <p className="text-muted-foreground" role={matchUnavailable ? "alert" : "status"}>
                {matchUnavailable ?? "Menghitung kecocokan..."}
              </p>
            ) : match.status === "no-profile-skills" ? (
              <Link to="/profile" className="inline-flex min-h-11 items-center font-medium text-[#0A5BE0] underline underline-offset-4">
                {NO_PROFILE_SKILLS_TEXT}
              </Link>
            ) : (
              <>
                <p
                  className="font-medium"
                  title={match.matched.length > 0 ? `Cocok: ${match.matched.join(", ")}` : undefined}
                >
                  {matchCaption(match)}
                </p>
                {match.status === "ok" && (
                  <p className="text-xs text-muted-foreground">{JOB_LABELS.card.matchBasis}</p>
                )}
                {match.status === "ok" && isProvisionalMatch(job) && (
                  <p className="text-xs text-[#92400E]">{PROVISIONAL_MATCH_NOTE}</p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Salary & Platform */}
        <div className="flex items-center justify-between mt-4 text-sm">
          <div className="inline-flex items-center gap-1.5 text-[#0A5BE0] font-semibold">
            <DollarSign className="h-4 w-4" />
            {salary ?? JOB_LABELS.card.salaryMissing}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <span
              className={`text-xs font-medium border px-2 py-0.5 rounded-full ${channelPillClass}`}
              title={channelInfo.reason}
            >
              {channelInfo.badgeLabel}
            </span>
            <span className="text-xs text-muted-foreground bg-[#F5F5F5] px-2 py-1 rounded-full">
              {JOB_LABELS.card.sourcePrefix} {platformLabel(job.platform_source)}
            </span>
            {posted && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {posted.toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Expandable Content */}
      {expanded && (
        <div className="border-t border-[#E0E0E0] p-5 space-y-6">
          {closed && (
            <p role="alert" className="rounded-xl bg-[#FEE2E2] p-3 text-sm font-medium text-[#991B1B]">
              {CLOSED_JOB_NOTE}
            </p>
          )}
          {/* Detail lengkap dari situs asal: status pengambilan, atau alasan bila tidak bisa */}
          {detailLoading && (
            <p role="status" className="flex items-center gap-2 rounded-xl bg-[#F5F5F5] p-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-[#0A5BE0]" aria-hidden="true" />
              Mengambil detail lengkap dari {platformLabel(job.platform_source)}...
            </p>
          )}
          {detail.phase === "failed" && (
            <p role="status" className="rounded-xl bg-[#FEF3C7] p-3 text-sm text-[#92400E]">
              {detail.note}{" "}
              <button type="button" onClick={retryDetail} className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
                Coba lagi
              </button>
              {job.external_url && (
                <>
                  {" "}
                  <a href={job.external_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
                    Buka di situs asal
                  </a>
                </>
              )}
            </p>
          )}
          {needsGlintsNote(job) && (
            <p className="rounded-xl bg-[#F5F5F5] p-3 text-sm text-muted-foreground">
              {GLINTS_DETAIL_NOTE}
              {job.external_url && (
                <>
                  {" "}
                  <a href={job.external_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-medium text-[#0A5BE0] underline underline-offset-4">
                    Buka di situs asal
                  </a>
                </>
              )}
            </p>
          )}

          {/* Ringkasan & detail lowongan */}
          {(cleanedDescription || responsibilities.length > 0 || benefits.length > 0) && (
            <div className="space-y-4">
              {cleanedDescription && (
                <div>
                  <h4 className="text-sm font-semibold mb-1.5">Deskripsi Pekerjaan</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                    {cleanedDescription}
                  </p>
                </div>
              )}
              {responsibilities.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-1.5">Tanggung Jawab</h4>
                  <ul className="space-y-1">
                    {responsibilities.map((item, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#0A5BE0] shrink-0" aria-hidden="true" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {benefits.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-1.5">Benefit &amp; Fasilitas</h4>
                  <ul className="flex flex-wrap gap-1.5">
                    {benefits.map((b, i) => (
                      <li key={i} className="text-xs rounded-full border border-[#E0E0E0] bg-[#F5F5F5] px-2.5 py-1 text-[#16150F]">
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* AI Strategy */}
          {job.ai_strategy && (
            <div className="rounded-xl bg-[#0A5BE0]/5 border border-[#0A5BE0]/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="h-4 w-4 text-[#0A5BE0]" />
                <span className="font-semibold text-sm">{JOB_LABELS.card.strategy}</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{job.ai_strategy}</p>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            {/* Skill Radar */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <Target className="h-4 w-4 text-[#0A5BE0]" />
                {JOB_LABELS.card.skillAnalysis}
              </h4>
              {match?.status === "ok" && (
                <div className="mb-3 space-y-2">
                  {match.matched.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-green-700">{JOB_LABELS.card.skillsMatched}</p>
                      <ul className="flex flex-wrap gap-1.5" aria-label={JOB_LABELS.card.skillsMatched}>
                        {match.matched.map((s) => (
                          <li key={s} className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-800">{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {match.missing.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-[#92400E]">{JOB_LABELS.card.skillsMissing}</p>
                      <ul className="flex flex-wrap gap-1.5" aria-label={JOB_LABELS.card.skillsMissing}>
                        {match.missing.map((s) => (
                          <li key={s} className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-xs text-[#92400E]">{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              {breakdown && <MatchDonut breakdown={breakdown} />}
              {radarSkills && <RadarChart skills={radarSkills} />}
              {!breakdown && !radarSkills && (
                <p className="text-xs text-muted-foreground" role={match === null && matchUnavailable ? "alert" : "status"}>
                  {skillAnalysisNote({
                    status: match?.status ?? null,
                    unavailable: matchUnavailable,
                    loadingDetail: detailLoading,
                    thinDetail,
                  })}
                </p>
              )}
              {skillGaps.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-[#F59E0B] mb-1.5 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {JOB_LABELS.card.skillGaps}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {skillGaps.map((gap, i) => (
                      <span key={i} className="text-xs bg-[#FEF3C7] text-[#92400E] px-2 py-0.5 rounded-full">
                        {gap.skill} ({gap.user_level}/{gap.required_level})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Salary Benchmark */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-[#0A5BE0]" />
                {JOB_LABELS.card.salaryBenchmark}
              </h4>
              {benchLoading && (
                <p role="status" className="text-xs text-muted-foreground">Memuat pembanding gaji...</p>
              )}
              {benchView?.kind === "compare" && (
                <div className="space-y-3">
                  <BenchmarkBar view={benchView} />
                  <p className="text-sm leading-relaxed">{benchmarkText(benchView)}</p>
                </div>
              )}
              {benchView && benchView.kind !== "compare" && (
                <p className="text-sm leading-relaxed">{benchmarkText(benchView)}</p>
              )}
              {!benchView && !benchLoading && (
                job.salary_min && job.salary_max && job.salary_benchmark ? (
                  // Fallback: the salary_benchmark column, only demo rows carry it (see lib/jobCardData.ts).
                  <div className="space-y-3">
                    <SalaryBar
                      current={(job.salary_min + job.salary_max) / 2}
                      marketAvg={job.salary_benchmark.market_average}
                      marketHigh={job.salary_benchmark.market_high}
                      marketLow={job.salary_benchmark.market_low}
                    />
                    <div className="flex items-center justify-between text-xs bg-[#F5F5F5] p-3 rounded-lg">
                      <span>
                        <span className="text-muted-foreground mr-1">{JOB_LABELS.card.percentile}</span>
                        <span className="text-[#0A5BE0] font-bold text-lg">{job.salary_benchmark.percentile}</span>
                      </span>
                      <span className="text-muted-foreground">{marketPositionLabel(job.salary_benchmark.percentile)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Pembanding gaji belum tersedia untuk lowongan ini.</p>
                )
              )}
            </div>
          </div>

          {/* AI Action Timeline */}
          {aiActions.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <Bot className="h-4 w-4 text-[#0A5BE0]" />
                {JOB_LABELS.card.plan}
              </h4>
              <div className="space-y-0">
                {aiActions.map((action, i) => (
                  <TimelineItem key={i} action={action} isLast={i === aiActions.length - 1} />
                ))}
              </div>
            </div>
          )}

          {/* Requirements Preview */}
          {requirements.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">{JOB_LABELS.card.requirements}</h4>
              <ul className="space-y-1.5">
                {visibleRequirements.map((req, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#0A5BE0] mt-0.5 shrink-0" />
                    {req}
                  </li>
                ))}
              </ul>
              {requirements.length > 4 && (
                <button
                  type="button"
                  onClick={() => setShowAllRequirements((v) => !v)}
                  className="mt-2 min-h-11 inline-flex items-center text-xs font-semibold text-[#0A5BE0] hover:underline"
                >
                  {showAllRequirements ? "Tampilkan lebih sedikit" : `Lihat semua persyaratan (${requirements.length})`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Footer Actions */}
      <div className="border-t border-[#E0E0E0] p-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="min-h-11 px-4 rounded-lg border border-[#999999] text-sm font-medium hover:border-[#0A5BE0] transition flex items-center gap-1.5"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-4 w-4" />
              {JOB_LABELS.card.collapse}
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              {JOB_LABELS.card.seeDetail}
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={closed}
          className="flex-1 min-h-11 rounded-lg bg-[#0A5BE0] text-white text-sm font-semibold hover:opacity-90 transition flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:bg-[#999999] disabled:hover:opacity-100"
        >
          <Send className="h-4 w-4" />
          {closed ? JOB_LABELS.card.closed : JOB_LABELS.card.apply}
        </button>
        {job.external_url && (
          <a
            href={job.external_url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Buka lowongan ${job.title} di situs asal (tab baru)`}
            className="h-11 w-11 shrink-0 rounded-lg border border-[#999999] grid place-items-center hover:border-[#0A5BE0] transition"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  );
}
