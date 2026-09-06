"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Plus, Trash2, X } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { glassCard, InnerGlow } from "@/components/kiosk";
import { useAuth, useApi } from "@/lib/auth";
import { useLiveFeed } from "@/lib/live";
import type { DeviceSummary } from "@/lib/types";

/**
 * Device management for personal-wellness accounts. The pairing code
 * identifies the device — it is printed on it and is not a credential.
 */
export default function UserDevices() {
  const { status, token } = useAuth();
  const router = useRouter();
  const api = useApi();

  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showPairForm, setShowPairForm] = useState(false);
  const [pairingCode, setPairingCode] = useState("");
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  const [confirmingUnpair, setConfirmingUnpair] = useState<string | null>(null);

  const load = useCallback(async () => {
    setDevices(await api<DeviceSummary[]>("/individual-users/devices"));
  }, [api]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
    if (status !== "authenticated") return;

    let cancelled = false;
    load()
      .then(() => {
        if (!cancelled) setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load devices");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, router, load]);

  const live = useLiveFeed(token, {
    onDeviceStatus: (payload) => {
      setDevices((previous) =>
        previous.map((device) =>
          device.deviceId === payload.deviceId
            ? { ...device, lastSeenAt: payload.timestamp, online: true }
            : device,
        ),
      );
    },
  });

  const handlePair = async (event: React.FormEvent) => {
    event.preventDefault();
    setPairError(null);
    setPairing(true);

    try {
      await api("/individual-users/devices/pair", {
        method: "POST",
        body: { pairingCode: pairingCode.trim().toUpperCase() },
      });
      setPairingCode("");
      setShowPairForm(false);
      await load();
    } catch (err) {
      setPairError(err instanceof Error ? err.message : "Failed to pair device");
    } finally {
      setPairing(false);
    }
  };

  const handleUnpair = async (deviceId: string) => {
    setError(null);
    try {
      await api(`/individual-users/devices/${deviceId}`, { method: "DELETE" });
      setConfirmingUnpair(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove the device");
    }
  };

  if (status !== "authenticated" || loading) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <div className="h-8 w-48 rounded bg-white/10 animate-pulse" />
          <div className="mt-2 h-4 w-80 rounded bg-white/10 animate-pulse" />
        </div>
        <div className={`${glassCard} p-6 animate-pulse`}>
          {[...Array(2)].map((_, i) => (
            <div key={i} className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded bg-white/10" />
                <div className="h-4 w-32 rounded bg-white/10" />
              </div>
              <div className="h-8 w-24 rounded bg-white/10" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">My Devices</h1>
          <p className="mt-1 text-sm text-white/50">
            Manage the health monitors paired to your account.
          </p>
        </div>
        <button
          onClick={() => setShowPairForm((visible) => !visible)}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:bg-violet-400"
        >
          {showPairForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showPairForm ? "Cancel" : "Pair device"}
        </button>
      </div>

      {error ? (
        <p className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-300">
          {error}
        </p>
      ) : null}

      {/* Pairing form */}
      {showPairForm ? (
        <form className={`${glassCard} mb-6 p-6`} onSubmit={handlePair}>
          <InnerGlow />
          <h2 className="relative text-base font-semibold text-white">Pair a new device</h2>
          <p className="relative mt-1 text-sm text-white/50">
            Enter the pairing code shown as{" "}
            <span className="font-mono font-semibold text-white/80">MED-XXXXXX</span> on the
            device. The code identifies the device — it is not a password.
          </p>
          <div className="relative mt-4 flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={pairingCode}
              onChange={(event) => setPairingCode(event.target.value.toUpperCase())}
              placeholder="MED-______"
              required
              minLength={4}
              maxLength={32}
              disabled={pairing}
              className="w-56 rounded-lg border border-white/15 bg-white/10 px-4 py-2.5 font-mono text-sm uppercase tracking-wider text-white placeholder:text-white/30 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/30 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={pairing}
              className="inline-flex items-center gap-2 rounded-lg bg-violet-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pairing ? <LoadingSpinner size="sm" /> : null}
              Connect device
            </button>
          </div>
          {pairError ? (
            <p className="relative mt-3 text-sm font-medium text-red-400">{pairError}</p>
          ) : null}
        </form>
      ) : null}

      {/* Device list */}
      {devices.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No devices paired"
          description="Pair your Health Monitor with the MED-XXXXXX code to start seeing your readings."
          action={{ label: "Pair device", onClick: () => setShowPairForm(true) }}
        />
      ) : (
        <div className="space-y-4">
          {devices.map((device) => {
            const online =
              device.online ||
              (device.lastSeenAt !== null &&
                Date.now() - new Date(device.lastSeenAt).getTime() < 90_000);
            return (
              <section key={device.deviceId} className={`${glassCard} flex flex-wrap items-center justify-between gap-4 p-5`}>
                <InnerGlow />
                <div className="relative flex items-center gap-4">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                      online ? "bg-emerald-400/15 text-emerald-300" : "bg-white/5 text-white/40"
                    }`}
                  >
                    <Activity className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="flex items-center gap-2 text-sm font-semibold text-white">
                      Health Monitor
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                          online
                            ? "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30"
                            : "bg-white/5 text-white/50 ring-1 ring-white/15"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            online ? "animate-pulse bg-emerald-400" : "bg-white/30"
                          }`}
                        />
                        {online ? "Online" : "Offline"}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-white/50">
                      ID <span className="font-mono">{device.hardwareId}</span> · Code{" "}
                      <span className="font-mono">{device.pairingCode}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-white/40">
                      {device.lastSeenAt
                        ? `Last seen ${new Date(device.lastSeenAt).toLocaleString()}`
                        : "Never connected"}
                      {" · "}
                      Paired {new Date(device.pairedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {confirmingUnpair === device.deviceId ? (
                  <div className="relative flex items-center gap-2">
                    <span className="text-xs font-medium text-white/60">
                      Remove this device?
                    </span>
                    <button
                      onClick={() => void handleUnpair(device.deviceId)}
                      className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-400"
                    >
                      Yes, remove
                    </button>
                    <button
                      onClick={() => setConfirmingUnpair(null)}
                      className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10"
                    >
                      Keep
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingUnpair(device.deviceId)}
                    className="relative inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white/70 transition hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </button>
                )}
              </section>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-center text-xs text-white/30">
        A device can be paired to only one account at a time.
      </p>
    </div>
  );
}
