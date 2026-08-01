"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { logout } from "@/store/userSlice";
import { resetCart } from "@/store/cartSlice";
import { clearPermissions } from "@/store/permissionsSlice";
import toast from "react-hot-toast";

// Section 13 (Admin Panel Security) — idle logout. Complements the
// role-based session timeout in generateAccessToken.js/
// generateRefreshToken.js: that bounds total session duration regardless
// of activity; this bounds duration of INactivity specifically — an admin
// who steps away from an unlocked screen shouldn't leave the dashboard
// open indefinitely just because their tokens are still technically
// valid. Mounted only from dashboard/layout.jsx (see that file), so this
// never runs on the storefront.
const ACTIVITY_EVENTS = ["mousemove", "keydown", "mousedown", "touchstart", "scroll", "wheel"];
const IDLE_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES || 20) * 60 * 1000;
const WARNING_BEFORE_MS = 60 * 1000; // show a "still there?" warning 60s before actually logging out

export default function IdleLogoutProvider({ children }) {
  const router = useRouter();
  const dispatch = useDispatch();
  const userId = useSelector((s) => s.user._id);
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(WARNING_BEFORE_MS / 1000);

  const idleTimerRef = useRef(null);
  const warningTimerRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  // Mirrors `showWarning` for the activity listener's closure — see why
  // below, in the effect that reads it.
  const showWarningRef = useRef(false);

  const clearAllTimers = () => {
    clearTimeout(idleTimerRef.current);
    clearTimeout(warningTimerRef.current);
    clearInterval(countdownIntervalRef.current);
  };

  const doLogout = useCallback(async () => {
    clearAllTimers();
    try { await Axios({ ...api.logout }); } catch {}
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    dispatch(logout());
    dispatch(resetCart());
    dispatch(clearPermissions());
    toast.error("You were logged out due to inactivity");
    router.push("/login");
  }, [dispatch, router]);

  const armTimers = useCallback(() => {
    clearAllTimers();
    setShowWarning(false);
    showWarningRef.current = false;

    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true);
      showWarningRef.current = true;
      setSecondsLeft(Math.floor(WARNING_BEFORE_MS / 1000));
      countdownIntervalRef.current = setInterval(() => {
        setSecondsLeft((s) => Math.max(0, s - 1));
      }, 1000);
    }, IDLE_TIMEOUT_MS - WARNING_BEFORE_MS);

    idleTimerRef.current = setTimeout(doLogout, IDLE_TIMEOUT_MS);
  }, [doLogout]);

  useEffect(() => {
    if (!userId) return undefined; // nobody logged in — nothing to time out

    armTimers();

    // Deliberately does NOT reset on every incidental activity event once
    // the warning is already showing — only the explicit "Stay logged in"
    // click does (see the button below). A stray mousemove/scroll while
    // someone's genuinely stepped away (a resting hand, a pet walking
    // across a trackpad) shouldn't silently keep an admin session alive;
    // this feature exists specifically to protect an unattended screen, so
    // requiring a deliberate action once the warning appears is the more
    // defensible choice here, not an oversight. Reads showWarningRef
    // (not the `showWarning` state directly) so this listener can stay
    // registered once for the whole idle/active cycle instead of being
    // torn down and re-added on every warning toggle.
    const handleActivity = () => {
      if (!showWarningRef.current) armTimers();
    };
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }));

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, handleActivity));
      clearAllTimers();
    };
  }, [userId, armTimers]);

  return (
    <>
      {children}
      {showWarning && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" role="alertdialog" aria-modal="true">
          <div className="bg-[var(--color-surface)] rounded-2xl p-6 max-w-sm w-full text-center shadow-xl border border-theme">
            <h3 className="font-display text-lg font-bold mb-2">Still there?</h3>
            <p className="text-sm text-theme-muted mb-5">
              You'll be logged out in <span className="font-semibold text-theme">{secondsLeft}s</span> due to inactivity.
            </p>
            <button onClick={armTimers} className="btn-primary w-full py-2.5 text-sm">
              Stay logged in
            </button>
          </div>
        </div>
      )}
    </>
  );
}
