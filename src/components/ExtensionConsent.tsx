import { useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Chrome, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { automationApi } from "@/services/automationApi";
import {
  EXTENSION_CONSENT_ALWAYS_GRANTED_TEXT,
  EXTENSION_CONSENT_ALWAYS_LABEL,
  EXTENSION_CONSENT_BUSY_LABEL,
  EXTENSION_CONSENT_BUTTON,
  EXTENSION_CONSENT_CONNECT_LINK,
  EXTENSION_CONSENT_CONNECT_PREFIX,
  EXTENSION_CONSENT_EXPLAIN,
  EXTENSION_CONSENT_GRANTED_TEXT,
  EXTENSION_CONSENT_LOGIN_NOTE,
  EXTENSION_CONSENT_TITLE,
  EXTENSION_HANDOFF_BUTTON,
  EXTENSION_HANDOFF_NOTE,
  EXTENSION_HANDOFF_TITLE,
  describeConsentError,
  type ExtensionConsentReason,
} from "@/lib/extensionConsent";

interface Props {
  approvalId: string;
  reason: ExtensionConsentReason;
  /** Sesudah backend menerima izin (atau tugas ekstensi sudah aktif): halaman memuat ulang status agen. */
  onGranted: (approvalId: string, info: { always: boolean; alreadyActive: boolean }) => void;
}

/**
 * Izin memakai Ekstensi Browser untuk satu persetujuan. Tampil di kartu persetujuan (tab Menunggu) bila lamaran disetujui, belum
 * terkirim, dan belum ada tugas agen yang aktif (lihat lib/extensionConsent.ts). Tombol Izinkan memanggil
 * POST /api/approvals/:id/extension-consent; centang "Selalu izinkan" juga menyalakan pengaturan ekstensi otomatis.
 * Status sambungan ekstensi tidak diketahui Applify, jadi hanya ada tautan ke bagian ekstensi di Pengaturan.
 */
export default function ExtensionConsent({ approvalId, reason, onGranted }: Props) {
  const uid = useId();
  const [always, setAlways] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const grant = async () => {
    setBusy(true);
    setError("");
    try {
      await automationApi.grantExtensionConsent(approvalId, always);
      toast.success(always ? EXTENSION_CONSENT_ALWAYS_GRANTED_TEXT : EXTENSION_CONSENT_GRANTED_TEXT);
      onGranted(approvalId, { always, alreadyActive: false });
    } catch (err) {
      const failure = describeConsentError(err);
      if (failure.alreadyActive) {
        toast.info(failure.message);
        onGranted(approvalId, { always, alreadyActive: true });
      } else {
        setError(failure.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="extension-consent"
      className="mt-3 rounded-xl border-2 border-[#0A5BE0]/25 bg-[#0A5BE0]/[4%] px-3 py-3"
      role="group"
      aria-labelledby={`${uid}-title`}
    >
      <p id={`${uid}-title`} className="inline-flex items-center gap-2 text-xs font-semibold">
        <Chrome className="h-4 w-4 text-[#0A5BE0]" aria-hidden="true" />{" "}
        {reason === "handoff_needed" ? EXTENSION_HANDOFF_TITLE : EXTENSION_CONSENT_TITLE}
      </p>
      <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{EXTENSION_CONSENT_EXPLAIN}</p>
      {reason === "login_needed" && (
        <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{EXTENSION_CONSENT_LOGIN_NOTE}</p>
      )}
      {reason === "handoff_needed" && (
        <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{EXTENSION_HANDOFF_NOTE}</p>
      )}
      <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
        {EXTENSION_CONSENT_CONNECT_PREFIX}{" "}
        <Link
          to="/settings"
          hash="ekstensi"
          data-testid="extension-consent-settings-link"
          className="font-semibold text-[#0A5BE0] hover:underline"
        >
          {EXTENSION_CONSENT_CONNECT_LINK}
        </Link>
        .
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={grant}
          disabled={busy}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[#0A5BE0] px-4 text-sm font-semibold text-white transition hover:bg-[#0256d3] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {busy
            ? EXTENSION_CONSENT_BUSY_LABEL
            : reason === "handoff_needed"
              ? EXTENSION_HANDOFF_BUTTON
              : EXTENSION_CONSENT_BUTTON}
        </button>
        <label htmlFor={`${uid}-always`} className="inline-flex min-h-11 items-center gap-2 text-xs">
          <input
            id={`${uid}-always`}
            type="checkbox"
            checked={always}
            disabled={busy}
            onChange={(e) => setAlways(e.target.checked)}
            className="h-4 w-4"
          />
          {EXTENSION_CONSENT_ALWAYS_LABEL}
        </label>
      </div>
      {error && (
        <p role="alert" className="mt-2 rounded-lg border-2 border-red-100 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
