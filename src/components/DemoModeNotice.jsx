"use client";
import { useEffect } from "react";
import toast from "react-hot-toast";
import { FaFlask } from "react-icons/fa";

// Demo Admin — third of three pieces (see src/lib/apiHandler.js for the
// server-side interception, src/lib/axios.js for the event dispatch this
// listens for). Every simulated mutating action fires a
// "demo-admin-action" DOM event; this is the one place in the whole app
// that listens for it and shows the popup the spec asks for — a distinct,
// unmissable "you're in demo mode, nothing was actually saved" notice,
// every single time, without any individual page needing to know Demo
// Admin exists at all.
//
// Deliberately uses its own fixed, friendly copy rather than echoing the
// raw API message verbatim: pages that call toast.success(res.data.message)
// on a normal successful action already surface that (technical-sounding,
// see apiHandler.js's buildDemoSimulatedResponse) message on their own —
// showing the exact same sentence a second time here would just look like
// a duplicate-toast glitch. This card says something complementary
// instead, so the two together read as "it worked (per the page's own
// toast) — and by the way, that was just a demo (per this card)," not an
// echo of the same line twice.
//
// Built on the Toaster already mounted in Providers.jsx (toast.custom)
// rather than a new portal/overlay system — same stacking, positioning
// and dismissal behavior already relied on everywhere else in this app.
// A fixed toast id means clicking through several actions quickly
// refreshes/extends the same card instead of stacking a wall of
// duplicates on top of each other.
export default function DemoModeNotice() {
  useEffect(() => {
    function handleDemoAction() {
      toast.custom(
        (t) => (
          <div
            className="modal-box max-w-sm flex items-start gap-3 shadow-lg"
            style={{
              borderWidth: 2,
              borderColor: "var(--color-secondary)",
              opacity: t.visible ? 1 : 0,
              transform: t.visible ? "translateY(0)" : "translateY(-8px)",
              transition: "opacity 0.2s ease, transform 0.2s ease",
            }}
            role="status"
          >
            <div
              className="shrink-0 h-9 w-9 rounded-full flex items-center justify-center"
              style={{
                backgroundColor: "color-mix(in srgb, var(--color-secondary) 18%, transparent)",
                color: "var(--color-secondary)",
              }}
            >
              <FaFlask size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide mb-0.5" style={{ color: "var(--color-secondary)" }}>
                Demo Mode
              </p>
              <p className="text-sm text-theme leading-snug">
                Nothing was actually saved or changed on the real site — you're safely exploring a demo account. Keep clicking around!
              </p>
            </div>
          </div>
        ),
        { id: "demo-mode-notice", duration: 4500 }
      );
    }

    window.addEventListener("demo-admin-action", handleDemoAction);
    return () => window.removeEventListener("demo-admin-action", handleDemoAction);
  }, []);

  return null;
}
