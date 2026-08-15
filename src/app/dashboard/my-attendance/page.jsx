"use client";
import { useEffect, useState, useCallback } from "react";
import { FaClock, FaCheckCircle, FaSignInAlt, FaSignOutAlt, FaCamera } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError } from "@/lib/utils";
import toast from "react-hot-toast";
import FaceCaptureModal from "@/components/FaceCaptureModal";

function fmtTime(d) {
  return d ? new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
}
function fmtHours(mins) {
  return mins ? `${(mins / 60).toFixed(1)}h` : "—";
}


export default function MyAttendancePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [faceModal, setFaceModal] = useState(null); // "checkin" | "checkout" | null

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await Axios({ ...api.getMyAttendance });
      if (r.data?.success) setData(r.data.data);
    } catch (err) { axiosToastError(err); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const manualCheckIn = async () => {
    try {
      setActing(true);
      const r = await Axios({ ...api.checkIn });
      if (r.data?.success) { toast.success(r.data.isDemoAction ? r.data.message : "Checked in"); if (!r.data.isDemoAction) load(); }
    } catch (err) { axiosToastError(err); }
    finally { setActing(false); }
  };
  const manualCheckOut = async () => {
    try {
      setActing(true);
      const r = await Axios({ ...api.checkOut });
      if (r.data?.success) { toast.success(r.data.isDemoAction ? r.data.message : "Checked out"); if (!r.data.isDemoAction) load(); }
    } catch (err) { axiosToastError(err); }
    finally { setActing(false); }
  };

  if (loading) {
    return <div className="text-center py-20 text-theme-muted">Loading…</div>;
  }

  if (!data?.isEmployee) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-4">
          <FaClock className="text-2xl text-theme-primary" />
          <h1 className="section-heading text-2xl">My Attendance</h1>
        </div>
        <p className="text-sm text-theme-muted">This applies to staff accounts only — there's no employee record linked to your account, so there's nothing to show here.</p>
      </div>
    );
  }

  const today = data.today;
  const isCheckedIn = !!today?.checkIn;
  const isCheckedOut = !!today?.checkOut;

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <FaClock className="text-2xl text-theme-primary" />
        <h1 className="section-heading text-2xl">My Attendance</h1>
      </div>

      <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5 mb-6">
        <p className="text-sm text-theme-muted mb-3">Today</p>
        {!isCheckedIn ? (
          <p className="text-lg font-semibold mb-4">Not checked in yet</p>
        ) : !isCheckedOut ? (
          <p className="text-lg font-semibold mb-4 flex items-center gap-2 text-green-600"><FaCheckCircle size={16} /> Checked in at {fmtTime(today.checkIn)}</p>
        ) : (
          <p className="text-lg font-semibold mb-4">Checked in {fmtTime(today.checkIn)} · Checked out {fmtTime(today.checkOut)} · {fmtHours(today.workMinutes)} worked</p>
        )}

        <div className="flex flex-wrap gap-2">
          {!isCheckedIn ? (
            <>
              <button onClick={manualCheckIn} disabled={acting} className="btn-primary px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-60">
                <FaSignInAlt size={13} /> Check In
              </button>
              {data.employee.faceEnrolled && (
                <button onClick={() => setFaceModal("checkin")} className="btn-outline px-4 py-2 text-sm flex items-center gap-2">
                  <FaCamera size={13} /> Check In with Face
                </button>
              )}
            </>
          ) : !isCheckedOut ? (
            <>
              <button onClick={manualCheckOut} disabled={acting} className="btn-primary px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-60">
                <FaSignOutAlt size={13} /> Check Out
              </button>
              {data.employee.faceEnrolled && (
                <button onClick={() => setFaceModal("checkout")} className="btn-outline px-4 py-2 text-sm flex items-center gap-2">
                  <FaCamera size={13} /> Check Out with Face
                </button>
              )}
            </>
          ) : (
            <p className="text-sm text-theme-muted">All done for today.</p>
          )}
        </div>
      </div>

      <p className="text-sm text-theme-muted mb-3">Recent history</p>
      {data.history.length === 0 ? (
        <p className="text-sm text-theme-muted">No attendance recorded yet.</p>
      ) : (
        <div className="space-y-1.5">
          {data.history.map((r) => (
            <div key={r._id} className="text-sm bg-[var(--color-surface)] border border-theme rounded-xl px-4 py-2.5 flex items-center justify-between">
              <span className="font-medium">{r.date}</span>
              <span className="text-theme-muted">In {fmtTime(r.checkIn) || "—"} · Out {fmtTime(r.checkOut) || "—"} · {fmtHours(r.workMinutes)}</span>
            </div>
          ))}
        </div>
      )}

      {faceModal && (
        <FaceCaptureModal
          purpose={faceModal}
          employeeId={data.employee._id}
          title={faceModal === "checkout" ? "Face Check Out" : "Face Check In"}
          onClose={() => setFaceModal(null)}
          onDone={load}
        />
      )}
    </div>
  );
}
