"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError } from "@/lib/utils";
import toast from "react-hot-toast";

function VerifyOTPInner() {
  const [otp, setOtp]       = useState(Array(6).fill(""));
  const [loading, setLd]    = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const refs = useRef([]);
  const router  = useRouter();
  const params  = useSearchParams();
  const email   = params.get("email") || "";
  const mode    = params.get("mode") || "verify";

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const handle = (i, val) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp]; next[i] = val; setOtp(next);
    if (val && i < 5) refs.current[i + 1]?.focus();
  };

  const submit = async () => {
    const code = otp.join("");
    if (code.length < 6) { toast.error("Enter all 6 digits"); return; }
    try {
      setLd(true);
      if (mode === "reset") {
        const r = await Axios({ ...api.verifyForgotPasswordOtp, data: { email, otp: code } });
        if (r.data?.success) { toast.success("OTP verified"); router.push(`/reset-password?email=${encodeURIComponent(email)}`); }
      } else {
        const r = await Axios({ ...api.verifyEmail, data: { email, otp: code } });
        if (r.data?.success) { toast.success("Email verified!"); router.push("/login"); }
      }
    } catch (err) { axiosToastError(err); }
    finally { setLd(false); }
  };

  const resend = async () => {
    if (cooldown > 0 || mode === "reset") return;
    try {
      setResending(true);
      const r = await Axios({ ...api.resendVerificationOtp, data: { email } });
      if (r.data?.success) { toast.success("A new code has been sent"); setCooldown(45); }
    } catch (err) { axiosToastError(err); }
    finally { setResending(false); }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="modal-box p-8 text-center">
          <h1 className="font-display text-3xl font-bold mb-1">Enter OTP</h1>
          <p className="text-sm text-theme-muted mb-8">
            We sent a 6-digit code to <strong>{email}</strong>
          </p>
          <div className="flex justify-center gap-2 mb-6">
            {otp.map((d, i) => (
              <input
                key={i}
                ref={(el) => (refs.current[i] = el)}
                value={d}
                onChange={(e) => handle(i, e.target.value)}
                onKeyDown={(e) => { if (e.key === "Backspace" && !d && i > 0) refs.current[i - 1]?.focus(); }}
                maxLength={1}
                className="input-field w-11 h-12 text-center text-xl font-bold"
              />
            ))}
          </div>
          <button onClick={submit} disabled={loading} className="btn-primary w-full py-2.5">
            {loading ? "Verifying…" : "Verify OTP"}
          </button>

          {mode !== "reset" && (
            <button onClick={resend} disabled={resending || cooldown > 0}
              className="mt-4 text-sm font-semibold text-theme-primary hover:underline disabled:opacity-50 disabled:no-underline">
              {cooldown > 0 ? `Resend code in ${cooldown}s` : resending ? "Sending…" : "Didn't get a code? Resend"}
            </button>
          )}

          {mode !== "reset" && (
            <p className="text-xs text-theme-muted mt-5">
              Verification can wait —{" "}
              <Link href="/login" className="text-theme-primary underline">log in now</Link> and verify later from your profile.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyOTPPage() {
  return <Suspense><VerifyOTPInner /></Suspense>;
}
