"use client";
import { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { FaTruck } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { displayPrice } from "@/lib/utils";
import ReturnsQualityInfo from "./ReturnsQualityInfo";

// Session 4 (Luxury PDP redesign) — "Delivery information / Warranty
// details / Return policy" from the brief. Delivery is REAL data (the
// site's own configured delivery zones — GET /api/delivery-zones/active
// already existed, unused by any storefront UI until now). Returns and
// "Warranty" are handled differently on purpose: there's no policy page
// or siteSettings field anywhere in this codebase to source real return
// -policy terms from, and "warranty" doesn't map onto a perishable-food
// storefront in the first place — inventing specific binding claims
// (day counts, conditions) neither of us can verify would be a real
// business/legal liability if a customer relied on it. Both blocks stay
// deliberately truthful and non-committal (a support-contact prompt,
// and a general quality-assurance statement) rather than fabricated
// specifics — still fulfills the trust-signal purpose without
// pretending to know policy that doesn't exist in this system anywhere.
export default function DeliveryInfo() {
  const [zones, setZones] = useState(null); // null = loading, [] = none configured
  const currency = useSelector((s) => s.currency.selected);
  const rates = useSelector((s) => s.currency.rates);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await Axios({ ...api.getActiveZones });
        if (!cancelled && r.data?.success) setZones(r.data.data || []);
      } catch {
        // Supplementary trust info, not a critical path — degrade
        // silently to the generic fallback line rather than a toast.
        if (!cancelled) setZones([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Session 5 (user-reported, with screenshot: "the delivery section is
  // smaller than the other section — both section must be equal in
  // size"). Root cause traced to the PARENT grid in product/[product]/
  // page.jsx using `items-start`, so this card never stretched to match
  // the taller Purchase-panel card beside it — see that file's own
  // comment for the other half of this fix. `h-full` here is what lets
  // this card actually CONSUME the extra height once the parent starts
  // stretching it; `flex flex-col` + `flex-1` on each of the 3 rows below
  // spreads that extra height evenly across Delivery/Returns/Quality
  // Assurance instead of it bunching up as one dead gap at the bottom.
  return (
    <div className="rounded-2xl border border-theme divide-y divide-[var(--color-border)] overflow-hidden h-full flex flex-col">
      <div className="flex items-start gap-3 p-3.5 flex-1">
        <FaTruck className="text-theme-primary shrink-0 mt-0.5" size={16} aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">Delivery</p>
          {zones === null ? (
            <div className="skeleton h-3 w-40 mt-2" />
          ) : zones.length === 0 ? (
            <p className="text-xs text-theme-muted mt-0.5">Delivery options are confirmed at checkout.</p>
          ) : (
            <ul className="text-xs text-theme-muted mt-1 space-y-0.5">
              {zones.map((z) => (
                <li key={z._id}>
                  <span className="font-medium text-theme">{z.name}</span>
                  {z.estimatedDays ? ` · ${z.estimatedDays}` : ""}
                  {" · "}
                  {z.charge > 0 ? displayPrice(z.charge, currency, rates) : "Free"}
                  {z.freeDeliveryThreshold > 0 && ` (free over ${displayPrice(z.freeDeliveryThreshold, currency, rates)})`}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <ReturnsQualityInfo />
    </div>
  );
}
