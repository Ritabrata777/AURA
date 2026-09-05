"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, PhoneOff, Video, VideoOff } from "lucide-react";
import { useApi, useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import { glassPanel, InnerGlow } from "./kiosk";
import { VideoRoom } from "./video-room";
import { formatTime } from "../lib/format";
import type { ActiveConsultation, ConsultationToken } from "../lib/types";

/** Matches the API's early-join allowance so the UI agrees with the server. */
const EARLY_JOIN_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 20_000;
const DEFAULT_DURATION_MINUTES = 30;

function useCountdown(target: string | null): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!target) {
      setLabel(null);
      return;
    }

    const tick = () => {
      const remaining = new Date(target).getTime() - Date.now();
      if (!Number.isFinite(remaining)) return setLabel(null);
      if (remaining <= 0) return setLabel("now");

      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      setLabel(minutes > 0 ? `in ${minutes}m` : `in ${seconds}s`);
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [target]);

  return label;
}

/**
 * Real consultation state: schedule, participants and the authorization
 * window all come from the API. Joining mints a participant-bound Stream
 * token and opens the full-screen VideoRoom, which renders the live
 * audio/video call with mic, camera, and end-call controls.
 */
export function ConsultationCard({
  role,
  patientId,
  patientEmail,
  className = "",
}: {
  role: "doctor" | "patient";
  /** Required for a doctor to schedule a call. */
  patientId?: string | null;
  patientEmail?: string;
  className?: string;
}) {
  const api = useApi();
  const { user } = useAuth();

  const [consultation, setConsultation] = useState<ActiveConsultation | null>(null);
  const [session, setSession] = useState<ConsultationToken | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [camOn, setCamOn] = useState(true);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const active = await api<ActiveConsultation | null>("/video/consultations/active", {
        signal,
      });
      setConsultation(active);
      // A call that ended (or was replaced) must not leave a stale token behind.
      setSession((previous) =>
        previous && active && previous.callId === active.callId ? previous : null,
      );
    },
    [api],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    load(controller.signal)
      .then(() => setError(null))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Could not check for consultations");
      })
      .finally(() => setLoading(false));

    // The other party may schedule a call at any time, so poll rather than
    // leaving the card stale until a manual refresh.
    const timer = setInterval(() => {
      load().catch(() => undefined);
    }, POLL_INTERVAL_MS);

    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [load]);

  const schedule = async () => {
    if (!patientId) return;
    setBusy(true);
    setError(null);

    try {
      await api("/video/consultations", {
        method: "POST",
        body: {
          patientId,
          startsAt: new Date().toISOString(),
          durationMinutes: DEFAULT_DURATION_MINUTES,
        },
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the consultation");
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    if (!consultation) return;
    setBusy(true);
    setError(null);

    try {
      const token = await api<ConsultationToken>(
        `/video/consultations/${consultation.callId}/token`,
      );
      setSession(token);
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 503
          ? "Video calling is not configured on the server yet."
          : err instanceof Error
            ? err.message
            : "Could not join the call";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const counterpartEmail =
    consultation?.doctor?.email ?? consultation?.patient?.email ?? patientEmail ?? null;

  const handleEnded = useCallback(() => {
    setSession(null);
    // The call may have ended server-side too; refresh the card state.
    void load().catch(() => undefined);
  }, [load]);

  const startsAt = consultation?.startsAt ?? null;
  const countdown = useCountdown(startsAt);
  const joinable = startsAt ? new Date(startsAt).getTime() - Date.now() <= EARLY_JOIN_MS : false;

  return (
    <>
      {session ? (
        <VideoRoom
          token={session}
          userId={user?.id ?? ""}
          userName={user?.email ?? "Participant"}
          onEnded={handleEnded}
        />
      ) : null}

      <div className={`${glassPanel} ${className}`}>
        <InnerGlow />

        <div className="absolute inset-0 flex flex-col justify-between p-4">
          <div className="flex items-start justify-between gap-2">
            <span
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold tracking-wider uppercase ${
                session
                  ? "border-green-500/40 bg-green-500/15 text-green-400"
                  : consultation
                    ? "border-violet-500/40 bg-violet-500/15 text-violet-300"
                    : "border-white/15 bg-white/5 text-white/50"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  session ? "animate-pulse bg-green-500" : consultation ? "bg-violet-400" : "bg-white/30"
                }`}
              />
              {session ? "In consultation" : consultation ? "Consultation ready" : "No active call"}
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCamOn(!camOn)}
                className="rounded-xl border border-white/15 bg-white/5 p-2 transition hover:bg-white/10"
                title={camOn ? "Turn camera off" : "Turn camera on"}
              >
                {camOn ? <Video size={16} /> : <VideoOff size={16} className="text-red-400" />}
              </button>
              {session ? (
                <button
                  onClick={handleEnded}
                  className="rounded-xl border border-red-500/30 bg-red-500/20 p-2 text-red-400 transition hover:bg-red-500/30"
                  title="Leave call"
                >
                  <PhoneOff size={16} />
                </button>
              ) : null}
            </div>
          </div>

          <div className="text-center">
            {loading ? (
              <p className="text-xs text-white/40">Checking for consultations…</p>
            ) : session ? (
              <>
                <Video size={32} className="mx-auto mb-2 text-green-400" />
                <p className="text-sm font-bold text-white">
                  In consultation with {counterpartEmail ?? "your clinician"}
                </p>
                <p className="mt-1 text-[11px] text-white/40">
                  The live call is open in full screen.
                </p>
              </>
            ) : consultation ? (
            <>
              <Video size={32} className="mx-auto mb-2 text-violet-300" />
              <p className="text-sm font-bold text-white">
                {counterpartEmail ?? "Consultation"} · starts {countdown ?? formatTime(startsAt)}
              </p>
              <p className="mt-1 text-[11px] text-white/40">
                {formatTime(consultation.startsAt)} – {formatTime(consultation.endsAt)}
              </p>
            </>
          ) : (
            <>
              <VideoOff size={32} className="mx-auto mb-2 text-white/20" />
              <p className="text-xs text-white/40">
                {role === "doctor"
                  ? patientId
                    ? "No consultation scheduled with this patient."
                    : "Select a patient to start a consultation."
                  : "Your doctor has not started a consultation."}
              </p>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {error ? (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-center text-[11px] font-bold text-red-400">
              {error}
            </p>
          ) : null}

          {!session && consultation ? (
            <button
              onClick={join}
              disabled={busy || !joinable}
              className="flex items-center justify-center gap-2 rounded-xl bg-green-500 py-2.5 text-sm font-bold text-black transition hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
              {joinable ? "Join consultation" : `Opens ${countdown ?? "shortly"}`}
            </button>
          ) : null}

          {!consultation && role === "doctor" ? (
            <button
              onClick={schedule}
              disabled={busy || !patientId}
              className="flex items-center justify-center gap-2 rounded-xl bg-green-500 py-2.5 text-sm font-bold text-black transition hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
              Start consultation
            </button>
          ) : null}
        </div>
      </div>
    </div>
    </>
  );
}
