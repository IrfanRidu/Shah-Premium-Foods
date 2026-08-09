"use client";
import { useState, useEffect, useRef } from "react";
import { FaPhoneSlash, FaMicrophone, FaMicrophoneSlash, FaPause, FaPlay, FaPhoneVolume } from "react-icons/fa";
import toast from "react-hot-toast";
import { useSipClient } from "../hooks/useSipClient";
import { formatCallDuration } from "../utils/phoneUtils";
import IncomingCallModal from "./IncomingCallModal";

// Small persistent widget — drop this once in the call-center agent's
// dashboard layout (not on every page) so it's always available
// regardless of which order/customer they're currently looking at.
//
// HONESTY NOTE: the connect()/makeCall() paths below call through to
// sipClient.js, which registers to a real Asterisk server over
// WebSocket — this widget's logic is complete, but has not been (and
// cannot be, from this sandbox) exercised against a live PBX. See
// telephony/README.md.
export default function Softphone() {
  const { phoneState, incomingFrom, connect, disconnect, answerCall, rejectCall, hangupCall, sendDTMF, setHold } = useSipClient();
  const [connecting, setConnecting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [onHold, setOnHold] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (phoneState === "connected") {
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
      setMuted(false);
      setOnHold(false);
    }
    return () => clearInterval(timerRef.current);
  }, [phoneState]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await connect();
      toast.success("Softphone connected");
    } catch (err) {
      toast.error(err.message || "Could not connect softphone");
    } finally {
      setConnecting(false);
    }
  };

  const toggleMute = () => {
    setHold(!muted); // reuses the same track-enable/disable mechanism as hold
    setMuted((m) => !m);
  };

  const toggleHoldBtn = () => {
    setHold(!onHold);
    setOnHold((h) => !h);
  };

  if (phoneState === "disconnected") {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-dashed border-theme text-xs text-theme-muted">
        <FaPhoneVolume size={12} />
        <button onClick={handleConnect} disabled={connecting} className="font-semibold hover:text-theme transition-colors disabled:opacity-50">
          {connecting ? "Connecting…" : "Connect softphone"}
        </button>
      </div>
    );
  }

  return (
    <>
      {phoneState === "incoming" && (
        <IncomingCallModal callerNumber={incomingFrom} onAnswer={answerCall} onReject={rejectCall} />
      )}

      {(phoneState === "dialing" || phoneState === "ringing" || phoneState === "connected") && (
        <div className="fixed bottom-6 right-6 z-40 bg-[var(--color-surface)] border border-theme rounded-2xl shadow-xl p-4 w-64">
          <p className="text-xs uppercase tracking-widest text-theme-muted mb-1">
            {phoneState === "dialing" && "Calling…"}
            {phoneState === "ringing" && "Ringing…"}
            {phoneState === "connected" && "On call"}
          </p>
          <p className="text-lg font-bold mb-3">{phoneState === "connected" ? formatCallDuration(seconds) : "…"}</p>

          <div className="flex items-center justify-center gap-3">
            {phoneState === "connected" && (
              <>
                <button onClick={toggleMute} title={muted ? "Unmute" : "Mute"} className={`icon-btn ${muted ? "icon-btn-active" : ""}`}>
                  {muted ? <FaMicrophoneSlash size={14} /> : <FaMicrophone size={14} />}
                </button>
                <button onClick={toggleHoldBtn} title={onHold ? "Resume" : "Hold"} className={`icon-btn ${onHold ? "icon-btn-active" : ""}`}>
                  {onHold ? <FaPlay size={13} /> : <FaPause size={13} />}
                </button>
              </>
            )}
            <button onClick={hangupCall} title="Hang up" className="w-10 h-10 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors">
              <FaPhoneSlash size={15} />
            </button>
          </div>
        </div>
      )}

      {phoneState === "idle" && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/40 text-xs text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          Softphone ready
          <button onClick={disconnect} className="text-theme-muted hover:text-theme ml-1 underline underline-offset-2">disconnect</button>
        </div>
      )}
    </>
  );
}
