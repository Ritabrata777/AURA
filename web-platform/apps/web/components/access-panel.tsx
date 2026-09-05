"use client";

import type { DoctorLink } from "../lib/types";
import { formatDateTime } from "../lib/format";
import { glassPanel, InnerGlow } from "./kiosk";

interface AccessPanelProps {
  pending: DoctorLink[];
  accepted: DoctorLink[];
  busyDoctorId: string | null;
  onRespond: (doctorId: string, action: "ACCEPT" | "REJECT") => void;
  onRevoke: (doctorId: string) => void;
}

export function AccessPanel({
  pending,
  accepted,
  busyDoctorId,
  onRespond,
  onRevoke,
}: AccessPanelProps) {
  return (
    <article className={`${glassPanel} p-6`} id="access">
      <InnerGlow />
      <div className="mb-4">
        <p className="text-[11px] font-bold tracking-wider text-white/50 uppercase">Privacy</p>
        <h2 className="text-lg font-bold">Who can see your data</h2>
      </div>

      {pending.length > 0 ? (
        <div className="mb-4 rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="mb-3 text-[11px] font-bold tracking-wider text-white/50 uppercase">Access requests</p>
          {pending.map((doctor) => (
            <div className="flex flex-col gap-3 py-2 sm:flex-row sm:items-center sm:justify-between" key={doctor.doctorId}>
              <div>
                <strong className="block text-sm">{doctor.email}</strong>
                <small className="text-[11px] text-white/50">Requested {formatDateTime(doctor.createdAt)}</small>
              </div>
              <div className="flex gap-2">
                <button
                  className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-bold disabled:opacity-40"
                  onClick={() => onRespond(doctor.doctorId, "REJECT")}
                  disabled={busyDoctorId === doctor.doctorId}
                >
                  Decline
                </button>
                <button
                  className="rounded-xl bg-green-500 px-3 py-1.5 text-xs font-bold text-black disabled:opacity-40"
                  onClick={() => onRespond(doctor.doctorId, "ACCEPT")}
                  disabled={busyDoctorId === doctor.doctorId}
                >
                  Approve
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {accepted.length === 0 ? (
        <p className="text-sm text-white/50">No clinician currently has access to your measurements.</p>
      ) : (
        accepted.map((doctor) => (
          <div className="flex items-center gap-3 border-b border-white/10 py-3 last:border-0" key={doctor.doctorId}>
            <div className="min-w-0 flex-1">
              <strong className="block text-sm">{doctor.email}</strong>
              <small className="text-[11px] text-white/50">Access granted {formatDateTime(doctor.createdAt)}</small>
            </div>
            <button
              className="text-xs font-bold text-red-400 hover:text-red-300 disabled:opacity-40"
              onClick={() => onRevoke(doctor.doctorId)}
              disabled={busyDoctorId === doctor.doctorId}
            >
              Revoke
            </button>
          </div>
        ))
      )}
    </article>
  );
}
