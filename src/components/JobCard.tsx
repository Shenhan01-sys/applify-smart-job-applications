import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { platformLabel } from "@/lib/platforms";
import { listOrEmpty, postedDate, radarFromMatches } from "@/lib/jobCardData";
import { HIGH_MATCH_THRESHOLD, NO_PROFILE_SKILLS_TEXT, matchCaption, type JobMatch } from "@/lib/matchScore";
import { JOB_LABELS, jobTypeLabel, marketPositionLabel, salaryPeriodLabel, workplaceLabel } from "@/lib/jobLabels";
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

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function JobCard({ job, match, matchUnavailable, isSaved, onToggleSave, onApply }: {
  job: JobData;
  /** Per-user match (lib/matchScore.ts); null while it is being worked out or when the profile could not be read. */
  match: JobMatch | null;
  /** Why `match` is null, when it is not just loading. */
  matchUnavailable?: string;
  isSaved: boolean;
  onToggleSave: () => void;
  onApply: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const salaryText = job.salary_min && job.salary_max
    ? `${formatCurrency(job.salary_min)} - ${formatCurrency(job.salary_max)}`
    : JOB_LABELS.card.salaryMissing;

  // A row from the job sources has none of the AI analysis (see lib/jobCardData.ts): show only what exists.
  const radarSkills = radarFromMatches(job.skill_matches);
  const skillGaps = listOrEmpty<SkillGap>(job.skill_gaps);
  const aiActions = listOrEmpty<AIAction>(job.ai_actions);
  const requirements = listOrEmpty<string>(job.requirements);
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
                  {JOB_LABELS.card.matchBadge}
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
              </>
            )}
          </div>
        </div>

        {/* Salary & Platform */}
        <div className="flex items-center justify-between mt-4 text-sm">
          <div className="inline-flex items-center gap-1.5 text-[#0A5BE0] font-semibold">
            <DollarSign className="h-4 w-4" />
            {salaryText}
            {job.salary_min && job.salary_max && job.salary_period && (
              <span className="text-xs text-muted-foreground font-normal">/{salaryPeriodLabel(job.salary_period)}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
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
              {radarSkills ? (
                <RadarChart skills={radarSkills} />
              ) : match?.status !== "ok" ? (
                <p className="text-xs text-muted-foreground">Analisis kecocokan skill belum tersedia untuk lowongan ini.</p>
              ) : null}
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
              {job.salary_min && job.salary_max && job.salary_benchmark && (
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
                {requirements.slice(0, 4).map((req, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#0A5BE0] mt-0.5 shrink-0" />
                    {req}
                  </li>
                ))}
              </ul>
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
          className="flex-1 min-h-11 rounded-lg bg-[#0A5BE0] text-white text-sm font-semibold hover:opacity-90 transition flex items-center justify-center gap-2"
        >
          <Send className="h-4 w-4" />
          {JOB_LABELS.card.apply}
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
