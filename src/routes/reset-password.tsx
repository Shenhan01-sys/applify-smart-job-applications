import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { describeAuthError } from "@/lib/authErrors";
import { hasRecoveryUrlParams } from "@/lib/resetPasswordGuard";
import { PASSWORD_POLICY_HINT, passwordPolicyError } from "@/lib/passwordPolicy";
import { Lock, Eye, EyeOff, Loader2 } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Kata Sandi Baru — Applify" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  // 'checking' = menunggu Supabase membaca tautan pemulihan; 'ready' = ada sesi pemulihan; 'invalid' = tautan tidak berlaku
  const [state, setState] = useState<"checking" | "ready" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const urlHasRecovery =
      typeof window !== "undefined" &&
      hasRecoveryUrlParams({ search: window.location.search, hash: window.location.hash });
    let recoveryConfirmed = urlHasRecovery;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        recoveryConfirmed = true;
        setState("ready");
      } else if (urlHasRecovery && session) {
        setState("ready");
      }
    });
    const timer = setTimeout(async () => {
      if (!recoveryConfirmed) {
        setState("invalid");
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      setState(session ? "ready" : "invalid");
    }, 1200);
    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const policyError = passwordPolicyError(password);
    if (policyError) return setError(policyError);
    if (password !== confirm) return setError("Kedua isian kata sandi belum sama. Ketik ulang dengan teliti.");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => navigate({ to: "/dashboard" }), 1800);
    } catch (err: any) {
      setError(describeAuthError(err, "Kata sandi belum bisa diganti. Coba lagi, atau minta tautan pemulihan baru."));
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full h-12 pl-10 pr-4 rounded-xl border-2 border-border bg-background text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary";

  return (
    <div className="app-ui min-h-screen grid-bg flex items-center justify-center px-4 py-12 sm:py-20">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-grid h-14 w-14 place-items-center rounded-2xl gradient-primary text-white font-bold text-xl mb-4" aria-hidden="true">A</div>
          <h1 className="text-2xl font-bold">Buat Kata Sandi Baru</h1>
        </div>

        <div className="glass rounded-3xl p-6 sm:p-8">
          {state === "checking" && (
            <div role="status" aria-live="polite" className="flex items-center justify-center gap-3 py-6 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Memeriksa tautan pemulihan...
            </div>
          )}

          {state === "invalid" && (
            <div role="alert" className="space-y-4 text-sm">
              <p className="rounded-xl bg-destructive/10 border-2 border-destructive/20 p-3 text-destructive">
                Tautan pemulihan tidak berlaku. Mungkin sudah dipakai atau kedaluwarsa. Minta tautan baru, lalu buka tautan itu segera.
              </p>
              <Link to="/forgot-password" className="inline-flex min-h-11 items-center justify-center w-full rounded-xl gradient-primary text-white font-semibold">
                Minta tautan baru
              </Link>
            </div>
          )}

          {state === "ready" && !done && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="new-password" className="block text-sm font-medium mb-1.5">Kata sandi baru</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <input id="new-password" name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" required aria-describedby="new-password-hint"
                    value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimal 8 karakter" className={`${inputClass} pr-12`} />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Sembunyikan kata sandi baru" : "Tampilkan kata sandi baru"}
                    aria-pressed={showPassword}
                    className="absolute right-0 top-1/2 -translate-y-1/2 grid h-11 w-11 place-items-center text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
                <p id="new-password-hint" className="mt-1.5 text-xs text-muted-foreground">{PASSWORD_POLICY_HINT}</p>
              </div>
              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium mb-1.5">Ulangi kata sandi baru</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <input id="confirm-password" name="confirm" type={showConfirm ? "text" : "password"} autoComplete="new-password" required
                    value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Ketik sekali lagi" className={`${inputClass} pr-12`} />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    aria-label={showConfirm ? "Sembunyikan ulangan kata sandi" : "Tampilkan ulangan kata sandi"}
                    aria-pressed={showConfirm}
                    className="absolute right-0 top-1/2 -translate-y-1/2 grid h-11 w-11 place-items-center text-muted-foreground hover:text-foreground"
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>
              {error && (
                <div role="alert" className="rounded-xl bg-destructive/10 border-2 border-destructive/20 p-3 text-sm text-destructive">{error}</div>
              )}
              <button type="submit" disabled={loading}
                className="w-full min-h-12 rounded-xl gradient-primary text-white font-semibold text-sm hover:opacity-90 transition disabled:opacity-60 flex items-center justify-center gap-2">
                {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Simpan kata sandi baru
              </button>
            </form>
          )}

          {done && (
            <div className="space-y-4">
              <p role="status" className="rounded-xl bg-teal/10 border-2 border-teal/20 p-3 text-sm text-primary">
                Kata sandi sudah diganti. Kamu akan dibawa ke dashboard.
              </p>
              <Link
                to="/dashboard"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl gradient-primary text-white font-semibold text-sm hover:opacity-90 transition"
              >
                Buka Dashboard sekarang
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
