import { Sparkles, ShieldCheck, Layers, Bot, Building2, FileText } from "lucide-react";

// Visual contract: docs/design/hitl-approval-flow.md
// A draft letter travels along the human-in-the-loop track. The gate (index 1) is the only
// step that waits for the user, so it pulses while the letter sits there.

const STEPS = [
  { key: "draft", label: "Draf AI", icon: Sparkles },
  { key: "gate", label: "Persetujuanmu", icon: ShieldCheck },
  { key: "queue", label: "Antrean", icon: Layers },
  { key: "agent", label: "Agen isi form", icon: Bot },
  { key: "sent", label: "Terkirim", icon: Building2 },
] as const;

export type HitlStage = (typeof STEPS)[number]["key"];

interface HitlTrackProps {
  stage: HitlStage;
  /** Short caption under the track, e.g. where the letter is waiting. */
  caption?: string;
  className?: string;
}

export function HitlTrack({ stage, caption, className = "" }: HitlTrackProps) {
  const current = STEPS.findIndex((s) => s.key === stage);
  const letterLeft = `${(current / (STEPS.length - 1)) * 100}%`;

  return (
    <div className={`rounded-2xl border-2 border-[#16150F]/10 bg-[#F4F1E8] px-5 pt-9 pb-4 ${className}`}>
      <div className="relative">
        {/* the letter: slides to the current step */}
        <div
          className="absolute -top-8 -translate-x-1/2 transition-[left] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ left: letterLeft }}
          aria-hidden
        >
          <div className="animate-dbBotIdle flex items-center gap-1 rounded-md border-2 border-[#16150F] bg-white px-1.5 py-0.5 shadow-[2px_2px_0_#16150F]">
            <FileText className="h-3 w-3 text-[#16150F]" />
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#16150F]">CL</span>
          </div>
        </div>

        <ol aria-label="Alur persetujuan lamaran" className="relative flex items-start justify-between">
          {/* flowing connector behind the nodes */}
          <svg className="pointer-events-none absolute left-4 right-4 top-4 h-1 w-[calc(100%-2rem)]" preserveAspectRatio="none" aria-hidden>
            <line x1="0" y1="2" x2="100%" y2="2" stroke="#16150F" strokeOpacity="0.25" strokeWidth="2" className="path-flow animate-dbDataFlow" />
          </svg>

          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const done = i < current;
            const active = i === current;
            const isGate = step.key === "gate";
            return (
              <li key={step.key} aria-current={active ? "step" : undefined} className="relative z-10 flex w-12 flex-col items-center gap-1.5 text-center sm:w-16">
                <span className="relative grid h-8 w-8 place-items-center">
                  {active && (
                    <span className="animate-dbPingSubtle absolute inset-0 rounded-full bg-[#D2F801]" aria-hidden />
                  )}
                  <span
                    className={`relative grid h-8 w-8 place-items-center rounded-full border-2 transition-colors duration-500 ${
                      active
                        ? isGate
                          ? "border-[#16150F] bg-[#16150F] text-[#D2F801]"
                          : "border-[#16150F] bg-[#D2F801] text-[#16150F]"
                        : done
                          ? "border-[#0A5BE0] bg-[#0A5BE0] text-white"
                          : "border-[#16150F]/20 bg-white text-[#16150F]/35"
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                </span>
                {/* on narrow screens only the active step keeps its label (the others stay readable via sr-only) */}
                {!active && <span className="sr-only sm:hidden">{step.label}</span>}
                <span
                  className={`whitespace-nowrap text-xs leading-tight font-semibold ${
                    active ? "text-[#16150F]" : done ? "text-[#0A5BE0]" : "text-[#16150F]/40"
                  } ${active ? "" : "hidden sm:block"}`}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      {caption && <p className="mt-3 text-center text-xs text-[#16150F]/70">{caption}</p>}
    </div>
  );
}
