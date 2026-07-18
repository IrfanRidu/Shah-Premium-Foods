"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError } from "@/lib/utils";
import toast from "react-hot-toast";

export default function ForgotPasswordPage() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm();
  const router = useRouter();

  const onSubmit = async ({ email }) => {
    try {
      const r = await Axios({ ...api.forgotPassword, data: { email } });
      if (r.data?.success) {
        toast.success("OTP sent to your email");
        router.push(`/verify-otp?email=${encodeURIComponent(email)}&mode=reset`);
      }
    } catch (err) { axiosToastError(err); }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="modal-box p-8">
          <h1 className="font-display text-3xl font-bold mb-1">Forgot password?</h1>
          <p className="text-sm text-theme-muted mb-7">Enter your email and we'll send you an OTP</p>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Email</label>
              <input
                {...register("email", { required: "Email is required", pattern: { value: /\S+@\S+\.\S+/, message: "Invalid email" } })}
                type="email" placeholder="you@example.com" className="input-field"
              />
              {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
            </div>
            <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-2.5">
              {isSubmitting ? "Sending…" : "Send OTP"}
            </button>
          </form>
          <p className="text-center text-sm text-theme-muted mt-6">
            <Link href="/login" className="text-theme-primary font-semibold hover:underline">Back to login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
