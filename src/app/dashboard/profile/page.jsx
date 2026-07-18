"use client";
import { useState, useRef, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useForm } from "react-hook-form";
import { FaCamera, FaCheckCircle } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { setUserDetails, updatedAvatar } from "@/store/userSlice";
import { axiosToastError } from "@/lib/utils";
import toast from "react-hot-toast";

export default function ProfilePage() {
  const user     = useSelector((s) => s.user);
  const dispatch = useDispatch();
  const [uploading,  setUploading]  = useState(false);
  const [preview,    setPreview]    = useState(null);
  const fileInputRef = useRef(null);

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm();

  useEffect(() => {
    if (user._id) {
      reset({ name: user.name || "", email: user.email || "", mobile: user.mobile || "" });
    }
  }, [user._id, user.name, user.email, user.mobile, reset]);

  // Fix 1: Profile picture upload — robust two-step flow
  const onAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    // Reset the input so the same file can be picked again next time
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;

    // Show local preview immediately for responsiveness
    const localURL = URL.createObjectURL(file);
    setPreview(localURL);

    try {
      setUploading(true);

      // Step 1: Upload file to cloud storage
      const fd = new FormData();
      fd.append("image", file);
      const uploaded = await Axios({ ...api.uploadImage, data: fd });
      const imageUrl = uploaded.data?.data?.url
        || uploaded.data?.data?.secure_url
        || uploaded.data?.url;

      if (!imageUrl) {
        setPreview(null);
        throw new Error("Image upload failed — no URL returned. Please check Cloudinary credentials in your .env file.");
      }

      // Step 2: Save the URL to the user profile
      const r = await Axios({
        ...api.uploadAvatar,
        data: { avatar: imageUrl },
        headers: { "Content-Type": "application/json" },
      });

      if (r.data?.success) {
        dispatch(updatedAvatar(imageUrl));
        setPreview(null); // clear local preview — Redux state now has the real URL
        toast.success("Profile picture updated!");
      } else {
        setPreview(null);
        toast.error(r.data?.message || "Failed to save avatar");
      }
    } catch (err) {
      setPreview(null);
      axiosToastError(err);
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (data) => {
    try {
      const r = await Axios({ ...api.updateUserDetails, data });
      if (r.data?.success) {
        dispatch(setUserDetails(r.data.data));
        toast.success("Profile updated");
      }
    } catch (err) {
      axiosToastError(err);
    }
  };

  const avatarSrc = preview || user.avatar;

  return (
    <div>
      <h1 className="section-heading text-2xl mb-6">My Profile</h1>
      <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-6 max-w-xl">

        {/* Avatar — clicking the div itself opens the picker; no disabled ever on the input */}
        <div className="flex justify-center mb-7">
          <div
            className="relative cursor-pointer group"
            onClick={() => !uploading && fileInputRef.current?.click()}
            title="Click to change profile picture"
          >
            <div className="h-24 w-24 rounded-full overflow-hidden border-2 border-theme ring-2 ring-[var(--color-primary)]/20">
              {avatarSrc
                ? <img src={avatarSrc} alt={user.name} className="w-full h-full object-cover" />
                : <div className="w-full h-full bg-[var(--color-border)] flex items-center justify-center text-3xl font-bold text-theme-muted">
                    {user.name?.[0]?.toUpperCase() || "?"}
                  </div>
              }
            </div>
            {/* Overlay */}
            <div className={`absolute inset-0 rounded-full flex items-center justify-center transition-opacity
              ${uploading ? "bg-black/50 opacity-100" : "bg-black/40 opacity-0 group-hover:opacity-100"}`}>
              {uploading
                ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <FaCamera className="text-white text-xl" />
              }
            </div>
            {/* Success checkmark briefly when upload done */}
            {!uploading && user.avatar && !preview && (
              <span className="absolute bottom-0 right-0 h-6 w-6 rounded-full bg-green-500 flex items-center justify-center border-2 border-white">
                <FaCheckCircle className="text-white" size={10} />
              </span>
            )}
          </div>
          {/* Hidden file input — never disabled, never inside a <label> */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={onAvatarChange}
            className="hidden"
          />
        </div>

        <p className="text-center text-xs text-theme-muted -mt-4 mb-6">
          {uploading ? "Uploading…" : "Click avatar to change"}
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Full Name</label>
            <input {...register("name", { required: "Name is required" })} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Email</label>
            <input value={user.email} readOnly className="input-field opacity-60 cursor-not-allowed" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Mobile / Phone</label>
            <input {...register("mobile")} type="tel" className="input-field" placeholder="+880…" />
          </div>
          <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-2.5">
            {isSubmitting ? "Saving…" : "Save Changes"}
          </button>
        </form>
      </div>
    </div>
  );
}
