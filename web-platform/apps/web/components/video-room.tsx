"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Call,
  CallingState,
  StreamCall,
  StreamTheme,
  StreamVideo,
  StreamVideoClient,
  useCallStateHooks,
  SpeakerLayout,
  CallControls,
} from "@stream-io/video-react-sdk";
import "@stream-io/video-react-sdk/dist/css/styles.css";
import { LoadingSpinner } from "./ui/LoadingState";
import type { ConsultationToken } from "@/lib/types";

/**
 * The real consultation room.
 *
 * Joins the Stream call named by the backend-issued token (the API authorizes
 * the participant, relationship, and time window before minting it), renders
 * full-screen speaker tiles with mic/camera controls, and tears the whole
 * client down on leave so no connection outlives the consultation.
 */

type JoinPhase = "connecting" | "in-call" | "error";

function RoomSurface({ onEnded }: { onEnded: () => void }) {
  const { useCallCallingState, useParticipants } = useCallStateHooks();
  const callingState = useCallCallingState();
  const participants = useParticipants();

  // A leave from the built-in controls must also dismiss the room overlay.
  useEffect(() => {
    if (callingState === CallingState.LEFT) onEnded();
  }, [callingState, onEnded]);

  const connected = callingState === CallingState.JOINED;

  return (
    <div className="absolute inset-0 flex flex-col bg-[#080c10]">
      <div className="pointer-events-none absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/70 px-4 py-1.5 text-xs font-semibold text-white/80 backdrop-blur">
        <span
          className={`h-2 w-2 rounded-full ${
            connected ? "animate-pulse bg-emerald-400" : "animate-pulse bg-amber-300"
          }`}
        />
        {connected
          ? `Connected · ${participants.length} participant${participants.length === 1 ? "" : "s"}`
          : `Connecting… (${callingState})`}
      </div>

      <div className="relative flex-1">
        <SpeakerLayout />
      </div>

      <CallControls onLeave={onEnded} />
    </div>
  );
}

export function VideoRoom({
  token,
  userId,
  userName,
  onEnded,
}: {
  token: ConsultationToken;
  /** The platform user id — must match the id the token was minted for. */
  userId: string;
  userName: string;
  /** Called when the user leaves or the call ends. */
  onEnded: () => void;
}) {
  const [phase, setPhase] = useState<JoinPhase>("connecting");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const startedRef = useRef(false);
  const clientRef = useRef<StreamVideoClient | null>(null);
  const callRef = useRef<Call | null>(null);

  const teardown = useCallback(async () => {
    try {
      await callRef.current?.leave();
    } catch {
      // Leaving an already-ended call throws — the intent is accomplished.
    }
    try {
      await clientRef.current?.disconnectUser();
    } catch {
      // Same: a disconnected client is the goal, not an error to surface.
    }
    callRef.current = null;
    clientRef.current = null;
  }, []);

  const handleEnded = useCallback(() => {
    void teardown();
    onEnded();
  }, [teardown, onEnded]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;

    const videoClient = new StreamVideoClient({
      apiKey: token.apiKey,
      user: { id: userId, name: userName },
      token: token.token,
    });
    clientRef.current = videoClient;

    (async () => {
      try {
        const consultation = videoClient.call("default", token.callId);
        // `create: true` is get-or-create semantics: whoever joins first
        // creates the room server-side, the second participant simply joins.
        await consultation.join({ create: true });
        if (cancelled) {
          void teardown();
          return;
        }
        callRef.current = consultation;
        setCall(consultation);
        setClient(videoClient);
        setPhase("in-call");
      } catch (err) {
        if (cancelled) return;
        setPhase("error");
        setJoinError(
          err instanceof Error ? err.message : "Could not join the consultation",
        );
      }
    })();

    return () => {
      cancelled = true;
      void teardown();
    };
    // The room is created once per token; props are captured deliberately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token.callId]);

  return (
    <div className="fixed inset-0 z-[100] bg-black">
      {phase === "connecting" ? (
        <div className="flex h-full flex-col items-center justify-center gap-4">
          <LoadingSpinner size="lg" />
          <p className="text-sm text-white/60">Connecting to the consultation…</p>
          <button
            onClick={() => handleEnded()}
            className="rounded-lg border border-white/20 px-4 py-2 text-xs font-medium text-white/70 hover:bg-white/10"
          >
            Cancel
          </button>
        </div>
      ) : phase === "error" ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="max-w-md rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {joinError}
          </p>
          <button
            onClick={() => handleEnded()}
            className="rounded-lg border border-white/20 px-4 py-2 text-xs font-medium text-white/70 hover:bg-white/10"
          >
            Back
          </button>
        </div>
      ) : client && call ? (
        <StreamVideo client={client} language="en">
          <StreamCall call={call}>
            <StreamTheme className="h-full">
              <RoomSurface onEnded={handleEnded} />
            </StreamTheme>
          </StreamCall>
        </StreamVideo>
      ) : null}
    </div>
  );
}
