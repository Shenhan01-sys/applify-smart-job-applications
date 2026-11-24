import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { describeAuthError } from "@/lib/authErrors";
import { Mail, Loader2, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Lupa Kata Sandi — Applify" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        // Tautan di email membuka halaman untuk memasang kata sandi baru.
        redirectTo: window.location.origin + "/reset-password",
      });
      if (error) throw error;
      setSent(true);
    } catch (err: any) {
      setError(describeAuthError(err, "Tautan pemulihan belum bisa dikirim. Periksa emailnya, lalu coba lagi."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-ui min-h-screen grid-bg flex items-center justify-center px-4 py-12 sm:py-20">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-grid h-14 w-14 place-items-center rounded-2xl gradient-primary text-white font-bold text-xl mb-4" aria-hidden="true">A</div>
          <h1 className="text-2xl font-bold">Lupa Kata Sandi</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Masukkan email akunmu. Kami kirim tautan untuk membuat kata sandi baru.
          </p>
        </div>

        <div className="glass rounded-3xl p-6 sm:p-8">
          {sent ? (
            <div role="status" className="space-y-4 text-sm">
              <p className="rounded-xl bg-teal/10 border-2 border-teal/20 p-3 text-primary">
                Bila email <b className="break-all">{email.trim()}</b> terdaftar, tautan pemulihan sudah dikirim. Buka emailmu
                (cek juga folder spam), lalu klik tautannya. Tautan hanya berlaku sebentar.
              </p>
              <button type="button" onClick={() => setSent(false)} className="min-h-11 text-primary hover:underline">
                Email salah? Kirim ke alamat lain
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="forgot-email" className="block text-sm font-medium mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <input
                    id="forgot-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@email.com"
                    required
                    className="w-full h-12 pl-10 pr-4 rounded-xl border-2 border-border bg-background text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                  />
                </div>
              </div>

              {error && (
                <div role="alert" className="rounded-xl bg-destructive/10 border-2 border-destructive/20 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-12 rounded-xl gradient-primary text-white font-semibold text-sm hover:opacity-90 transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Kirim tautan pemulihan
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            <Link to="/login" className="inline-flex min-h-11 items-center gap-1.5 px-3 text-sm text-primary hover:underline">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Kembali ke halaman masuk
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
