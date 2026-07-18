"use client";
import Link from "next/link";
import { useDispatch, useSelector } from "react-redux";
import { useRouter } from "next/navigation";
import {
  FaUser, FaBox, FaMapMarkerAlt, FaCog, FaSignOutAlt, FaUsers,
  FaClipboardList, FaStore, FaBolt, FaTag, FaWarehouse, FaChartLine, FaUserShield,
  FaFileAlt, FaTruck, FaLayerGroup, FaHeadset, FaMoneyCheckAlt,
} from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { logout } from "@/store/userSlice";
import { resetCart } from "@/store/cartSlice";
import { clearPermissions } from "@/store/permissionsSlice";
import { isAdmin, isSuperAdmin } from "@/lib/utils";
import toast from "react-hot-toast";

const MENU = [
  { href: "/dashboard/profile",      label: "My Profile",           icon: FaUser },
  { href: "/dashboard/myorders",     label: "My Orders",            icon: FaBox },
  { href: "/dashboard/address",      label: "Addresses",            icon: FaMapMarkerAlt },
  { href: "/dashboard/submit-list",  label: "Submit Shopping List", icon: FaFileAlt },
];

const ADMIN_MENU = [
  { href: "/dashboard/category",         label: "Categories",      icon: FaStore,       module: "categories" },
  { href: "/dashboard/subcategory",      label: "Subcategories",   icon: FaLayerGroup,  module: "categories" },
  { href: "/dashboard/product",          label: "Products",        icon: FaBox,         module: "products" },
  { href: "/dashboard/inventory",        label: "Inventory",       icon: FaWarehouse,   module: "inventory" },
  { href: "/dashboard/product-requests", label: "Product Requests",icon: FaFileAlt,     module: "inventory" },
  { href: "/dashboard/campaigns",        label: "Campaigns",       icon: FaBolt,        module: "campaigns" },
  { href: "/dashboard/coupons",          label: "Coupons",         icon: FaTag,         module: "coupons" },
  { href: "/dashboard/delivery-zones",   label: "Delivery Zones",  icon: FaTruck,       module: "settings" },
  { href: "/dashboard/admin-orders",     label: "All Orders",      icon: FaClipboardList, module: "orders" },
  { href: "/dashboard/admin-users",      label: "Customers",       icon: FaUsers,       module: "customers" },
  { href: "/dashboard/customer-care",    label: "Customer Care",   icon: FaHeadset,     module: "customerCare" },
  { href: "/dashboard/hr-payroll",       label: "HR & Payroll",    icon: FaMoneyCheckAlt, module: "hrPayroll" },
  { href: "/dashboard/analytics",        label: "Analytics",       icon: FaChartLine,   module: "analytics" },
  { href: "/dashboard/site-settings",    label: "Site Settings",   icon: FaCog,         module: "settings" },
  { href: "/dashboard/roles",            label: "Roles & Staff",   icon: FaUserShield,  module: "roles", superAdminOnly: true },
];

export default function UserMenu({ close }) {
  const user        = useSelector((s) => s.user);
  const permissions = useSelector((s) => s.permissions.permissions);
  const dispatch    = useDispatch();
  const router      = useRouter();

  const canSee = (item) => {
    if (isSuperAdmin(user.role)) return true;
    if (item.superAdminOnly) return false;
    if (user.role === "ADMIN" && !permissions?.[item.module]) return true;
    return !!permissions?.[item.module]?.view;
  };

  const visibleAdminMenu = ADMIN_MENU.filter(canSee);
  const showAdminSection = isAdmin(user.role) || visibleAdminMenu.length > 0;

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
        {user.role && user.role !== "USER" && <span className="badge mt-1">{user.role}</span>}
      </div>

      <div className="py-1">
        {MENU.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} onClick={close}
            className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-[var(--color-border)] transition-colors">
            <Icon className="text-theme-muted" size={14} />
            {label}
          </Link>
        ))}
      </div>

      {showAdminSection && visibleAdminMenu.length > 0 && (
        <div className="border-t border-theme pt-1">
          <p className="px-4 py-1 text-xs uppercase tracking-widest text-theme-muted font-semibold">Admin</p>
          {visibleAdminMenu.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} onClick={close}
              className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-[var(--color-border)] transition-colors">
              <Icon className="text-theme-muted" size={14} />
              {label}
            </Link>
          ))}
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
