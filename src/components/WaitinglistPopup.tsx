import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Sparkles, X, Rocket, Clock, ShieldCheck, ArrowRight } from "lucide-react";

const DISMISSED_KEY = "applify:waitinglist-dismissed";
const JOINED_KEY = "applify:waitinglist-joined";
const SHOW_DELAY_MS = 1800;

interface WaitinglistPopupProps {
  /** Optional delay override (ms) before popup appears. Default 1800. */
  delayMs?: number;
  /** If true, popup appears every page load (until joined). If false, only once per dismissed. */
  perSession?: boolean;
}

export function WaitinglistPopup({ delayMs = SHOW_DELAY_MS, perSession = true }: WaitinglistPopupProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(JOINED_KEY) === "1") return;
      if (window.localStorage.getItem(DISMISSED_KEY) === "1") return;
    } catch {}
    const t = window.setTimeout(() => setOpen(true), delayMs);
    return () => window.clearTimeout(t);
  }, [delayMs]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const dismiss = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(DISMISSED_KEY, perSession ? String(Date.now()) : "1");
    } catch {}
  };

  const onJoin = () => {
    setOpen(false);
    navigate({ to: "/waitinglist" });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center px-4 py-6 animate-popIn">
      <div
        className="absolute inset-0 bg-[#16150F]/60 backdrop-blur-sm"
        onClick={dismiss}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="waitinglist-popup-title"
        className="relative w-full max-w-md glass rounded-3xl overflow-hidden shadow-2xl animate-popUp"
      >
        {/* Accent gradient strip */}
        <div className="absolute inset-x-0 top-0 h-1 gradient-primary" aria-hidden="true" />

        {/* Close button */}
        <button
          onClick={dismiss}
          aria-label="Tutup"
          className="absolute top-3 right-3 h-8 w-8 rounded-lg grid place-items-center text-muted-foreground hover:bg-black/[5%] hover:text-foreground transition z-10"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-6 md:p-7">
          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-[#D2F801] text-[#16150F] text-[10px] font-bold uppercase tracking-wider">
            <Sparkles className="h-3 w-3" /> Early Access
          </div>

          {/* Heading */}
          <h2
            id="waitinglist-popup-title"
            className="mt-3 font-display text-2xl md:text-3xl font-extrabold tracking-tight leading-tight"
          >
            Mau <span className="text-gradient-primary">akses duluan</span>?
          </h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Applify lagi pre-launch. Daftarkan diri — dapat bonus 1 bulan Pro gratis saat kami rilis.
          </p>

          {/* Benefits */}
          <ul className="mt-4 space-y-2 text-sm">
            {[
              "Akses eksklusif sebelum publik",
              "Bonus 1 bulan Pro gratis",
              "Pilih lowongan yang sesuai goals",
            ].map((b) => (
              <li key={b} className="flex items-start gap-2">
                <div className="mt-0.5 h-4 w-4 rounded-full bg-[#1C9656]/15 grid place-items-center shrink-0">
                  <ShieldCheck className="h-2.5 w-2.5 text-[#1C9656]" />
                </div>
                <span>{b}</span>
              </li>
            ))}
          </ul>

          {/* Tiny urgency */}
          <div className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Kuota early access terbatas untuk 500 pendaftar pertama.
          </div>

          {/* CTAs */}
          <div className="mt-5 flex flex-col sm:flex-row gap-2">
            <button
              onClick={onJoin}
              className="flex-1 h-11 rounded-xl gradient-primary text-white font-semibold text-sm hover:opacity-90 transition inline-flex items-center justify-center gap-1.5"
            >
              <Rocket className="h-4 w-4" />
              Gabung Waitinglist
            </button>
            <button
              onClick={dismiss}
              className="h-11 px-4 rounded-xl border-2 border-[color:var(--border)] bg-white text-sm font-semibold hover:bg-black/[3%] transition"
            >
              Nanti saja
            </button>
          </div>

          <p className="mt-3 text-[11px] text-muted-foreground text-center">
            Klik "Gabung" untuk isi formulir singkat. 30 detik saja.
          </p>
        </div>
      </div>
    </div>
  );
}
