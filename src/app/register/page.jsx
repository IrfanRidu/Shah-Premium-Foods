"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError } from "@/lib/utils";
import toast from "react-hot-toast";

export default function RegisterPage() {
  const [showPw, setShowPw] = useState(false);
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm();
  const router = useRouter();

  // Security hardening — see login/page.jsx's own comment for the full
  // reasoning: scrub a stray `?password=...` from the URL immediately
  // without ever reading it, rather than leaving it in the address bar/
  // history/Referer headers.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("password")) router.replace("/register");
  }, [router]);

  const onSubmit = async (data) => {
    try {
      const r = await Axios({ ...api.register, data: { name: data.name, email: data.email, password: data.password, mobile: data.mobile } });
      if (r.data?.success) {
        toast.success("Account created! Please verify your email.");
        router.push(`/verify-otp?email=${encodeURIComponent(data.email)}`);
      }
    } catch (err) { axiosToastError(err); }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="modal-box p-8">
          <h1 className="font-display text-3xl font-bold mb-1">Create account</h1>
          <p className="text-sm text-theme-muted mb-7">Join Shah Premium Foods today</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Full Name</label>
              <input {...register("name", { required: "Name is required" })}
                type="text" placeholder="John Doe" className="input-field" />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Email</label>
              <input {...register("email", { required: "Email is required", pattern: { value: /\S+@\S+\.\S+/, message: "Invalid email" } })}
                type="email" placeholder="you@example.com" className="input-field" />
              {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Mobile (optional)</label>
              <input {...register("mobile")} type="tel" placeholder="+880 1XXX XXXXXX" className="input-field" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Password</label>
              <div className="relative">
                <input {...register("password", { required: "Password is required", minLength: { value: 6, message: "Minimum 6 characters" } })}
                  type={showPw ? "text" : "password"} placeholder="••••••••" className="input-field pr-10" />
                <button type="button" tabIndex={-1} onClick={() => setShowPw((p) => !p)}
                  className="password-toggle-btn" aria-label={showPw ? "Hide password" : "Show password"}>
                  {showPw ? <FaEyeSlash size={14} /> : <FaEye size={14} />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Confirm Password</label>
              <input {...register("confirm", { required: "Please confirm password", validate: (v) => v === watch("password") || "Passwords do not match" })}
                type={showPw ? "text" : "password"} placeholder="••••••••" className="input-field" />
              {errors.confirm && <p className="text-xs text-red-500 mt-1">{errors.confirm.message}</p>}
            </div>

            <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-2.5 mt-2">
              {isSubmitting ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="text-center text-sm text-theme-muted mt-6">
            Already have an account?{" "}
            <Link href="/login" className="text-theme-primary font-semibold hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
