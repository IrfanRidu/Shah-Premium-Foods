"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSelector } from "react-redux";
import {
  FaStore, FaChartLine, FaHeadset, FaCog, FaUserTie, FaUserShield,
  FaBoxOpen, FaExclamationTriangle, FaClipboardList, FaTicketAlt, FaUsers,
  FaArrowRight, FaFlask,
} from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError } from "@/lib/utils";

// The dashboard homepage — "after entering the Super Admin dashboard the
// homepage will display a brief overview of all sections." Each card
// below maps 1:1 to one of the 6 sidebar categories (dashboard/layout.jsx)
// and is itself a link into that section, so on mobile — where the
// sidebar is hidden (md:flex only) and the header dropdown now only has a
// single "Go to Dashboard" entry point instead of 15 individual links —
// this page doubles as the actual navigation hub into the rest of the
// dashboard, not just a read-only stats screen.
const CARD_META = {
  products: {
    title: "Products", icon: FaStore, href: "/dashboard/product",
    render: (d) => [
      { icon: FaBoxOpen, label: "Products", value: d.productCount },
      { icon: FaExclamationTriangle, label: "Low stock", value: d.lowStockCount },
      { icon: FaClipboardList, label: "Pending requests", value: d.pendingRequests },
    ],
  },
  analytics: {
    title: "Analytics", icon: FaChartLine, href: "/dashboard/analytics",
    render: (d) => [
      { icon: FaClipboardList, label: "Orders today", value: d.ordersToday },
      { icon: FaBoxOpen, label: "Delivered (all time)", value: d.deliveredTotal },
    ],
  },
  customerCare: {
    title: "Customer care and call center", icon: FaHeadset, href: "/dashboard/customer-care",
    render: (d) => [
      d.pendingOrders !== null && { icon: FaClipboardList, label: "Orders in progress", value: d.pendingOrders },
      d.openTickets !== null && { icon: FaTicketAlt, label: "Open tickets", value: d.openTickets },
      d.customerCount !== null && { icon: FaUsers, label: "Customers", value: d.customerCount },
    ].filter(Boolean),
  },
  websiteMaintenance: {
    title: "Website Maintenance", icon: FaCog, href: "/dashboard/site-settings",
    render: () => [],
    blurb: "Banners, campaigns, coupons, delivery zones and site settings.",
  },
  hrPayroll: {
    title: "HR and Payroll", icon: FaUserTie, href: "/dashboard/hr-payroll",
    render: (d) => [{ icon: FaUsers, label: "Active employees", value: d.employeeCount }],
  },
  security: {
    title: "Security and permissions", icon: FaUserShield, href: "/dashboard/roles",
    render: (d) => [
      { icon: FaUserShield, label: "Roles defined", value: d.roleCount },
      { icon: FaUsers, label: "Staff accounts", value: d.staffCount },
    ],
  },
};

function OverviewCard({ meta, data }) {
  const stats = meta.render(data);
  return (
    <Link
      href={meta.href}
      className="group bg-[var(--color-surface)] border border-theme rounded-2xl p-5 hover:border-theme-primary hover:shadow-sm transition-all"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span
            className="h-9 w-9 rounded-xl flex items-center justify-center text-theme-primary"
            style={{ backgroundColor: "color-mix(in srgb, var(--color-primary) 12%, transparent)" }}
          >
            <meta.icon size={16} />
          </span>
          <h3 className="font-semibold text-sm">{meta.title}</h3>
        </div>
        <FaArrowRight size={12} className="text-theme-muted opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {stats.length > 0 ? (
        <div className="grid grid-cols-1 gap-1.5">
          {stats.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-theme-muted">
                <Icon size={11} /> {label}
              </span>
              <span className="font-bold">{value ?? "—"}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-theme-muted">{meta.blurb}</p>
      )}
    </Link>
  );
}

function CardSkeleton() {
  return (
    <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5 animate-pulse">
      <div className="h-9 w-9 rounded-xl bg-[var(--color-border)] mb-3" />
      <div className="h-3 w-24 bg-[var(--color-border)] rounded mb-4" />
      <div className="h-3 w-full bg-[var(--color-border)] rounded mb-2" />
      <div className="h-3 w-2/3 bg-[var(--color-border)] rounded" />
    </div>
  );
}

export default function DashboardHomePage() {
  const user   = useSelector((s) => s.user);
  const router = useRouter();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [notStaff, setNotStaff] = useState(false);

  useEffect(() => {
    // A plain customer landing on bare /dashboard doesn't have "sections"
    // to overview — send them to the page their own dropdown/sidebar
    // actually points at. Wait for the role to actually be known (it's
    // empty for an instant on first load while GlobalProvider's fetchUser
    // is still in flight) rather than redirecting on a false-empty read.
    if (!user.role) return;
    if (user.role === "USER") {
      router.replace("/dashboard/profile");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await Axios({ ...api.getDashboardOverview });
        if (!cancelled) setOverview(res.data.data);
      } catch (err) {
        if (!cancelled) { setNotStaff(true); axiosToastError(err); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user.role, router]);

  if (user.role === "USER" || !user.role) {
    return null; // redirecting, or still figuring out who's logged in
  }

  const visibleCards = overview
    ? Object.keys(overview.sections).map((key) => ({ key, meta: CARD_META[key], data: overview.sections[key] })).filter((c) => c.meta)
    : [];

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <h1 className="section-heading text-2xl">Dashboard Overview</h1>
        {user.role === "DEMO_ADMIN" && (
          <span
            className="inline-flex items-center gap-1 badge"
            style={{ backgroundColor: "color-mix(in srgb, var(--color-secondary) 16%, transparent)", color: "var(--color-secondary)" }}
          >
            <FaFlask size={9} /> DEMO MODE
          </span>
        )}
      </div>
      <p className="text-sm text-theme-muted mb-6">
        A quick look at every section you can access. Click any card to open it.
      </p>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : notStaff ? (
        <p className="text-sm text-theme-muted">Couldn't load your dashboard overview — try refreshing.</p>
      ) : visibleCards.length === 0 ? (
        <p className="text-sm text-theme-muted">
          Your account doesn't have access to any dashboard sections yet — ask an admin to assign you permissions.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleCards.map(({ key, meta, data }) => (
            <OverviewCard key={key} meta={meta} data={data} />
          ))}
        </div>
      )}
    </div>
  );
}
