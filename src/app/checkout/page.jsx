"use client";
import { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { displayPrice, priceWithDiscount, axiosToastError } from "@/lib/utils";
import { resetCart } from "@/store/cartSlice";
import { clearAppliedCoupon } from "@/store/couponSlice";
import { useGlobalContext } from "@/providers/GlobalProvider";
import NoData from "@/components/NoData";
import { FaTruck, FaInfoCircle } from "react-icons/fa";
import { useTranslation } from "@/lib/i18n";
import toast from "react-hot-toast";

export default function CheckoutPage() {
  const { t }          = useTranslation();
  const router        = useRouter();
  const dispatch      = useDispatch();
  const { fetchOrders } = useGlobalContext();
  const currency      = useSelector((s) => s.currency.selected);
  const rates         = useSelector((s) => s.currency.rates);
  const cart          = useSelector((s) => s.cartItem.cart);
  const user          = useSelector((s) => s.user);
  const addressList   = useSelector((s) => s.address.addressList);
  const discount      = useSelector((s) => s.coupon.discount);
  const appliedCoupon = useSelector((s) => s.coupon.appliedCoupon);
  const settings      = useSelector((s) => s.siteSettings);
  const codRequireCharge = settings?.codRequireDeliveryCharge || false;

  const [selectedAddr,   setSelectedAddr]   = useState(null);
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [payment,        setPayment]        = useState("cash");
  const [loading,        setLoading]        = useState(false);
  const [delivery,       setDelivery]       = useState({ charge: 0, zoneName: "", estimatedDays: "", loading: false });
  const [zones,          setZones]          = useState([]);
  const [zonesLoading,   setZonesLoading]   = useState(false);

  const subTotal = cart.reduce((s, i) => {
    const p = i.productId; if (!p) return s;
    return s + priceWithDiscount(p.price, p.discount) * i.quantity;
  }, 0);
  const totalAmt = Math.max(0, subTotal - discount + delivery.charge);

  // Note: coupon code entry ("Coupon / Promo Code" box + "view available
  // coupons") intentionally does not appear on this page — it's applied on
  // the Cart page instead, and reflected here as a read-only line in the
  // order summary below. Active coupons are fetched globally at app boot
  // (see GlobalProvider.fetchActiveCoupons) so no local fetch is needed here.

  // Fetch delivery zones for COD zone picker
  useEffect(() => {
    if (!api.getActiveZones) return;
    setZonesLoading(true);
    Axios({ ...api.getActiveZones }).then((r) => {
      if (r.data?.success) setZones(r.data.data || []);
    }).catch(() => {}).finally(() => setZonesLoading(false));
  }, []);

  // Auto-select zone when address changes (match by city)
  useEffect(() => {
    const addr = addressList.find((a) => a._id === selectedAddr);
    if (!addr || zones.length === 0) return;
    const cityLower = (addr.city || "").toLowerCase();
    const matched = zones.find((z) =>
      z.matchCities?.some((c) => c.toLowerCase() === cityLower)
    ) || zones.find((z) => z.isDefault) || zones[0];
    if (matched) setSelectedZoneId(matched._id);
  }, [selectedAddr, zones]);

  // Live delivery-charge quote whenever selected address or zone changes
  useEffect(() => {
    const addr = addressList.find((a) => a._id === selectedAddr);
    if (!addr) { setDelivery({ charge: 0, zoneName: "", estimatedDays: "", loading: false }); return; }
    setDelivery((p) => ({ ...p, loading: true }));
    Axios({ ...api.quoteDeliveryCharge, params: { city: addr.city, orderAmount: subTotal } })
      .then((r) => {
        if (r.data?.success) {
          setDelivery({ charge: r.data.data.charge || 0, zoneName: r.data.data.zoneName || "", estimatedDays: r.data.data.estimatedDays || "", loading: false });
          if (r.data.data.zoneId) setSelectedZoneId(r.data.data.zoneId);
        }
      })
      .catch(() => setDelivery((p) => ({ ...p, loading: false })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAddr, subTotal]);

  // Auto-select zone when manual zone dropdown changes
  const handleZoneChange = (zoneId) => {
    setSelectedZoneId(zoneId);
    const zone = zones.find((z) => z._id === zoneId);
    if (zone) {
      let charge = zone.charge;
      if (zone.freeDeliveryThreshold > 0 && subTotal >= zone.freeDeliveryThreshold) charge = 0;
      setDelivery({ charge, zoneName: zone.name, estimatedDays: zone.estimatedDays || "", loading: false });
    }
  };

  useEffect(() => {
    if (addressList.length === 1 && !selectedAddr) setSelectedAddr(addressList[0]._id);
  }, [addressList, selectedAddr]);

  if (!user._id) return (
    <div className="container mx-auto px-4 py-20 text-center">
      <p className="text-theme-muted mb-4">Please login to checkout</p>
      <Link href="/login" className="btn-primary">Login</Link>
    </div>
  );

  if (cart.length === 0) return (
    <div className="container mx-auto px-4 py-8 text-center">
      <NoData message="Cart is empty" />
      <Link href="/" className="btn-primary mt-4 inline-block">Continue Shopping</Link>
    </div>
  );

  // Validation
  // Fix (explicit request): a mobile number is no longer required on the
  // user's PROFILE to place an order (the Profile page itself already
  // treats it as optional — see profile/page.jsx, which never marked it
  // required). It's still genuinely needed to place an order, though — a
  // courier has to be able to reach whoever's receiving the delivery — so
  // the requirement now lives on the actual delivery details for THIS
  // order (the selected address) instead of the account profile. The
  // Address model/form already had a `mobile` field; it's now a required
  // field there (see dashboard/address/page.jsx) and enforced again here
  // as a final guard before an order can be placed.
  const missingInfo = [];
  if (!user.name) missingInfo.push("name");

  const selectedAddress = addressList.find((a) => a._id === selectedAddr);
  const addressMissingMobile = !!selectedAddress && !selectedAddress.mobile;

  const handleOrder = async () => {
    if (missingInfo.length > 0) {
      toast.error(`Please add your ${missingInfo.join(" and ")} in your profile before placing an order`);
      return;
    }
    if (!selectedAddr) { toast.error("Please select a delivery address"); return; }
    if (addressMissingMobile) {
      toast.error("Please add a mobile number to this delivery address before placing an order");
      return;
    }
    if (payment === "cash" && zones.length > 0 && !selectedZoneId) {
      toast.error("Please select a delivery zone for Cash on Delivery");
      return;
    }

    const mustPrepayDeliveryCharge = payment === "cash" && codRequireCharge && delivery.charge > 0;

    try {
      setLoading(true);
      const payload = {
        list_items: cart,
        addressId: selectedAddr,
        subTotalAmt: subTotal,
        totalAmt,
        couponCode: appliedCoupon?.code || "",
        deliveryZoneId: selectedZoneId || undefined,
      };

      if (mustPrepayDeliveryCharge) {
        // Admin requires the delivery charge to be paid online before a COD
        // order is accepted — only that charge goes through Stripe, the
        // product total is still collected as cash on delivery.
        const r = await Axios({ ...api.payCodDeliveryCharge, data: payload });
        if (r.data?.data) window.location.href = r.data.data;
      } else if (payment === "cash") {
        const r = await Axios({ ...api.cashOnDeliveryOrder, data: payload });
        if (r.data?.success) {
          dispatch(resetCart());
          dispatch(clearAppliedCoupon());
          await fetchOrders();
          router.push("/success");
        }
      } else {
        const r = await Axios({ ...api.checkoutOrder, data: payload });
        if (r.data?.data) window.location.href = r.data.data;
      }
    } catch (err) {
      axiosToastError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="section-heading text-3xl mb-7">{t("checkout.title")}</h1>

      {/* Profile info warning (name only — mobile is no longer required on the profile) */}
      {missingInfo.length > 0 && (
        <div className="mb-5 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <FaInfoCircle className="shrink-0 mt-0.5" />
          <span>
            Please add your <strong>{missingInfo.join(" and ")}</strong> in{" "}
            <Link href="/dashboard/profile" className="underline font-semibold">your profile</Link>{" "}
            before placing an order.
          </span>
        </div>
      )}

      {/* Delivery-address mobile number warning — required per order, not on the profile */}
      {addressMissingMobile && (
        <div className="mb-5 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <FaInfoCircle className="shrink-0 mt-0.5" />
          <span>
            This delivery address doesn't have a mobile number yet. Please{" "}
            <Link href="/dashboard/address" className="underline font-semibold">add one to this address</Link>{" "}
            before placing an order — the courier needs a way to reach you.
          </span>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* ── Left ── */}
        <div className="lg:col-span-2 space-y-5">
          {/* Address */}
          <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-semibold">{t("checkout.deliveryAddress")}</h2>
              <Link href="/dashboard/address" className="text-sm text-theme-primary hover:underline">{t("checkout.addNew")}</Link>
            </div>
            {addressList.length === 0 ? (
              <p className="text-sm text-theme-muted">
                No addresses saved.{" "}
                <Link href="/dashboard/address" className="text-theme-primary underline">Add one →</Link>
              </p>
            ) : (
              <div className="space-y-2">
                {addressList.map((addr) => (
                  <label key={addr._id}
                    className={`flex gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedAddr === addr._id ? "border-theme-primary bg-[color-mix(in_srgb,var(--color-primary)_5%,transparent)]" : "border-theme"}`}>
                    <input type="radio" name="address" value={addr._id} checked={selectedAddr === addr._id}
                      onChange={() => setSelectedAddr(addr._id)}
                      className="mt-0.5 accent-[var(--color-primary)]" />
                    <div className="text-sm">
                      <p className="font-semibold">{addr.address_line}</p>
                      <p className="text-theme-muted">{[addr.city, addr.state, addr.pincode, addr.country].filter(Boolean).join(", ")}</p>
                      {addr.mobile
                        ? <p className="text-theme-muted">{addr.mobile}</p>
                        : (
                          <p className="text-amber-600 text-xs font-medium mt-0.5">
                            No mobile number — <Link href="/dashboard/address" className="underline">add one</Link> before placing an order
                          </p>
                        )}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Delivery Zone (COD only) */}
          {payment === "cash" && zones.length > 0 && (
            <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5">
              <h2 className="font-display text-lg font-semibold mb-4">{t("checkout.deliveryZone")}</h2>
              <p className="text-xs text-theme-muted mb-3">Select your delivery zone for Cash on Delivery</p>
              <div className="space-y-2">
                {zonesLoading ? (
                  <div className="text-sm text-theme-muted">Loading zones…</div>
                ) : zones.map((zone) => {
                  let charge = zone.charge;
                  if (zone.freeDeliveryThreshold > 0 && subTotal >= zone.freeDeliveryThreshold) charge = 0;
                  return (
                    <label key={zone._id}
                      className={`flex gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedZoneId === zone._id ? "border-theme-primary bg-[color-mix(in_srgb,var(--color-primary)_5%,transparent)]" : "border-theme"}`}>
                      <input type="radio" name="zone" value={zone._id} checked={selectedZoneId === zone._id}
                        onChange={() => handleZoneChange(zone._id)}
                        className="mt-0.5 accent-[var(--color-primary)]" />
                      <div className="flex-1 text-sm">
                        <p className="font-semibold">{zone.name}</p>
                        {zone.estimatedDays && <p className="text-xs text-theme-muted">Est. {zone.estimatedDays}</p>}
                      </div>
                      <div className="text-sm font-bold text-theme-primary shrink-0">
                        {charge === 0 ? <span className="text-green-600">Free</span> : displayPrice(charge, currency, rates)}
                      </div>
                    </label>
                  );
                })}
              </div>
              {codRequireCharge && (
                <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                  <FaInfoCircle size={11} /> The delivery charge must be paid online to confirm a Cash on Delivery order — see the breakdown in your order summary.
                </p>
              )}
            </div>
          )}

          {/* Payment */}
          <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5">
            <h2 className="font-display text-lg font-semibold mb-4">{t("checkout.paymentMethod")}</h2>
            <div className="space-y-3">
              {[
                ["cash",   t("checkout.cashOnDelivery"),
                  codRequireCharge
                    ? "Pay the delivery charge online now — the rest is paid in cash on arrival"
                    : "Pay when your order arrives at your door"],
                ["online", t("checkout.onlinePayment"),     "Credit/Debit card, bKash, Nagad, Rocket…"],
              ].map(([val, label, desc]) => (
                <label key={val}
                  className={`flex gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${payment === val ? "border-theme-primary bg-[color-mix(in_srgb,var(--color-primary)_5%,transparent)]" : "border-theme"}`}>
                  <input type="radio" name="payment" value={val} checked={payment === val}
                    onChange={() => setPayment(val)}
                    className="mt-0.5 accent-[var(--color-primary)]" />
                  <div>
                    <p className="font-semibold text-sm">{label}</p>
                    <p className="text-xs text-theme-muted">{desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* ── Order summary ── */}
        <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5 h-fit sticky top-24">
          <h2 className="font-display text-lg font-semibold mb-4">{t("checkout.orderSummary")}</h2>

          <div className="space-y-3 mb-4 max-h-56 overflow-y-auto">
            {cart.map((item) => {
              const p = item.productId; if (!p) return null;
              return (
                <div key={item._id} className="flex gap-2 items-center text-sm">
                  <img src={p.image?.[0]} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-theme-muted text-xs">x{item.quantity}</p>
                  </div>
                  <span className="font-semibold shrink-0">
                    {displayPrice(priceWithDiscount(p.price, p.discount) * item.quantity, currency, rates)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="border-t border-theme pt-3 space-y-2 mb-4 text-sm">
            <div className="flex justify-between"><span className="text-theme-muted">{t("checkout.subtotal")}</span><span>{displayPrice(subTotal, currency, rates)}</span></div>
            {discount > 0 && (
              <div className="flex justify-between text-green-600 font-semibold">
                <span>Coupon ({appliedCoupon?.code})</span>
                <span>- {displayPrice(discount, currency, rates)}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-theme-muted flex items-center gap-1.5">
                <FaTruck size={12} />
                {t("checkout.delivery")}{delivery.zoneName ? ` (${delivery.zoneName})` : ""}
              </span>
              <span className={delivery.charge === 0 && selectedAddr ? "text-green-600 font-semibold" : ""}>
                {delivery.loading ? "…" : !selectedAddr ? "Select address" : delivery.charge === 0 ? "Free" : displayPrice(delivery.charge, currency, rates)}
              </span>
            </div>
            {delivery.estimatedDays && (
              <p className="text-xs text-theme-muted">Estimated delivery: {delivery.estimatedDays}</p>
            )}
            <div className="flex justify-between font-bold text-base pt-1 border-t border-theme">
              <span>{t("checkout.total")}</span>
              <span className="text-theme-primary">{displayPrice(totalAmt, currency, rates)}</span>
            </div>
            {payment === "cash" && codRequireCharge && delivery.charge > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mt-2 space-y-1 text-xs">
                <div className="flex justify-between text-amber-800">
                  <span>Pay online now (delivery charge)</span>
                  <span className="font-semibold">{displayPrice(delivery.charge, currency, rates)}</span>
                </div>
                <div className="flex justify-between text-amber-800">
                  <span>Cash due on delivery</span>
                  <span className="font-semibold">{displayPrice(Math.max(0, totalAmt - delivery.charge), currency, rates)}</span>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleOrder}
            disabled={loading || !selectedAddr || missingInfo.length > 0 || addressMissingMobile}
            className="btn-primary w-full py-3 disabled:opacity-60"
          >
            {loading
              ? "Processing…"
              : payment === "cash"
                ? (codRequireCharge && delivery.charge > 0 ? "Pay Delivery Charge & Place Order" : t("checkout.placeOrderCod"))
                : t("checkout.payNow")}
          </button>
        </div>
      </div>
    </div>
  );
}
