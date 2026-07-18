"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError } from "@/lib/utils";
import toast from "react-hot-toast";

function Inner() {
  const [showPw, setShowPw] = useState(false);
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm();
  const router  = useRouter();
  const params  = useSearchParams();
  const email   = params.get("email") || "";

  const onSubmit = async ({ password }) => {
    try {
      const r = await Axios({ ...api.resetPassword, data: { email, newPassword: password, confirmPassword: password } });
      if (r.data?.success) { toast.success("Password reset!"); router.push("/login"); }
    } catch (err) { axiosToastError(err); }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="modal-box p-8">
          <h1 className="font-display text-3xl font-bold mb-1">Reset password</h1>
          <p className="text-sm text-theme-muted mb-7">Choose a new password for <strong>{email}</strong></p>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">New Password</label>
              <div className="relative">
                <input {...register("password", { required: "Required", minLength: { value: 6, message: "Min 6 chars" } })}
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
              <input {...register("confirm", { required: "Required", validate: (v) => v === watch("password") || "Passwords don't match" })}
                type={showPw ? "text" : "password"} placeholder="••••••••" className="input-field" />
              {errors.confirm && <p className="text-xs text-red-500 mt-1">{errors.confirm.message}</p>}
            </div>
            <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-2.5">
              {isSubmitting ? "Resetting…" : "Reset Password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return <Suspense><Inner /></Suspense>;
}
