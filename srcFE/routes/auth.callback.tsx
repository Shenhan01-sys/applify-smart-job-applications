import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const url = new URL(window.location.href);
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');

    // Check if Supabase returned an OAuth error
    if (error) {
      setStatus('error');
      setErrorMsg(errorDescription || error);
      return;
    }

    // Wait for Supabase to process the OAuth hash
    const timer = setTimeout(async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          setStatus('error');
          setErrorMsg(sessionError.message);
          return;
        }
        if (session?.user) {
          // Clean hash from URL
          window.history.replaceState(null, "", window.location.pathname);
          navigate({ to: "/dashboard" });
        } else {
          setStatus('error');
          setErrorMsg('Session tidak ditemukan setelah login. Silakan coba lagi.');
        }
      } catch (err: any) {
        setStatus('error');
        setErrorMsg(err?.message || 'Terjadi kesalahan saat memproses login.');
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [navigate]);

  if (status === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <div className="h-14 w-14 rounded-full bg-red-100 grid place-items-center">
          <AlertCircle className="h-7 w-7 text-red-600" />
        </div>
        <div className="text-center max-w-md">
          <h1 className="text-lg font-bold text-red-800">Login Gagal</h1>
          <p className="text-sm text-red-600 mt-2">{errorMsg}</p>
          <p className="text-xs text-muted-foreground mt-4">
            Jika pesan error mengandung &quot;Database error saving new user&quot;, 
            ini berarti trigger database di Supabase backend perlu diperbaiki.
          </p>
        </div>
        <button
          onClick={() => navigate({ to: "/login" })}
          className="h-11 px-6 rounded-xl bg-[#0A5BE0] text-white text-sm font-semibold hover:bg-[#0256d3] transition"
        >
          Kembali ke Login
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <Loader2 className="h-10 w-10 animate-spin text-[#0A5BE0]" />
      <div className="text-center">
        <p className="text-sm font-medium">Sedang memproses login...</p>
        <p className="text-xs text-muted-foreground mt-1">Tunggu sebentar</p>
      </div>
    </div>
  );
}

export default AuthCallbackPage;
