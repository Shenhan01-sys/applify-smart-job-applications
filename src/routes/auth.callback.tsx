import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { profileService } from "@/services/profileService";
import { describeAuthError, recallAuthProvider } from "@/lib/authErrors";
import { backSearchFor, clearAuthMode, recallAuthMode } from "@/lib/authMode";
import { consumePostLoginRedirect, navigateArgsForRedirect } from "@/lib/authRedirect";
import { waitForSession } from "@/lib/authSession";
import { Loader2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  // Mode halaman masuk yang dipakai sebelum ke penyedia: tombol kembali memakainya agar pengguna daftar tetap di formulir daftar.
  const [backSearch] = useState(() => backSearchFor(recallAuthMode()));

  useEffect(() => {
    const url = new URL(window.location.href);
    const error = url.searchParams.get('error');
    const errorCode = url.searchParams.get('error_code');
    const errorDescription = url.searchParams.get('error_description');

    // Supabase mengembalikan galat OAuth atau verifikasi email lewat parameter alamat.
    if (error) {
      setStatus('error');
      setErrorMsg(describeAuthError({ code: errorCode ?? error, message: errorDescription ?? error }, "Proses masuk tidak berhasil. Kembali ke halaman masuk lalu coba lagi.", recallAuthProvider()));
      return;
    }

    // Tunggu Supabase memproses token di alamat: lewat peristiwa sesi dan pembacaan berkala (maksimal 9 detik),
    // bukan satu pembacaan sesudah jeda tetap yang gagal di koneksi lambat.
    const controller = new AbortController();
    void (async () => {
      try {
        const { session, error: sessionError, cancelled } = await waitForSession(supabase, { signal: controller.signal });
        if (cancelled) return;
        if (sessionError) {
          setStatus('error');
          setErrorMsg(describeAuthError(sessionError, "Sesi belum bisa dibaca. Kembali ke halaman masuk lalu coba lagi."));
          return;
        }
        if (session?.user) {
          window.history.replaceState(null, "", window.location.pathname);
          clearAuthMode();
          const savedRedirect = consumePostLoginRedirect();
          // Pengguna baru (profil masih kosong) langsung ke Profil dengan banner sambutan.
          const target = await profileService.resolvePostLoginTarget(session.user.id);
          if (controller.signal.aborted) return;
          if (target.to === "/profile") navigate({ to: "/profile", search: { welcome: 1 } });
          else {
            const navArgs = navigateArgsForRedirect(savedRedirect);
            if (navArgs) navigate(navArgs as any);
            else navigate({ to: "/dashboard" });
          }
        } else {
          setStatus('error');
          setErrorMsg('Proses masuk belum selesai: sesimu tidak ditemukan. Tautan mungkin sudah dipakai atau kedaluwarsa, atau koneksimu lambat. Kembali ke halaman masuk lalu coba lagi.');
        }
      } catch (err: any) {
        if (controller.signal.aborted) return;
        setStatus('error');
        setErrorMsg(describeAuthError(err, 'Terjadi kesalahan saat memproses login. Kembali ke halaman masuk lalu coba lagi.'));
      }
    })();

    return () => controller.abort();
  }, [navigate]);

  if (status === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <div className="h-14 w-14 rounded-full bg-red-100 grid place-items-center">
          <AlertCircle className="h-7 w-7 text-red-600" aria-hidden="true" />
        </div>
        <div className="text-center max-w-md" role="alert">
          <h1 className="text-lg font-bold text-red-800">Belum Berhasil Masuk</h1>
          <p className="text-sm text-red-700 mt-2">{errorMsg}</p>
        </div>
        <Link
          to="/login"
          search={backSearch}
          className="inline-flex min-h-11 items-center px-6 rounded-xl bg-[#0A5BE0] text-white text-sm font-semibold hover:bg-[#0256d3] transition"
        >
          Kembali ke halaman masuk
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4" role="status" aria-live="polite">
      <Loader2 className="h-10 w-10 animate-spin text-[#0A5BE0]" aria-hidden="true" />
      <div className="text-center">
        <p className="text-sm font-medium">Sedang memproses login...</p>
        <p className="text-xs text-muted-foreground mt-1">Tunggu sebentar</p>
      </div>
    </div>
  );
}

export default AuthCallbackPage;
