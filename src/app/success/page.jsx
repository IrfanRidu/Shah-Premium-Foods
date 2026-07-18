"use client";
import { useEffect } from "react";
import Link from "next/link";
import { FaCheckCircle } from "react-icons/fa";
import { useGlobalContext } from "@/providers/GlobalProvider";

export default function SuccessPage() {
  const { fetchOrders, fetchCartItems } = useGlobalContext();

  // Covers the Stripe redirect-back path too — the order was created
  // server-side by the webhook, so the browser never directly triggered a
  // fetch. Refresh here so "My Orders" is already up to date the moment
  // the shopper navigates there.
  useEffect(() => {
    fetchOrders();
    fetchCartItems();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <FaCheckCircle className="text-green-500 text-6xl mx-auto mb-4" />
        <h1 className="font-display text-3xl font-bold mb-2">Order Placed!</h1>
        <p className="text-theme-muted mb-8">Thank you for your order. We'll get it delivered to you soon.</p>
        <div className="flex gap-3 justify-center flex-wrap">
          <Link href="/dashboard/myorders" className="btn-primary">Track Order</Link>
          <Link href="/" className="btn-outline">Continue Shopping</Link>
        </div>
      </div>
    </div>
  );
}
