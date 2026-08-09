"use client";
import { useEffect, useState } from "react";
import Axios from "@/lib/axios";
import { axiosToastError } from "@/lib/utils";
import toast from "react-hot-toast";

// Spec: "Super Admin: ... Change routing settings. Configure queues.
// Manage hold music." Read live by ariClient.js on every incoming call
// (see that file's tryAgentsInSequence) — changes here take effect
// immediately, no service restart needed.
export default function CrmSettingsPage() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Axios.get("/api/callcenter/settings")
      .then(({ data }) => setSettings(data?.data || null))
      .catch(axiosToastError)
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await Axios.put("/api/callcenter/settings", {
        ringTimeoutSeconds: settings.ringTimeoutSeconds,
        holdMusicClass: settings.holdMusicClass,
        maxQueueSize: settings.maxQueueSize,
      });
      setSettings(data?.data);
      toast.success("Settings saved — takes effect on the next call, no restart needed");
    } catch (err) {
      axiosToastError(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-theme-muted text-sm">Loading settings…</div>;
  if (!settings) return null;

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="section-heading text-2xl">Routing & Queue Settings</h1>
        <p className="text-sm text-theme-muted mt-1">Applied live to the next incoming call — no redeploy required.</p>
      </div>

      <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5 space-y-5">
        <div>
          <label className="text-xs font-semibold uppercase tracking-widest text-theme-muted">Ring Timeout (seconds)</label>
          <p className="text-xs text-theme-muted mt-0.5 mb-2">How long to ring one agent before automatically trying the next available agent.</p>
          <input
            type="number" min={5} max={120}
            value={settings.ringTimeoutSeconds}
            onChange={(e) => setSettings({ ...settings, ringTimeoutSeconds: Number(e.target.value) })}
            className="w-full bg-transparent border border-theme rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-widest text-theme-muted">Hold Music Class</label>
          <p className="text-xs text-theme-muted mt-0.5 mb-2">
            Must match a class name defined in <code>musiconhold.conf</code> on your Asterisk server — this setting only
            selects which class to use, the actual audio files are managed there (see telephony/README.md).
          </p>
          <input
            value={settings.holdMusicClass}
            onChange={(e) => setSettings({ ...settings, holdMusicClass: e.target.value })}
            className="w-full bg-transparent border border-theme rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-widest text-theme-muted">Max Queue Size</label>
          <p className="text-xs text-theme-muted mt-0.5 mb-2">Informational cap shown on the Live Agent Monitor — queue alerts fire past this size.</p>
          <input
            type="number" min={1}
            value={settings.maxQueueSize}
            onChange={(e) => setSettings({ ...settings, maxQueueSize: Number(e.target.value) })}
            className="w-full bg-transparent border border-theme rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <button onClick={save} disabled={saving} className="w-full py-2.5 rounded-full bg-theme-primary text-white text-sm font-semibold disabled:opacity-50">
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
