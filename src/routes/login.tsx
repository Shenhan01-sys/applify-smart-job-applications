import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { profileService } from "@/services/profileService";
import { describeAuthError, rememberAuthProvider } from "@/lib/authErrors";
import { rememberAuthMode } from "@/lib/authMode";
import { detectInAppBrowser, inAppBrowserWarning } from "@/lib/inAppBrowser";
import { Mail, Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import { clearPostLoginRedirect, navigateArgsForRedirect, rememberPostLoginRedirect, safeRedirectPath } from "@/lib/authRedirect";

export const Route = createFileRoute("/login")({
  // `?mode=daftar` membuka formulir daftar (tombol "Daftar Gratis" di beranda); `?redirect=` mempertahankan rute tujuan UAT yang aman.
  validateSearch: (search: Record<string, unknown>): { mode?: "daftar"; redirect?: string } => {
    const redirect = safeRedirectPath(search.redirect);
    return {
      ...(search.mode === "daftar" ? { mode: "daftar" as const } : {}),
      ...(redirect ? { redirect } : {}),
    };
  },
  component: LoginPage,
});

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z"
        fill="#0A66C2"
      />
    </svg>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const { mode, redirect: redirectTo } = Route.useSearch();
  const { user, loading: authLoading } = useAuth();
  const [isSignUp, setIsSignUp] = useState(mode === "daftar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  // Peramban bawaan WhatsApp/Instagram: Google menolak OAuth dari sana, jadi beri tahu sebelum tombol ditekan.
  const [inApp] = useState(() => (typeof navigator === "undefined" ? null : detectInAppBrowser(navigator.userAgent)));
  const [linkedInLoading, setLinkedInLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [resendBusy, setResendBusy] = useState(false);
  const [resendNote, setResendNote] = useState("");
  // Mencegah dua navigasi sekaligus: efek "sudah masuk" dan hasil kirim formulir bisa terjadi hampir bersamaan.
  const routing = useRef(false);

  // Tombol "Daftar Gratis" membawa ?mode=daftar. Bila pengguna sudah di halaman ini lalu menekan tautan itu lagi,
  // formulir ikut berganti.
  useEffect(() => {
    setIsSignUp(mode === "daftar");
    setError("");
    setSuccessMsg("");
    setResendNote("");
  }, [mode]);

  const handleResendVerification = async () => {
    if (resendBusy || !email.trim()) return;
    setResendBusy(true);
    setResendNote("");
    setError("");
    try {
      const { error: err } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin + "/auth/callback" },
      });
      if (err) throw err;
      setResendNote("Email verifikasi baru sudah dikirim. Cek inbox dan folder spam.");
    } catch (err: any) {
      setError(describeAuthError(err, "Belum bisa mengirim ulang email verifikasi. Tunggu sebentar lalu coba lagi."));
    } finally {
      setResendBusy(false);
    }
  };

  // Setelah masuk: profil kosong ke /profile dengan banner sambutan, selain itu ke /dashboard.
  const goAfterLogin = async (userId: string) => {
    if (routing.current) return;
    routing.current = true;
    clearPostLoginRedirect();
    const target = await profileService.resolvePostLoginTarget(userId);
    if (target.to === "/profile") {
      navigate({ to: "/profile", search: { welcome: 1 } });
      return;
    }
    const navArgs = navigateArgsForRedirect(redirectTo);
    if (navArgs) {
      navigate(navArgs as any);
      return;
    }
    navigate({ to: "/dashboard" });
  };

  useEffect(() => {
    if (user && !authLoading) goAfterLogin(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccessMsg("");

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            // Tautan verifikasi kembali lewat /auth/callback supaya pengguna baru langsung diarahkan ke Profil.
            emailRedirectTo: window.location.origin + "/auth/callback",
          },
        });
        if (error) throw error;
        // Supabase tidak melempar galat untuk email yang sudah terdaftar; ia mengembalikan akun tanpa identitas.
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          throw { code: "user_already_exists", message: "User already registered" };
        }
        if (data.session && data.user) {
          await goAfterLogin(data.user.id);
          return;
        }
        setSuccessMsg("Akun berhasil dibuat. Buka email dari Applify (cek juga folder spam) dan klik tautan verifikasi, lalu kamu akan langsung masuk.");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await goAfterLogin(data.user.id);
        return;
      }
    } catch (err: any) {
      setError(describeAuthError(err, isSignUp ? "Akun belum bisa dibuat. Periksa isian, lalu coba lagi." : "Belum bisa masuk. Periksa email dan kata sandi, lalu coba lagi."));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setGoogleLoading(true);
    setError("");
    rememberAuthProvider("google");
    rememberAuthMode(isSignUp ? "daftar" : "masuk");
    rememberPostLoginRedirect(redirectTo);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin + '/auth/callback',
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      if (error) throw error;
      // Browser akan pindah ke Google, tidak perlu navigasi di sini.
    } catch (err: any) {
      setError(describeAuthError(err, "Belum bisa masuk dengan Google. Coba lagi, atau pakai email dan kata sandi.", "google"));
      setGoogleLoading(false);
    }
  };

  // LinkedIn lewat provider OpenID Connect Supabase (linkedin_oidc). Yang diterima hanya nama,
  // alamat email, dan foto profil; riwayat kerja dan skill tidak ikut.
  const handleLinkedInAuth = async () => {
    setLinkedInLoading(true);
    setError("");
    rememberAuthProvider("linkedin");
    rememberAuthMode(isSignUp ? "daftar" : "masuk");
    rememberPostLoginRedirect(redirectTo);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "linkedin_oidc",
        options: {
          redirectTo: window.location.origin + '/auth/callback',
        },
      });
      if (error) throw error;
      // Browser akan pindah ke LinkedIn, tidak perlu navigasi di sini.
    } catch (err: any) {
      setError(describeAuthError(err, "Belum bisa masuk dengan LinkedIn. Coba lagi, atau pakai Google atau email.", "linkedin"));
      setLinkedInLoading(false);
    }
  };

  // Tampilkan pemuat selama status masuk ditentukan (mencegah halaman kosong)
  if (authLoading) {
    return (
      <div className="app-ui min-h-screen grid-bg flex items-center justify-center" role="status" aria-live="polite">
        <Loader2 className="h-8 w-8 animate-spin text-[#0A5BE0]" aria-hidden="true" />
        <span className="ml-3 text-muted-foreground">Memuat...</span>
      </div>
    );
  }

  return (
    <div className="app-ui min-h-screen grid-bg flex items-center justify-center px-4 py-12 sm:py-20">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-grid h-14 w-14 place-items-center rounded-2xl gradient-primary text-white font-bold text-xl mb-4" aria-hidden="true">A</div>
          <h1 className="text-2xl font-bold">{isSignUp ? "Buat Akun" : "Masuk ke Applify"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isSignUp ? "Daftar gratis untuk mulai memakai asisten lamaran kerja berbasis AI" : "Masuk untuk melanjutkan"}
          </p>
        </div>

        <div className="glass rounded-3xl p-6 sm:p-8">
          <div role="tablist" aria-label="Pilih mode autentikasi" className="mb-5 grid grid-cols-2 gap-1.5 rounded-xl bg-black/[5%] p-1">
            <button
              type="button"
              role="tab"
              aria-selected={!isSignUp}
              onClick={() => { setIsSignUp(false); setError(""); setSuccessMsg(""); setResendNote(""); }}
              className={`min-h-11 rounded-lg text-sm font-semibold transition ${!isSignUp ? "bg-white text-[#16150F] shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Masuk
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isSignUp}
              onClick={() => { setIsSignUp(true); setError(""); setSuccessMsg(""); setResendNote(""); }}
              className={`min-h-11 rounded-lg text-sm font-semibold transition ${isSignUp ? "bg-white text-[#16150F] shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Daftar
            </button>
          </div>

          {inApp && (
            <p role="alert" className="mb-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              {inAppBrowserWarning(inApp)}
            </p>
          )}

          {/* Google OAuth Button */}
          <button
            type="button"
            onClick={handleGoogleAuth}
            disabled={googleLoading}
            className="w-full min-h-12 rounded-xl border-2 border-black/[12%] bg-white text-[#16150F] font-semibold text-sm hover:bg-black/[3%] transition disabled:opacity-60 flex items-center justify-center gap-3"
          >
            {googleLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <GoogleIcon />
            )}
            {isSignUp ? "Daftar dengan Google" : "Masuk dengan Google"}
          </button>

          <button
            type="button"
            onClick={handleLinkedInAuth}
            disabled={linkedInLoading}
            className="mt-3 w-full min-h-12 rounded-xl border-2 border-black/[12%] bg-white text-[#16150F] font-semibold text-sm hover:bg-black/[3%] transition disabled:opacity-60 flex items-center justify-center gap-3"
          >
            {linkedInLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <LinkedInIcon />
            )}
            {isSignUp ? "Daftar dengan LinkedIn" : "Masuk dengan LinkedIn"}
          </button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            LinkedIn hanya mengambil identitas akun; impor pengalaman &amp; skill dilakukan lewat PDF di halaman Profil.
          </p>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-black/[8%]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-3 text-muted-foreground">atau dengan email</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <input
                  id="login-email"
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

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="login-password" className="block text-sm font-medium">Kata sandi</label>
                {!isSignUp && (
                  <Link to="/forgot-password" className="text-sm text-primary hover:underline">Lupa kata sandi?</Link>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isSignUp ? "Minimal 6 karakter" : "Masukkan kata sandi"}
                  required
                  minLength={6}
                  className="w-full h-12 pl-10 pr-12 rounded-xl border-2 border-border bg-background text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  aria-pressed={showPassword}
                  className="absolute right-0 top-1/2 -translate-y-1/2 grid h-11 w-11 place-items-center text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" className="rounded-xl bg-destructive/10 border-2 border-destructive/20 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            {successMsg ? (
              <div role="status" className="rounded-xl bg-teal/10 border-2 border-teal/20 p-4 text-sm text-[#16150F] space-y-3">
                <p>{successMsg}</p>
                {resendNote && <p className="text-xs font-medium text-[#1C9656]">{resendNote}</p>}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={resendBusy}
                    className="min-h-11 px-4 rounded-xl bg-[#0A5BE0] text-white text-xs font-semibold hover:opacity-90 transition disabled:opacity-60 inline-flex items-center gap-1.5"
                  >
                    {resendBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                    Kirim ulang email verifikasi
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSuccessMsg(""); setResendNote(""); setError(""); }}
                    className="min-h-11 px-4 rounded-xl border-2 border-border bg-white text-xs font-semibold hover:bg-black/[3%] transition"
                  >
                    Ganti email
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-12 rounded-xl gradient-primary text-white font-semibold text-sm hover:opacity-90 transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {isSignUp ? "Daftar Sekarang" : "Masuk"}
              </button>
            )}
          </form>

          {isSignUp && (
            <div className="mt-6 rounded-xl bg-black/[3%] p-4 text-sm text-[#16150F]">
              <p className="font-semibold">Setelah daftar, kamu akan:</p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-muted-foreground">
                <li>Unggah CV atau isi profil singkatmu.</li>
                <li>Cari lowongan, lalu buat draf lamaran dengan AI.</li>
                <li>Periksa draf di halaman Persetujuan. Tidak ada lamaran yang dikirim sebelum kamu menyetujuinya.</li>
              </ol>
            </div>
          )}

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => { setIsSignUp(!isSignUp); setError(""); setSuccessMsg(""); setResendNote(""); }}
              className="min-h-11 px-3 text-sm text-primary hover:underline"
            >
              {isSignUp ? "Sudah punya akun? Masuk" : "Belum punya akun? Daftar"}
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Dengan masuk atau mendaftar, kamu menyetujui{" "}
          <Link to="/terms" className="underline hover:text-foreground">Ketentuan Layanan</Link>{" "}
          dan <Link to="/privacy" className="underline hover:text-foreground">Kebijakan Privasi</Link> Applify.
        </p>
      </div>
    </div>
  );
}
