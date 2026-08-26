"use client";
import Link from "next/link";
import { useDispatch, useSelector } from "react-redux";
import { useRouter } from "next/navigation";
import {
  FaUser, FaBox, FaHeart, FaSignOutAlt, FaFileAlt,
  FaUserShield, FaTachometerAlt, FaFlask,
} from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { logout } from "@/store/userSlice";
import { resetCart } from "@/store/cartSlice";
import { clearPermissions } from "@/store/permissionsSlice";
import { openWishlistDrawer } from "@/store/uiSlice";
import { isSuperAdmin, isDemoAdmin, isEmployeeRole } from "@/lib/utils";
import toast from "react-hot-toast";

// Everything a logged-in customer needs day-to-day. Addresses used to be
// a 5th top-level link here — it now lives inside My Profile as a tab
// instead (dashboard/profile/page.jsx), so this list stays short exactly
// the way the spec asked: My Profile, My Orders, Submit Shopping List,
// Wishlist.
// Session 5: Wishlist's `href` is kept (not removed) — it's still a real,
// working page, and this exact link is what a keyboard user / screen
// reader / "open in new tab" middle-click still needs to work normally.
// `action: "wishlist"` is checked at render time instead to ALSO open the
// drawer on a normal left-click, same "faster path, not a replacement"
// reasoning as the header icon's own comment.
const MENU = [
  { href: "/dashboard/profile",      label: "My Profile",           icon: FaUser },
  { href: "/dashboard/myorders",     label: "My Orders",            icon: FaBox },
  { href: "/dashboard/submit-list",  label: "Submit Shopping List", icon: FaFileAlt },
  { href: "/dashboard/wishlist",     label: "Wishlist",             icon: FaHeart, action: "wishlist" },
];

// The dropdown used to dump all ~15 individual admin routes straight in
// here (Categories, Products, Orders, ...) — that's the "too long"
// dropdown the spec calls out. Every admin-tier role now gets exactly ONE
// entry point instead; once inside, the properly-organized, collapsible
// sidebar (dashboard/layout.jsx) is where all of that actually lives.
function getDashboardEntry(role) {
  if (isSuperAdmin(role))  return { label: "Go to Super Admin Dashboard", icon: FaUserShield };
  if (isDemoAdmin(role))   return { label: "Go to Super Admin Dashboard (Demo)", icon: FaFlask };
  if (role === "ADMIN")    return { label: "Go to Admin Dashboard", icon: FaTachometerAlt };
  if (isEmployeeRole(role)) return { label: "Go to Dashboard", icon: FaTachometerAlt };
  return null;
}

export default function UserMenu({ close }) {
  const user     = useSelector((s) => s.user);
  const dispatch = useDispatch();
  const router   = useRouter();

  const dashboardEntry = getDashboardEntry(user.role);
  const demoMode = isDemoAdmin(user.role);

  const handleLogout = async () => {
    try { await Axios({ ...api.logout }); } catch {}
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    dispatch(logout());
    dispatch(resetCart());
    dispatch(clearPermissions());
    toast.success("Logged out");
    close?.();
    // Item 10: land back on the open storefront, not a login wall — a
    // logged-out visitor should be free to keep browsing every part of the
    // site (only actually placing an order requires logging back in).
    router.push("/");
  };

  return (
    <div className="w-64 bg-[var(--color-surface)] border border-theme rounded-xl shadow-xl py-2 overflow-hidden max-h-[80vh] overflow-y-auto">
      <div className="px-4 py-3 border-b border-theme">
        <p className="font-semibold text-sm truncate">{user.name}</p>
        <p className="text-xs text-theme-muted truncate">{user.email}</p>
        {user.role && user.role !== "USER" && (
          demoMode ? (
            <span
              className="inline-flex items-center gap-1 mt-1 badge"
              style={{ backgroundColor: "color-mix(in srgb, var(--color-secondary) 16%, transparent)", color: "var(--color-secondary)" }}
            >
              <FaFlask size={9} /> DEMO ADMIN
            </span>
          ) : (
            <span className="badge mt-1">{user.role}</span>
          )
        )}
      </div>

      <div className="py-1">
        {MENU.map(({ href, label, icon: Icon, action }) => (
          <Link
            key={href}
            href={href}
            onClick={(e) => {
              // Session 5: a plain left-click opens the drawer in place
              // instead of navigating; a modified click (middle-click,
              // ctrl/cmd+click — "open in new tab") is left completely
              // alone so it still opens the real /dashboard/wishlist page
              // normally, same as any other link on the site would.
              if (action === "wishlist" && e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                e.preventDefault();
                dispatch(openWishlistDrawer());
              }
              close?.();
            }}
            className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-[var(--color-border)] transition-colors">
            <Icon className="text-theme-muted" size={14} />
            {label}
          </Link>
        ))}
      </div>

      {dashboardEntry && (
        <div className="border-t border-theme pt-1">
          <Link href="/dashboard" onClick={close}
            className="flex items-center gap-3 px-4 py-2 text-sm font-medium hover:bg-[var(--color-border)] transition-colors"
            style={{ color: "var(--color-primary)" }}>
            <dashboardEntry.icon size={14} />
            {dashboardEntry.label}
          </Link>
        </div>
      )}

      <div className="border-t border-theme pt-1">
        <button onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors">
          <FaSignOutAlt size={14} />
          Logout
        </button>
      </div>
    </div>
  );
}
