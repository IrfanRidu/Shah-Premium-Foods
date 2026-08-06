"use client";
import { useState, useRef, useEffect, Suspense } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useForm } from "react-hook-form";
import { useSearchParams } from "next/navigation";
import { FaCamera, FaCheckCircle, FaDesktop, FaMobileAlt, FaSignOutAlt, FaUser, FaMapMarkerAlt, FaShieldAlt } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { setUserDetails, updatedAvatar } from "@/store/userSlice";
import { axiosToastError } from "@/lib/utils";
import SafeImage from "@/components/SafeImage";
import AddressBook from "@/components/AddressBook";
import toast from "react-hot-toast";

const TABS = [
  { id: "info",      label: "Profile Info", icon: FaUser },
  { id: "addresses", label: "Addresses",    icon: FaMapMarkerAlt },
  { id: "security",  label: "Security",     icon: FaShieldAlt },
];

// "Everything else will be under my profile" — Addresses (previously its
// own top-level dropdown link) and account security (2FA + sessions,
// previously just stacked below the form on this same page) are now tabs
// here instead, so the dropdown itself can stay down to the 4 items the
// spec asked for. useSearchParams wrapped in Suspense per Next.js's own
// requirement for any component that reads it in the App Router.
function ProfileTabs() {
  const searchParams = useSearchParams();
  const initialTab = TABS.some((t) => t.id === searchParams.get("tab")) ? searchParams.get("tab") : "info";
  const [tab, setTab] = useState(initialTab);

  return (
    <div>
      <h1 className="section-heading text-2xl mb-6">My Profile</h1>

      <div className="flex gap-2 mb-6 border-b border-theme overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${tab === id ? "border-theme-primary text-theme-primary" : "border-transparent text-theme-muted hover:text-theme"}`}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {tab === "info" && <ProfileInfoTab />}
      {tab === "addresses" && <AddressBook showHeading={false} />}
      {tab === "security" && (
        <div className="max-w-xl">
          <TwoFactorSection />
          <SessionsSection />
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="text-sm text-theme-muted">Loading…</div>}>
      <ProfileTabs />
    </Suspense>
  );
}

function ProfileInfoTab() {
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
    <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-6 max-w-xl">

      {/* Avatar — clicking the div itself opens the picker; no disabled ever on the input */}
      <div className="flex justify-center mb-7">
        <div
          className="relative cursor-pointer group"
          onClick={() => !uploading && fileInputRef.current?.click()}
          title="Click to change profile picture"
        >
          <div className="relative h-24 w-24 rounded-full overflow-hidden border-2 border-theme ring-2 ring-[var(--color-primary)]/20">
            {avatarSrc
              ? <SafeImage src={avatarSrc} alt={user.name} fill sizes="96px" className="object-cover" />
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
  );
}

function TwoFactorSection() {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.user);
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    const next = !user.twoFactorEnabled;
    try {
      setSaving(true);
      const r = await Axios({ ...api.updateTwoFactor, data: { enabled: next } });
      if (r.data?.success) {
        dispatch(setUserDetails({ ...user, twoFactorEnabled: next }));
        toast.success(next ? "Two-factor authentication enabled" : "Two-factor authentication disabled");
      }
    } catch (err) { axiosToastError(err); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-[var(--color-surface)] border border-theme rounded-2xl shadow-sm p-6">
      <h2 className="font-serif text-lg font-semibold mb-1">Two-Factor Authentication</h2>
      <p className="text-sm text-theme-muted mb-4">
        When enabled, we'll email you a 6-digit code to enter every time you sign in — an
        extra layer of protection if your password is ever compromised.
      </p>
      <label className="flex items-center gap-3 cursor-pointer w-fit">
        <input type="checkbox" checked={!!user.twoFactorEnabled} onChange={toggle} disabled={saving} className="h-4 w-4" />
        <span className="text-sm font-medium">
          {user.twoFactorEnabled ? "Enabled" : "Disabled"} — {saving ? "Saving…" : (user.twoFactorEnabled ? "click to disable" : "click to enable")}
        </span>
      </label>
    </div>
  );
}

function SessionsSection() {
  const [sessions, setSessions] = useState(null); // null = loading
  const [busyId, setBusyId] = useState(null);
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  const load = async () => {
    try {
      const res = await Axios(api.listSessions);
      setSessions(res.data?.data || []);
    } catch {
      setSessions([]);
    }
  };

  useEffect(() => { load(); }, []);

  const revoke = async (id) => {
    setBusyId(id);
    try {
      await Axios({ ...api.revokeSession, data: { sessionId: id } });
      toast.success("Device signed out");
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      axiosToastError(err);
    } finally {
      setBusyId(null);
    }
  };

  const logoutAll = async () => {
    if (!confirm("Sign out of all devices, including this one?")) return;
    setLoggingOutAll(true);
    try {
      await Axios(api.logoutAllDevices);
      toast.success("Logged out of all devices");
      // This device's session was just revoked too — send them to login.
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      window.location.href = "/login";
    } catch (err) {
      axiosToastError(err);
      setLoggingOutAll(false);
    }
  };

  return (
    <div className="bg-[var(--color-surface)] border border-theme rounded-2xl shadow-sm p-6 mt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-serif text-lg font-semibold">Active Sessions</h2>
        {sessions?.length > 1 && (
          <button onClick={logoutAll} disabled={loggingOutAll}
            className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-60">
            Log out of all devices
          </button>
        )}
      </div>

      {sessions === null && <p className="text-sm text-theme-muted">Loading…</p>}
      {sessions?.length === 0 && <p className="text-sm text-theme-muted">No other active sessions.</p>}

      <div className="space-y-2">
        {sessions?.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 bg-[var(--color-bg)] border border-theme rounded-xl px-3 py-2.5">
            <div className="flex items-center gap-3 min-w-0">
              {/mobile|iphone|android/i.test(s.device) ? <FaMobileAlt className="text-theme-muted shrink-0" /> : <FaDesktop className="text-theme-muted shrink-0" />}
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {s.device} {s.isCurrent && <span className="text-[11px] font-normal text-green-600">(this device)</span>}
                </p>
                <p className="text-xs text-theme-muted">
                  Last active {new Date(s.lastUsedAt).toLocaleString()}
                </p>
              </div>
            </div>
            {!s.isCurrent && (
              <button onClick={() => revoke(s.id)} disabled={busyId === s.id}
                className="text-theme-muted hover:text-red-600 shrink-0 disabled:opacity-50" title="Sign out this device">
                <FaSignOutAlt />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
