"use client";
import { useEffect, useState, useCallback } from "react";
import { FaTachometerAlt, FaPlus, FaTrash } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError } from "@/lib/utils";
import toast from "react-hot-toast";

// Spec: "Design the system so it can integrate with fingerprint
// scanners that expose SDKs or local APIs... The architecture should
// make it easy to support multiple biometric device vendors." No
// specific vendor was named, so this app contains no vendor SDK code —
// there's nothing concrete to write against. What this page manages is
// the RECEIVING side of a generic webhook contract: register a device
// here to get an API key, then configure that device's own bridge
// software (whatever the vendor provides, or a small script someone
// writes against their SDK) to POST to this app's webhook using that
// key. See attendance.controller.js's fingerprintWebhookController and
// deviceAuth.js for the full reasoning.
function RegisterDeviceModal({ onClose, onRegistered }) {
  const [name, setName] = useState("");
  const [deviceType, setDeviceType] = useState("Fingerprint");
  const [saving, setSaving] = useState(false);
  const [issuedKey, setIssuedKey] = useState(null); // shown exactly once, right after creation

  const submit = async () => {
    if (!name.trim()) { toast.error("Device name is required"); return; }
    try {
      setSaving(true);
      const r = await Axios({ ...api.registerBiometricDevice, data: { name: name.trim(), deviceType } });
      if (r.data?.success) {
        if (r.data.isDemoAction) {
          toast.success(r.data.message);
          onClose();
        } else {
          setIssuedKey(r.data.data.apiKey);
          onRegistered();
        }
      }
    } catch (err) { axiosToastError(err); }
    finally { setSaving(false); }
  };

  if (issuedKey) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
        <div className="bg-[var(--color-surface)] rounded-2xl w-full max-w-md p-6">
          <h2 className="font-display text-lg font-semibold mb-2">Device Registered</h2>
          <p className="text-sm text-theme-muted mb-3">Copy this API key into your device or bridge script's configuration now — it won't be shown in full again after you close this.</p>
          <div className="bg-[var(--color-bg)] border border-theme rounded-lg p-3 font-mono text-xs break-all select-all">{issuedKey}</div>
          <div className="flex justify-end mt-5">
            <button onClick={onClose} className="btn-primary px-4 py-2 text-sm">Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-[var(--color-surface)] rounded-2xl w-full max-w-sm p-6">
        <h2 className="font-display text-lg font-semibold mb-4">Register Device</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Device name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main Entrance Scanner" className="input-field py-2 text-sm w-full" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Type</label>
            <select value={deviceType} onChange={(e) => setDeviceType(e.target.value)} className="input-field py-2 text-sm w-full">
              <option value="Fingerprint">Fingerprint</option>
              <option value="Facial Recognition">Facial Recognition</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="btn-outline px-4 py-2 text-sm">Cancel</button>
          <button onClick={submit} disabled={saving} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">{saving ? "Registering…" : "Register"}</button>
        </div>
      </div>
    </div>
  );
}

export default function BiometricDevicesPage() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [registerOpen, setRegisterOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await Axios({ ...api.getBiometricDevices });
      if (r.data?.success) setDevices(r.data.data);
    } catch (err) { axiosToastError(err); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async (id) => {
    try {
      const r = await Axios({ ...api.deleteBiometricDevice, data: { _id: id } });
      if (r.data?.success) {
        toast.success(r.data.isDemoAction ? r.data.message : "Device removed");
        if (!r.data.isDemoAction) load();
      }
    } catch (err) { axiosToastError(err); }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <FaTachometerAlt className="text-2xl text-theme-primary" />
        <h1 className="section-heading text-2xl">Biometric Devices</h1>
      </div>
      <p className="text-sm text-theme-muted mb-6 max-w-xl">
        Register a fingerprint scanner or other biometric terminal to get an API key. Configure that device (or its bridge script) to
        POST to <code className="text-xs bg-[var(--color-bg)] px-1 py-0.5 rounded">/api/attendance/fingerprint-webhook</code> with
        that key plus the employee's linked fingerprint template ID — this app doesn't ship code for any specific vendor's SDK,
        that integration lives in your device's own bridge software calling this webhook.
      </p>

      <div className="flex justify-end mb-4">
        <button onClick={() => setRegisterOpen(true)} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm"><FaPlus size={11} /> Register Device</button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-theme-muted">Loading devices…</div>
      ) : devices.length === 0 ? (
        <div className="text-center py-16 text-theme-muted">No devices registered yet.</div>
      ) : (
        <div className="space-y-2">
          {devices.map((d) => (
            <div key={d._id} className="flex flex-wrap items-center justify-between gap-3 bg-[var(--color-surface)] border border-theme rounded-xl p-4">
              <div>
                <p className="font-semibold text-sm">{d.name}</p>
                <p className="text-xs text-theme-muted mt-0.5">
                  {d.deviceType} · Key {d.apiKey} · {d.lastSeenAt ? `Last seen ${new Date(d.lastSeenAt).toLocaleString()}` : "Never contacted yet"}
                </p>
              </div>
              <button onClick={() => remove(d._id)} className="icon-btn icon-btn-danger"><FaTrash size={13} /></button>
            </div>
          ))}
        </div>
      )}

      {registerOpen && <RegisterDeviceModal onClose={() => setRegisterOpen(false)} onRegistered={load} />}
    </div>
  );
}
