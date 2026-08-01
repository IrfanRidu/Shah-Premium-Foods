"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { useForm } from "react-hook-form";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { setUserDetails } from "@/store/userSlice";
import { axiosToastError } from "@/lib/utils";
import { useGlobalContext } from "@/providers/GlobalProvider";
import toast from "react-hot-toast";

export default function LoginPage() {
  const [showPw, setShowPw] = useState(false);
  // Section 13 (Admin Panel Security): set once the server responds with
  // `requiresTwoFactor` — switches the form below from credentials entry
  // to code entry, for that same email.
  const [pendingOtpEmail, setPendingOtpEmail] = useState(null);
  const [otp, setOtp] = useState("");
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm();
  const dispatch = useDispatch();
  const router   = useRouter();
  const { fetchCartItems, fetchAddress } = useGlobalContext();

  // Security hardening: this form always submits via handleSubmit (which
  // calls preventDefault internally), so credentials should never end up
  // in the URL through normal use of this page. But if a `?password=...`
  // (or `?email=...`) ever shows up here anyway — a bookmarked/shared
  // link, a misconfigured integration, a browser extension, or someone
  // just testing by pasting it into the address bar — the right response
  // is to scrub it from the URL immediately without ever reading or using
  // the value, rather than leaving it sitting in the address bar, browser
  // history, and any Referer header sent to third-party resources this
  // page loads (Google Fonts, and Google Analytics if configured). This
  // never auto-fills or auto-submits the form with those values — doing
  // that would just move the same problem into JS memory/state instead of
  // actually fixing it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("password") || params.has("email")) {
      router.replace("/login");
    }
  }, [router]);

  // Section 13 (Admin Panel Security): shared by both the direct-login
  // path (2FA off) and the OTP-verification path (2FA on) — both end with
  // the exact same "now actually finish signing in on the client" steps.
  const finishLoginOnClient = async (payload) => {
    const { accessToken, refreshToken, data: user } = payload;
    localStorage.setItem("accessToken", accessToken);
    localStorage.setItem("refreshToken", refreshToken);
    dispatch(setUserDetails(user));
    await Promise.all([fetchCartItems(), fetchAddress()]);
    toast.success("Welcome back!");
    router.push("/");
  };

  const onSubmit = async (data) => {
    try {
      const r = await Axios({ ...api.login, data });
      if (r.data?.success) {
        if (r.data.data?.requiresTwoFactor) {
          setPendingOtpEmail(r.data.data.email);
          toast.success(r.data.message || "Check your email for a sign-in code");
          return;
        }
        await finishLoginOnClient(r.data.data);
      }
    } catch (err) { axiosToastError(err); }
  };

  const onSubmitOtp = async (e) => {
    e.preventDefault();
    if (!otp.trim()) return;
    try {
      setVerifyingOtp(true);
      const r = await Axios({ ...api.verifyLoginOtp, data: { email: pendingOtpEmail, otp: otp.trim() } });
      if (r.data?.success) await finishLoginOnClient(r.data.data);
    } catch (err) { axiosToastError(err); }
    finally { setVerifyingOtp(false); }
  };

  if (pendingOtpEmail) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="modal-box p-8">
            <h1 className="font-display text-3xl font-bold mb-1">Enter your code</h1>
            <p className="text-sm text-theme-muted mb-7">
              We emailed a 6-digit code to <span className="font-medium text-theme">{pendingOtpEmail}</span>. It expires in 10 minutes.
            </p>
            <form onSubmit={onSubmitOtp} className="space-y-4">
              <input
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                autoFocus
                className="input-field text-center text-2xl tracking-[0.5em] font-mono"
                maxLength={6}
              />
              <button type="submit" disabled={verifyingOtp} className="btn-primary w-full py-2.5">
                {verifyingOtp ? "Verifying…" : "Verify & sign in"}
              </button>
              <button type="button" onClick={() => { setPendingOtpEmail(null); setOtp(""); }}
                className="w-full text-center text-sm text-theme-muted hover:text-theme-primary transition-colors">
                Use a different account
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="modal-box p-8">
          <h1 className="font-display text-3xl font-bold mb-1">Welcome back</h1>
          <p className="text-sm text-theme-muted mb-7">Sign in to your account to continue</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Email</label>
              <input {...register("email", { required: "Email is required", pattern: { value: /\S+@\S+\.\S+/, message: "Invalid email" } })}
                type="email" autoComplete="email" placeholder="you@example.com" className="input-field" />
              {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-sm font-medium">Password</label>
                <Link href="/forgot-password" className="text-xs text-theme-primary hover:underline">Forgot password?</Link>
              </div>
              <div className="relative">
                <input {...register("password", { required: "Password is required" })}
                  type={showPw ? "text" : "password"} autoComplete="current-password" placeholder="••••••••" className="input-field pr-10" />
                <button type="button" tabIndex={-1} onClick={() => setShowPw((p) => !p)}
                  className="password-toggle-btn" aria-label={showPw ? "Hide password" : "Show password"}>
                  {showPw ? <FaEyeSlash size={14} /> : <FaEye size={14} />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
            </div>

            <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-2.5 mt-2">
              {isSubmitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="text-center text-sm text-theme-muted mt-6">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-theme-primary font-semibold hover:underline">Register</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
