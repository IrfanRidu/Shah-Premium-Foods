"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSelector } from "react-redux";
import {
  FaUser, FaBox, FaMapMarkerAlt, FaCog, FaStore, FaClipboardList,
  FaUsers, FaUpload, FaBolt, FaTag, FaWarehouse, FaChartLine, FaUserShield,
  FaTruck, FaFileAlt, FaHeadset, FaUserTie,
} from "react-icons/fa";
import { isAdmin, isSuperAdmin } from "@/lib/utils";
import NotificationBell from "@/components/NotificationBell";

const USER_LINKS = [
  { href: "/dashboard/profile",  label: "My Profile",  icon: FaUser },
  { href: "/dashboard/myorders", label: "My Orders",   icon: FaBox },
  { href: "/dashboard/address",  label: "Addresses",   icon: FaMapMarkerAlt },
  { href: "/dashboard/submit-list", label: "Submit Shopping List", icon: FaFileAlt },
];

// Each admin link declares which permission module/action it needs
const ADMIN_LINKS = [
  { href: "/dashboard/category",       label: "Categories",     icon: FaStore,        module: "categories", action: "view" },
  { href: "/dashboard/subcategory",    label: "Sub-Categories", icon: FaStore,        module: "categories", action: "view" },
  { href: "/dashboard/product",        label: "Products",       icon: FaBox,          module: "products",   action: "view" },
  { href: "/dashboard/upload-product", label: "Upload Product", icon: FaUpload,       module: "products",   action: "create" },
  { href: "/dashboard/inventory",      label: "Inventory",      icon: FaWarehouse,    module: "inventory",  action: "view" },
  { href: "/dashboard/product-requests", label: "Product Requests", icon: FaFileAlt, module: "inventory", action: "view" },
  { href: "/dashboard/campaigns",      label: "Campaigns",      icon: FaBolt,         module: "campaigns", action: "view" },
  { href: "/dashboard/coupons",        label: "Coupons",        icon: FaTag,          module: "coupons",    action: "view" },
  { href: "/dashboard/delivery-zones", label: "Delivery Zones", icon: FaTruck,        module: "settings",   action: "view" },
  { href: "/dashboard/admin-orders",   label: "All Orders",     icon: FaClipboardList,module: "orders",     action: "view" },
  { href: "/dashboard/customer-care",  label: "Customer Care",  icon: FaHeadset,      module: "customerCare", action: "view" },
  { href: "/dashboard/hr-payroll",     label: "HR & Payroll",   icon: FaUserTie,      module: "hrPayroll",  action: "view" },
  { href: "/dashboard/admin-users",    label: "Customers",      icon: FaUsers,        module: "customers",  action: "view" },
  { href: "/dashboard/analytics",      label: "Analytics",      icon: FaChartLine,    module: "analytics",  action: "view" },
  { href: "/dashboard/site-settings",  label: "Site Settings",  icon: FaCog,          module: "settings",   action: "view" },
  { href: "/dashboard/roles",          label: "Roles & Staff",  icon: FaUserShield,   module: "roles",      action: "view", superAdminOnly: true },
];

function SideLink({ href, label, icon: Icon }) {
  const path = usePathname();
  const active = path === href;
  return (
    <Link href={href}
      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${active ? "bg-theme-primary text-white shadow-sm" : "hover:bg-[var(--color-border)] text-theme"}`}>
      <Icon size={15} />
      {label}
    </Link>
  );
}

export default function DashboardLayout({ children }) {
  const user        = useSelector((s) => s.user);
  const permissions = useSelector((s) => s.permissions.permissions);

  const canSee = (link) => {
    if (isSuperAdmin(user.role)) return true;
    if (link.superAdminOnly) return false;
    if (user.role === "ADMIN" && !permissions?.[link.module]) return true; // legacy admin fallback (full access)
    return !!permissions?.[link.module]?.[link.action];
  };

  const visibleAdminLinks = ADMIN_LINKS.filter(canSee);
  const showAdminSection = isAdmin(user.role) || visibleAdminLinks.length > 0;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Fix 4: on mobile the sidebar (and its notification bell) is
          hidden, so surface the bell here too. */}
      <div className="flex md:hidden justify-end mb-3">
        <NotificationBell />
      </div>
      <div className="flex gap-6">
        {/* Sidebar */}
        <aside className="hidden md:flex flex-col gap-1 w-56 shrink-0">
          <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-4 mb-2">
            <div className="flex items-center justify-end mb-2">
              <NotificationBell />
            </div>
            <div className="flex items-center gap-3">
              {user.avatar
                ? <img src={user.avatar} alt={user.name} className="h-10 w-10 rounded-full object-cover" />
                : <div className="h-10 w-10 rounded-full bg-[var(--color-border)] flex items-center justify-center text-theme-muted"><FaUser /></div>
              }
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{user.name}</p>
                <p className="text-xs text-theme-muted truncate">{user.email}</p>
                {user.role && user.role !== "USER" && (
                  <span className="badge text-[10px] mt-0.5">{user.role}</span>
                )}
              </div>
            </div>
          </div>

          <nav className="flex flex-col gap-1">
            {USER_LINKS.map((l) => <SideLink key={l.href} {...l} />)}
            {showAdminSection && visibleAdminLinks.length > 0 && (
              <>
                <p className="px-4 pt-3 pb-1 text-xs uppercase tracking-widest text-theme-muted font-semibold">Admin</p>
                {visibleAdminLinks.map((l) => <SideLink key={l.href} {...l} />)}
              </>
            )}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
