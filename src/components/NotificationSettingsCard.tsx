import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Mail, MessageSquare, Send, ShieldAlert } from "lucide-react";
import { automationApi } from "@/services/automationApi";
import { describeApiError } from "@/lib/apiErrors";
import {
  NOTIFICATIONS_UNAVAILABLE_TEXT,
  NOTIFICATIONS_UNAVAILABLE_TITLE,
  notificationsUnavailable,
  whatsappStatusLabel,
  whatsappUnavailable,
} from "@/lib/notificationCard";

const EVENT_LABELS: Array<{ key: "ready" | "submitted" | "awaiting_code" | "follow_up" | "locked_claim"; label: string }> = [
  { key: "ready", label: "Formulir terisi & siap ditinjau" },
  { key: "submitted", label: "Lamaran berhasil terkirim" },
  { key: "awaiting_code", label: "Agen meminta kode keamanan email" },
  { key: "follow_up", label: "Pengingat follow-up 4 hari" },
  { key: "locked_claim", label: "Klaim persetujuan terkunci / butuh cek" },
];

/**
 * Pengaturan kanal notifikasi per-user (WhatsApp dengan verifikasi OTP 6 digit, dan email).
 *
 * Email notifikasi selalu dikirim ke email akun login dan tidak bisa diubah di sini (server menolak alamat dari
 * klien). Pesan galat berasal dari kode galat server lewat describeApiError; isi galat penyedia tidak pernah tampil.
 */
export function NotificationSettingsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Fitur mati di sisi server (tabel belum siap): kartu hanya berkata "Belum tersedia".
  const [migrationPending, setMigrationPending] = useState(false);
  const [serverChannels, setServerChannels] = useState<{ telegram?: boolean; notificationsEnabled?: boolean; whatsappKapso?: boolean; email?: boolean }>({});

  const [phoneInput, setPhoneInput] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [waVerified, setWaVerified] = useState(false);
  const [waEnabled, setWaEnabled] = useState(false);

  // Email akun (read-only) dari server; null bila belum terkonfirmasi atau tidak tersedia.
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [events, setEvents] = useState<Record<string, boolean>>({
    ready: true,
    submitted: true,
    awaiting_code: true,
    follow_up: true,
    locked_claim: true,
  });

  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [st, prefs] = await Promise.all([
          automationApi.getNotificationStatus().catch(() => ({})),
          automationApi.getNotificationPreferences(),
        ]);
        if (!active) return;
        setServerChannels(st);
        setMigrationPending(Boolean(prefs.migrationPending));
        setPhoneInput(prefs.whatsappPhone ?? "");
        setWaVerified(Boolean(prefs.whatsappVerified));
        setWaEnabled(Boolean(prefs.whatsappEnabled));
        setAccountEmail(prefs.emailAddress ?? null);
        setEmailEnabled(Boolean(prefs.emailEnabled));
        if (prefs.notifyEvents) setEvents(prefs.notifyEvents);
      } catch (err) {
        if (active) {
          setError(
            describeApiError(
              err,
              "Pengaturan notifikasi belum bisa dimuat. Periksa koneksi internetmu lalu muat ulang halaman ini. Pengaturanmu tetap tersimpan.",
            ),
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleRequestOtp = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await automationApi.requestWhatsappOtp(phoneInput);
      setPhoneInput(res.phone);
      setOtpSent(true);
      setNotice(`Kode OTP 6 digit telah dikirim ke WhatsApp ${res.phone}.`);
    } catch (err) {
      setError(
        describeApiError(
          err,
          "Kode OTP WhatsApp belum bisa dikirim. Pastikan nomormu aktif dan periksa koneksi internetmu lalu coba lagi. Pengaturanmu tidak hilang.",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyOtp = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const updated = await automationApi.verifyWhatsappOtp(phoneInput, otpInput);
      setWaVerified(Boolean(updated.whatsappVerified));
      setWaEnabled(Boolean(updated.whatsappEnabled));
      setOtpSent(false);
      setOtpInput("");
      setNotice("Nomor WhatsApp berhasil diverifikasi dan diaktifkan.");
    } catch (err) {
      setError(describeApiError(err, "Kode OTP tidak cocok atau kedaluwarsa."));
    } finally {
      setSaving(false);
    }
  };

  const handleSavePrefs = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await automationApi.updateNotificationPreferences({
        whatsappEnabled: waEnabled,
        // Email hanya bisa aktif bila email akun tersedia; server menolak 400 bila tidak.
        emailEnabled: emailEnabled && Boolean(accountEmail),
        notifyEvents: events,
      });
      setNotice("Preferensi notifikasi disimpan.");
    } catch (err) {
      setError(
        describeApiError(
          err,
          "Preferensi notifikasi belum tersimpan. Periksa koneksi internetmu lalu tekan Simpan lagi. Pilihanmu di layar belum hilang.",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleTestWa = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await automationApi.testWhatsappNotification();
      setNotice("Pesan uji WhatsApp terkirim. Cek WhatsApp-mu.");
    } catch (err) {
      setError(
        describeApiError(
          err,
          "Pesan uji WhatsApp belum bisa dikirim. Periksa koneksi internetmu dan pastikan nomormu aktif lalu coba lagi.",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Memuat pengaturan notifikasi...
      </div>
    );
  }

  // Server mematikan fiturnya (saklar mati atau tabel belum siap): tidak ada formulir yang pasti gagal.
  if (notificationsUnavailable({ migrationPending, notificationsEnabled: serverChannels.notificationsEnabled })) {
    return (
      <div role="status" data-testid="notifications-unavailable" className="mt-4 rounded-xl border border-black/[8%] bg-[#F7F6F2] p-3.5">
        <p className="text-xs font-semibold text-[#16150F]">{NOTIFICATIONS_UNAVAILABLE_TITLE}</p>
        <p className="mt-1 text-xs text-muted-foreground">{NOTIFICATIONS_UNAVAILABLE_TEXT}</p>
      </div>
    );
  }

  const waUnavailable = whatsappUnavailable({ whatsappKapso: serverChannels.whatsappKapso });

  return (
    <div className="mt-4 space-y-4">

      {notice && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          {notice}
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* WhatsApp */}
      <div className="rounded-xl border border-black/[8%] bg-[#F7F6F2] p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#16150F]">
            <MessageSquare className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            WhatsApp
          </span>
          {waVerified ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Terverifikasi
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {whatsappStatusLabel({ whatsappKapso: serverChannels.whatsappKapso })}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            type="tel"
            value={phoneInput}
            onChange={(e) => {
              setPhoneInput(e.target.value);
              setWaVerified(false);
            }}
            disabled={waUnavailable}
            placeholder="+62812xxxxxxxx"
            aria-label="Nomor WhatsApp"
            className="flex-1 min-w-[180px] min-h-10 rounded-lg border border-[#999999] bg-white px-3 text-sm"
          />
          <button
            type="button"
            onClick={handleRequestOtp}
            disabled={saving || waUnavailable || !phoneInput.trim()}
            className="min-h-10 px-3 rounded-lg bg-[#0A5BE0] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-60"
          >
            Kirim OTP WhatsApp
          </button>
        </div>

        {otpSent && (
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={otpInput}
              onChange={(e) => setOtpInput(e.target.value)}
              placeholder="6 digit OTP"
              aria-label="Kode OTP WhatsApp"
              className="w-36 min-h-10 rounded-lg border border-[#999999] bg-white px-3 text-sm font-mono"
            />
            <button
              type="button"
              onClick={handleVerifyOtp}
              disabled={saving || !otpInput.trim()}
              className="min-h-10 px-3 rounded-lg bg-[#16150F] text-white text-xs font-semibold disabled:opacity-60"
            >
              Verifikasi OTP
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <label className="inline-flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={waEnabled}
              disabled={!waVerified || waUnavailable}
              onChange={(e) => setWaEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            Aktifkan notifikasi WhatsApp otomatis
          </label>
          {waVerified && (
            <button
              type="button"
              onClick={handleTestWa}
              disabled={saving || waUnavailable}
              className="min-h-9 px-3 rounded-lg border border-black/15 bg-white text-xs font-medium hover:border-[#0A5BE0] inline-flex items-center gap-1"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" /> Uji WhatsApp
            </button>
          )}
        </div>
      </div>

      {/* Email Transaksional */}
      <div className="rounded-xl border border-black/[8%] bg-[#F7F6F2] p-3.5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#16150F]">
            <Mail className="h-4 w-4 text-[#0A5BE0]" aria-hidden="true" />
            Email Notifikasi Sistem
          </span>
          <span className="text-xs text-muted-foreground">Terpisah dari Gmail untuk kirim lamaran</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="email"
            value={accountEmail ?? ""}
            readOnly
            tabIndex={-1}
            placeholder="Email akun belum terkonfirmasi"
            aria-label="Email akun (tidak bisa diubah)"
            className="flex-1 min-w-[200px] min-h-10 rounded-lg border border-black/10 bg-[#EFEEE8] px-3 text-sm text-[#16150F] cursor-not-allowed"
          />
          <label className="inline-flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={emailEnabled && Boolean(accountEmail)}
              disabled={!accountEmail}
              onChange={(e) => setEmailEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            Aktif
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          {accountEmail
            ? "Notifikasi dikirim ke email akun loginmu. Alamat ini tidak bisa diganti di sini."
            : "Email akunmu belum terkonfirmasi atau tidak tersedia, jadi notifikasi email belum bisa diaktifkan."}
        </p>
      </div>

      {/* Pilihan Event */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-[#16150F]">Jenis kabar yang dikirim:</p>
        <div className="grid sm:grid-cols-2 gap-1.5">
          {EVENT_LABELS.map((ev) => (
            <label key={ev.key} className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={Boolean(events[ev.key])}
                onChange={(e) => setEvents((prev) => ({ ...prev, [ev.key]: e.target.checked }))}
                className="h-4 w-4"
              />
              {ev.label}
            </label>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={handleSavePrefs}
        disabled={saving}
        className="min-h-11 px-4 rounded-lg bg-[#0A5BE0] text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-60 inline-flex items-center gap-2"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        Simpan Preferensi Notifikasi
      </button>
    </div>
  );
}
