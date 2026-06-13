import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft, Wallet, Smartphone, QrCode, ShieldCheck, Lock,
  CheckCircle2, Loader2, Copy, AlertCircle, Sparkles, X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  PLAN_PRICE,
  activateSubscription,
  type PlanTier,
  type PaymentMethod,
} from "@/lib/subscriptionStore";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

type PaymentSearch = {
  plan?: PlanTier;
};

export const Route = createFileRoute("/payment")({
  validateSearch: (input: Record<string, unknown>): PaymentSearch => ({
    plan: (input.plan as PlanTier) || undefined,
  }),
  beforeLoad: async () => {
    if (isMockMode()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Pembayaran — Applify" }] }),
  component: PaymentPage,
});

import { supabase } from "@/lib/supabase";

interface MethodInfo {
  id: PaymentMethod;
  name: string;
  tagline: string;
  icon: typeof Wallet;
  badge?: string;
  recommended?: boolean;
  brand: { bg: string; text: string; logo: string };
}

const METHODS: MethodInfo[] = [
  {
    id: "gopay",
    name: "GoPay",
    tagline: "Bayar dari aplikasi Gojek",
    icon: Smartphone,
    badge: "Populer",
    recommended: true,
    brand: { bg: "bg-[#00AED6]", text: "text-white", logo: "Gopay" },
  },
  {
    id: "ovo",
    name: "OVO",
    tagline: "Saldo OVO atau OVO Premier",
    icon: Wallet,
    brand: { bg: "bg-[#4F2D7F]", text: "text-white", logo: "OVO" },
  },
  {
    id: "dana",
    name: "DANA",
    tagline: "Dompet digital DANA",
    icon: Wallet,
    brand: { bg: "bg-[#118EEA]", text: "text-white", logo: "DANA" },
  },
  {
    id: "qris",
    name: "QRIS",
    tagline: "Scan QR dari aplikasi bank / e-wallet",
    icon: QrCode,
    brand: { bg: "bg-[#16150F]", text: "text-[#D2F801]", logo: "QRIS" },
  },
];

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

function PaymentPage() {
  const { plan } = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selected, setSelected] = useState<PaymentMethod | null>(null);
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState<"choose" | "instruct">("choose");

  const tier: PlanTier = plan ?? "pro";
  const price = PLAN_PRICE[tier];

  useEffect(() => {
    if (!plan) {
      navigate({ to: "/subscription" });
    }
  }, [plan, navigate]);

  const onConfirm = async () => {
    if (!selected) return;
    setProcessing(true);
    await new Promise((r) => setTimeout(r, 1400));
    const result = activateSubscription(tier, selected);
    setProcessing(false);
    navigate({
      to: "/payment/success",
      search: { txn: result.transactionId ?? "" },
    } as any);
  };

  const currentMethod = METHODS.find((m) => m.id === selected) ?? null;

  return (
    <div className="min-h-screen bg-[#F4F1E8]">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-[#F4F1E8]/85 border-b border-[color:var(--border)]">
        <div className="max-w-5xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <Link to="/subscription" className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg gradient-primary text-white font-bold">A</div>
            <span className="text-lg font-bold">Applify</span>
          </Link>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            Pembayaran aman & terenkripsi
          </div>
        </div>
      </header>

      {/* Stepper */}
      <div className="max-w-5xl mx-auto px-4 md:px-8 pt-6">
        <div className="flex items-center gap-2 text-xs">
          {["Pilih Paket", "Pembayaran", "Konfirmasi"].map((label, i) => {
            const active = i === 1;
            const done = i === 0;
            return (
              <div key={label} className="flex items-center gap-2">
                <div
                  className={`h-6 w-6 rounded-full grid place-items-center text-[10px] font-bold ${
                    done
                      ? "bg-[#1C9656] text-white"
                      : active
                      ? "bg-[#0A5BE0] text-white"
                      : "bg-black/[8%] text-muted-foreground"
                  }`}
                >
                  {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span className={active ? "font-semibold text-foreground" : "text-muted-foreground"}>{label}</span>
                {i < 2 && <span className="w-6 h-px bg-[color:var(--border)] mx-1" />}
              </div>
            );
          })}
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 md:px-8 py-8 grid lg:grid-cols-[1fr_320px] gap-6">
        {/* Left: method picker / instructions */}
        <section>
          <button
            onClick={() => (step === "instruct" ? setStep("choose") : navigate({ to: "/subscription" }))}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {step === "instruct" ? "Ganti metode" : "Kembali pilih paket"}
          </button>

          {step === "choose" && (
            <>
              <h1 className="font-display text-2xl md:text-3xl font-extrabold tracking-tight">
                Pilih metode pembayaran
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Semua metode mendukung pembayaran instan. QRIS cocok kalau kamu tidak punya e-wallet spesifik.
              </p>

              <div className="mt-6 grid sm:grid-cols-2 gap-3">
                {METHODS.map((m) => {
                  const active = selected === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setSelected(m.id)}
                      className={`group text-left glass rounded-2xl p-4 transition relative ${
                        active ? "ring-2 ring-[#0A5BE0] bg-white" : "hover:bg-white"
                      }`}
                    >
                      {m.recommended && (
                        <span className="absolute -top-2 right-3 inline-flex items-center gap-1 h-5 px-2 rounded-full bg-[#D2F801] text-[#16150F] text-[10px] font-bold uppercase tracking-wider">
                          <Sparkles className="h-2.5 w-2.5" /> {m.badge}
                        </span>
                      )}
                      <div className="flex items-center gap-3">
                        <div className={`h-12 w-12 rounded-xl grid place-items-center font-display font-extrabold ${m.brand.bg} ${m.brand.text}`}>
                          <span className="text-sm">{m.brand.logo}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-bold">{m.name}</p>
                            {active && <CheckCircle2 className="h-4 w-4 text-[#0A5BE0]" />}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{m.tagline}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 flex items-center gap-3 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-[#1C9656]" />
                Transaksi diproses via payment gateway tersertifikasi. Applify tidak menyimpan data kartu / saldo.
              </div>

              <button
                onClick={() => setStep("instruct")}
                disabled={!selected}
                className="mt-6 w-full h-12 rounded-xl gradient-primary text-white font-semibold text-sm hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                Lanjut ke Pembayaran
              </button>
            </>
          )}

          {step === "instruct" && currentMethod && (
            <PaymentInstructions
              method={currentMethod}
              amount={price.amount}
              tierName={price.label}
              processing={processing}
              onConfirm={onConfirm}
              onCancel={() => setStep("choose")}
            />
          )}
        </section>

        {/* Right: order summary */}
        <aside className="lg:sticky lg:top-24 h-fit">
          <div className="glass rounded-2xl p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground font-bold">Ringkasan Pesanan</p>
            <div className="mt-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg grid place-items-center bg-[#0A5BE0] text-white">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="font-bold capitalize">Paket {tier}</p>
                <p className="text-xs text-muted-foreground">
                  {tier === "pro" && "Perpanjang otomatis tiap bulan"}
                  {tier === "kampus" && "Lisensi 1 semester (6 bulan)"}
                  {tier === "free" && "Tanpa biaya"}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-2 text-sm border-t border-[color:var(--border)] pt-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paket</span>
                <span className="font-semibold capitalize">{tier}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Periode</span>
                <span className="font-semibold">{price.period.replace("/", "")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Metode</span>
                <span className="font-semibold">{currentMethod?.name ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Login</span>
                <span className="font-mono text-xs truncate max-w-[140px]">{user?.email ?? "demo@applify.id"}</span>
              </div>
            </div>

            <div className="mt-5 border-t border-[color:var(--border)] pt-4 flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="font-display text-2xl font-extrabold">{formatRupiah(price.amount)}</span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-3 w-3 text-[#1C9656]" /> PCI-DSS
              </div>
              <div className="flex items-center gap-1.5">
                <Lock className="h-3 w-3 text-[#1C9656]" /> TLS 1.3
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

function PaymentInstructions({
  method,
  amount,
  tierName,
  processing,
  onConfirm,
  onCancel,
}: {
  method: MethodInfo;
  amount: number;
  tierName: string;
  processing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const vaNumber = "8808" + Math.floor(10000000 + Math.random() * 89999999);
  const deeplink = `applify://pay?method=${method.id}&amount=${amount}`;
  const formatted = formatRupiah(amount);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div>
      <h1 className="font-display text-2xl md:text-3xl font-extrabold tracking-tight">
        Selesaikan pembayaran via {method.name}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Total tagihan <span className="font-bold text-foreground">{tierName}</span> · jatuh tempo dalam 15 menit.
      </p>

      <div className="mt-6 glass rounded-2xl p-6">
        {method.id === "qris" ? (
          <div className="flex flex-col items-center text-center">
            <div className="relative h-56 w-56 rounded-2xl bg-white p-4 border-2 border-[color:var(--border)]">
              <QrPattern />
              <div className="absolute inset-0 grid place-items-center">
                <div className="h-10 w-10 rounded-lg gradient-primary grid place-items-center text-white font-bold text-sm">A</div>
              </div>
            </div>
            <p className="mt-4 text-sm font-semibold">Scan QR dengan aplikasi e-wallet / bank</p>
            <p className="text-xs text-muted-foreground mt-1">
              GoPay, OVO, DANA, ShopeePay, LinkAja, m-banking semua support QRIS.
            </p>
          </div>
        ) : method.id === "gopay" || method.id === "ovo" || method.id === "dana" ? (
          <div className="space-y-4">
            <div className="rounded-xl border-2 border-[color:var(--border)] bg-white p-4 flex items-center gap-3">
              <div className={`h-12 w-12 rounded-xl grid place-items-center font-display font-extrabold ${method.brand.bg} ${method.brand.text}`}>
                <span className="text-sm">{method.brand.logo}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Buka aplikasi {method.name}</p>
                <p className="font-mono text-sm truncate">applify://pay?method={method.id}</p>
              </div>
              <button
                onClick={() => copy(deeplink)}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border-2 border-[color:var(--border)] bg-white text-xs font-semibold hover:bg-black/[3%] transition"
              >
                {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-[#1C9656]" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Tersalin" : "Salin"}
              </button>
            </div>

            <ol className="text-sm space-y-2 list-decimal pl-5 text-muted-foreground">
              <li>Tekan tombol <span className="font-semibold text-foreground">"Konfirmasi & Bayar"</span> di bawah.</li>
              <li>Aplikasi <span className="font-semibold text-foreground">{method.name}</span> akan terbuka otomatis.</li>
              <li>Konfirmasi pembayaran <span className="font-semibold text-foreground">{tierName}</span> di aplikasi.</li>
              <li>Kamu akan kembali ke halaman konfirmasi Applify.</li>
            </ol>
          </div>
        ) : null}

        <div className="mt-6 rounded-xl bg-[#0A5BE0]/5 border border-[#0A5BE0]/20 p-3 text-xs text-muted-foreground flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 text-[#0A5BE0] mt-0.5 shrink-0" />
          <span>
            <span className="font-semibold text-foreground">Mode demo:</span> tidak ada transaksi nyata.
            Untuk produksi, halaman ini akan di-embed dengan Midtrans Snap / Xendit.
          </span>
        </div>
      </div>

      <div className="mt-6 grid sm:grid-cols-[1fr_auto] gap-3">
        <button
          onClick={onCancel}
          disabled={processing}
          className="h-12 px-5 rounded-xl border-2 border-[color:var(--border)] bg-white text-sm font-semibold hover:bg-black/[3%] transition disabled:opacity-60"
        >
          Ganti Metode
        </button>
        <button
          onClick={onConfirm}
          disabled={processing}
          className="h-12 px-6 rounded-xl gradient-primary text-white font-semibold text-sm hover:opacity-90 transition disabled:opacity-60 inline-flex items-center justify-center gap-2 min-w-[200px]"
        >
          {processing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Memproses…
            </>
          ) : (
            <>Konfirmasi & Bayar {formatted}</>
          )}
        </button>
      </div>
    </div>
  );
}

function QrPattern() {
  // Decorative mock QR pattern — not scannable
  const cells = 21;
  const filled = (i: number, j: number) => {
    const seed = (i * 31 + j * 17 + 7) % 7;
    return seed < 3;
  };
  return (
    <svg viewBox={`0 0 ${cells} ${cells}`} className="h-full w-full">
      {Array.from({ length: cells }).map((_, i) =>
        Array.from({ length: cells }).map((_, j) => {
          const corner =
            (i < 7 && j < 7) || (i < 7 && j > cells - 8) || (i > cells - 8 && j < 7);
          if (corner) return null;
          if (!filled(i, j)) return null;
          return <rect key={`${i}-${j}`} x={j} y={i} width={1} height={1} fill="#16150F" />;
        })
      )}
      {[
        [0, 0],
        [0, cells - 7],
        [cells - 7, 0],
      ].map(([y, x]) => (
        <g key={`${x}-${y}`}>
          <rect x={x} y={y} width={7} height={7} fill="#16150F" />
          <rect x={x + 1} y={y + 1} width={5} height={5} fill="#F4F1E8" />
          <rect x={x + 2} y={y + 2} width={3} height={3} fill="#16150F" />
        </g>
      ))}
    </svg>
  );
}
