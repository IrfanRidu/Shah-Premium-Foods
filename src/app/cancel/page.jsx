"use client";
import Link from "next/link";
import { FaTimesCircle } from "react-icons/fa";

export default function CancelPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <FaTimesCircle className="text-red-400 text-6xl mx-auto mb-4" />
        <h1 className="font-display text-3xl font-bold mb-2">Payment Cancelled</h1>
        <p className="text-theme-muted mb-8">Your payment was cancelled. Your cart items are still saved.</p>
        <div className="flex gap-3 justify-center flex-wrap">
          <Link href="/checkout" className="btn-primary">Try Again</Link>
          <Link href="/cart" className="btn-outline">Back to Cart</Link>
        </div>
      </div>
    </div>
  );
}
