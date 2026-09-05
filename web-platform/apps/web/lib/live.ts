"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { API_BASE_URL } from "./api";
import type {
  LiveCommandAck,
  LiveDeviceEvent,
  LiveDeviceStatus,
  LiveEcgChunk,
  LiveEcgSessionEnd,
  LiveMeasurement,
} from "./types";

export type LiveStatus =
  | "idle"
  | "connecting"
  | "authenticating"
  | "ready"
  | "error"
  | "disconnected";

export interface LiveHandlers {
  onMeasurement?: (measurement: LiveMeasurement) => void;
  onEcgChunk?: (chunk: LiveEcgChunk) => void;
  onEcgSessionEnd?: (event: LiveEcgSessionEnd) => void;
  onDeviceStatus?: (status: LiveDeviceStatus) => void;
  onCommandAck?: (ack: LiveCommandAck) => void;
  onDeviceEvent?: (event: LiveDeviceEvent) => void;
}

interface LiveOptions {
  /**
   * Doctors pass the patient whose room they want to observe. The server only
   * honours it when an ACCEPTED relationship exists; patients are placed in
   * their own room automatically and should leave this undefined.
   */
  watchPatientId?: string;
}

export interface LiveFeed {
  status: LiveStatus;
  error: string | null;
}

/**
 * Maintains one authenticated socket to the API's `/live` namespace.
 *
 * The gateway drops sockets that do not authenticate within a few seconds, so
 * the token is sent immediately on every `connect` — including reconnects,
 * where the server has no memory of the previous session.
 */
export function useLiveFeed(
  token: string | null,
  handlers: LiveHandlers,
  options: LiveOptions = {},
): LiveFeed {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const { watchPatientId } = options;

  // Handlers usually change identity every render. Keeping them in a ref means
  // the socket is created once per token instead of being torn down and
  // rebuilt on each parent re-render.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  // The room to watch is read inside the connect handler, so it lives in a ref
  // too: a doctor switching patients must not tear down the socket.
  const socketRef = useRef<Socket | null>(null);
  const watchRef = useRef<string | undefined>(watchPatientId);

  useEffect(() => {
    if (!token) {
      setStatus("idle");
      return;
    }

    setStatus("connecting");
    setError(null);

    const socket: Socket = io(`${API_BASE_URL}/live`, {
      transports: ["websocket"],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
      autoConnect: true,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setStatus("authenticating");
      socket.emit("auth", { token });
    });

    socket.on("auth:success", () => {
      setStatus("ready");
      setError(null);
      // Re-join on every successful auth, including after a reconnect — the
      // server has no memory of the rooms this socket used to be in.
      if (watchRef.current) {
        socket.emit("join:patient", { patientId: watchRef.current });
      }
    });

    socket.on("auth:error", (payload: { message?: string }) => {
      setStatus("error");
      setError(payload?.message ?? "Authentication failed");
    });

    socket.on("error", (payload: { message?: string }) => {
      setError(payload?.message ?? "Live connection error");
    });

    socket.on("connect_error", (err: Error) => {
      setStatus("error");
      setError(err.message || "Could not reach the live server");
    });

    socket.on("disconnect", () => {
      setStatus("disconnected");
    });

    socket.on("measurement:new", (payload: LiveMeasurement) => {
      handlersRef.current.onMeasurement?.(payload);
    });

    socket.on("ecg:chunk", (payload: LiveEcgChunk) => {
      handlersRef.current.onEcgChunk?.(payload);
    });

    socket.on("ecg:session-end", (payload: LiveEcgSessionEnd) => {
      handlersRef.current.onEcgSessionEnd?.(payload);
    });

    socket.on("device:status", (payload: LiveDeviceStatus) => {
      handlersRef.current.onDeviceStatus?.(payload);
    });

    socket.on("command:ack", (payload: LiveCommandAck) => {
      handlersRef.current.onCommandAck?.(payload);
    });

    socket.on("device:event", (payload: LiveDeviceEvent) => {
      handlersRef.current.onDeviceEvent?.(payload);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  // Room membership is a separate concern from connection lifetime. Switching
  // patients leaves the old room and joins the new one over the existing
  // socket, instead of dropping the stream for a full reconnect.
  useEffect(() => {
    const previous = watchRef.current;
    watchRef.current = watchPatientId;

    const socket = socketRef.current;
    if (!socket || status !== "ready") return;

    if (previous && previous !== watchPatientId) {
      socket.emit("leave:patient", { patientId: previous });
    }
    if (watchPatientId && watchPatientId !== previous) {
      socket.emit("join:patient", { patientId: watchPatientId });
    }
  }, [watchPatientId, status]);

  return { status, error };
}
