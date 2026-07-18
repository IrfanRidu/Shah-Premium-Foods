"use client";
import { useEffect, useRef, useState } from "react";
import { FaPrint, FaDownload, FaTimes } from "react-icons/fa";
import { displayPrice } from "@/lib/utils";

const STATUS_COLOR = { Pending:"#eab308", Confirmed:"#3b82f6", "On-Hold":"#6366f1", "On the way":"#a855f7", Delivered:"#22c55e", Cancelled:"#ef4444", Return:"#f97316", Refunded:"#9333ea" };

// What the courier needs to collect in cash. Three cases:
//  1. Full online payment (Stripe) → nothing due, "PREPAID"
//  2. Plain COD → full totalAmt due in cash
//  3. COD with delivery charge prepaid online → only (totalAmt - deliveryCharge) due
const cashDueInfo = (order) => {
  const isPlainCod = order.payment_status === "CASH ON DELIVERY";
  if (order.deliveryChargePaidOnline) {
    return { label: "COLLECT CASH ON DELIVERY (delivery charge already paid)", amount: Math.max(0, (order.totalAmt || 0) - (order.deliveryCharge || 0)) };
  }
  if (isPlainCod) {
    return { label: "COLLECT CASH ON DELIVERY", amount: order.totalAmt || 0 };
  }
  return { label: "PREPAID — NOTHING TO COLLECT", amount: 0 };
};

// Renders order.orderId as a Code128 barcode onto the given canvas ref.
async function renderBarcode(canvasEl, value) {
  if (!canvasEl || !value) return;
  const JsBarcode = (await import("jsbarcode")).default;
  JsBarcode(canvasEl, value, {
    format: "CODE128",
    width: 2,
    height: 50,
    displayValue: true,
    fontSize: 13,
    margin: 6,
  });
}

export default function InvoiceModal({ order, onClose, currency, rates }) {
  const [mode, setMode] = useState("invoice"); // "invoice" | "label"
  const invoiceBarcodeRef = useRef(null);
  const labelBarcodeRef = useRef(null);
  const printRef = useRef(null);

  useEffect(() => {
    renderBarcode(invoiceBarcodeRef.current, order.orderId);
    renderBarcode(labelBarcodeRef.current, order.orderId);
  }, [order.orderId]);

  const fmt = (n) => displayPrice(n, currency, rates);

  const handlePrint = () => {
    const printContents = printRef.current.innerHTML;
    const win = window.open("", "_blank", "width=800,height=900");
    win.document.write(`
      <html>
        <head>
          <title>${order.orderId}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #ddd; font-size: 13px; }
            th { background: #f4f4f4; }
            .totals td { border: none; }
            .label-box { text-align: center; border: 2px solid #000; padding: 20px; }
            img, canvas { max-width: 100%; }
          </style>
        </head>
        <body>${printContents}</body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 350);
  };

  const handleDownloadPdf = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text("INVOICE", 14, 18);
    doc.setFontSize(10);
    doc.text(`Order ID: ${order.orderId}`, 14, 26);
    doc.text(`Date: ${new Date(order.createdAt).toLocaleString()}`, 14, 32);
    doc.text(`Status: ${order.order_status}`, 14, 38);

    // Barcode image
    if (invoiceBarcodeRef.current) {
      const dataUrl = invoiceBarcodeRef.current.toDataURL("image/png");
      doc.addImage(dataUrl, "PNG", 140, 14, 56, 22);
    }

    doc.text("Bill To:", 14, 48);
    doc.text(order.userId?.name || order.customerSnapshot?.name || "Customer", 14, 54);
    doc.text(order.userId?.email || order.customerSnapshot?.email || "", 14, 59);
    doc.text(order.userId?.mobile || order.customerSnapshot?.mobile || "", 14, 64);
    if (order.delivery_address) {
      const a = order.delivery_address;
      doc.text([a.address_line, [a.city, a.state, a.country].filter(Boolean).join(", ")].filter(Boolean), 14, 69);
    }

    let y = 88;
    doc.setFontSize(11);
    doc.text("Item", 14, y);
    doc.text("Qty", 130, y);
    doc.text("Price", 150, y);
    doc.text("Total", 175, y);
    y += 4;
    doc.line(14, y, 196, y);
    y += 6;
    doc.setFontSize(10);
    order.productDetails?.forEach((item) => {
      doc.text(item.name.slice(0, 45), 14, y);
      doc.text(String(item.quantity), 130, y);
      doc.text(fmt(item.price), 150, y);
      doc.text(fmt(item.price * item.quantity), 175, y);
      y += 7;
    });
    y += 4;
    doc.line(14, y, 196, y);
    y += 8;

    const totalsLines = [
      ["Subtotal", fmt(order.subTotalAmt)],
      order.discountAmt > 0 ? [`Discount${order.couponCode ? ` (${order.couponCode})` : ""}`, `-${fmt(order.discountAmt)}`] : null,
      ["Delivery" + (order.deliveryZoneName ? ` (${order.deliveryZoneName})` : ""), fmt(order.deliveryCharge || 0)],
    ].filter(Boolean);
    totalsLines.forEach(([label, val]) => { doc.text(label, 140, y); doc.text(val, 175, y); y += 6; });
    doc.setFontSize(12);
    doc.text("Total", 140, y + 2);
    doc.text(fmt(order.totalAmt), 175, y + 2);

    if (order.deliveryChargePaidOnline) {
      y += 10;
      doc.setFontSize(9);
      doc.setTextColor(37, 99, 235);
      doc.text(`Delivery charge paid online — cash due on delivery: ${fmt(Math.max(0, order.totalAmt - order.deliveryCharge))}`, 14, y);
      doc.setTextColor(0, 0, 0);
    }

    doc.save(`invoice-${order.orderId}.pdf`);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 bg-[var(--color-bg)] border border-theme rounded-full p-1">
            <button onClick={() => setMode("invoice")} className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${mode === "invoice" ? "bg-theme-primary text-white" : "text-theme-muted"}`}>Full Invoice</button>
            <button onClick={() => setMode("label")} className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${mode === "label" ? "bg-theme-primary text-white" : "text-theme-muted"}`}>Shipping Label</button>
          </div>
          <button onClick={onClose}><FaTimes/></button>
        </div>

        {/* ── Printable content ── */}
        <div ref={printRef} className="bg-white text-black rounded-xl border border-theme p-5 max-h-[60vh] overflow-y-auto">
          {mode === "invoice" ? (
            <div>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-bold">INVOICE</h2>
                  <p className="text-sm">Order ID: <strong>{order.orderId}</strong></p>
                  <p className="text-xs text-gray-500">{new Date(order.createdAt).toLocaleString()}</p>
                  <span className="inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: STATUS_COLOR[order.order_status] || "#666" }}>{order.order_status}</span>
                </div>
                <canvas ref={invoiceBarcodeRef} />
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                <div>
                  <p className="font-semibold mb-1">Bill To</p>
                  <p>{order.userId?.name || order.customerSnapshot?.name}</p>
                  <p className="text-gray-600">{order.userId?.email || order.customerSnapshot?.email}</p>
                  <p className="text-gray-600">{order.userId?.mobile || order.customerSnapshot?.mobile}</p>
                </div>
                <div>
                  <p className="font-semibold mb-1">Deliver To</p>
                  {order.delivery_address ? (
                    <p className="text-gray-600">{[order.delivery_address.address_line, order.delivery_address.city, order.delivery_address.state, order.delivery_address.country].filter(Boolean).join(", ")}</p>
                  ) : <p className="text-gray-400">—</p>}
                </div>
              </div>

              <table>
                <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
                <tbody>
                  {order.productDetails?.map((item, i) => (
                    <tr key={i}>
                      <td>{item.name}</td>
                      <td>{item.quantity}</td>
                      <td>{fmt(item.price)}</td>
                      <td>{fmt(item.price * item.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <table className="totals">
                <tbody>
                  <tr><td colSpan={3}></td><td className="text-right font-medium">Subtotal: {fmt(order.subTotalAmt)}</td></tr>
                  {order.discountAmt > 0 && <tr><td colSpan={3}></td><td className="text-right text-green-700">Discount{order.couponCode ? ` (${order.couponCode})` : ""}: -{fmt(order.discountAmt)}</td></tr>}
                  <tr><td colSpan={3}></td><td className="text-right">Delivery{order.deliveryZoneName ? ` (${order.deliveryZoneName})` : ""}: {fmt(order.deliveryCharge || 0)}</td></tr>
                  <tr><td colSpan={3}></td><td className="text-right font-bold text-base border-t">Total: {fmt(order.totalAmt)}</td></tr>
                  {order.deliveryChargePaidOnline && (
                    <tr><td colSpan={3}></td><td className="text-right text-blue-700 text-xs">(Delivery charge paid online — cash due: {fmt(Math.max(0, order.totalAmt - order.deliveryCharge))})</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="label-box">
              <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">Shah Premium Foods</p>
              <canvas ref={labelBarcodeRef} />
              <p className="font-bold text-lg mt-2">{order.orderId}</p>
              <div className="mt-3 text-left text-sm border-t pt-3">
                <p className="font-semibold">{order.userId?.name || order.customerSnapshot?.name}</p>
                <p>{order.userId?.mobile || order.customerSnapshot?.mobile}</p>
                {order.delivery_address && (
                  <p>{[order.delivery_address.address_line, order.delivery_address.city, order.delivery_address.state, order.delivery_address.country].filter(Boolean).join(", ")}</p>
                )}
              </div>
              <p className="mt-3 text-sm">Items: {order.productDetails?.length} | Total: {fmt(order.totalAmt)}</p>
              {(() => {
                const due = cashDueInfo(order);
                return (
                  <p className="text-sm font-semibold">
                    {due.amount > 0 ? `${due.label}: ${fmt(due.amount)}` : due.label}
                  </p>
                );
              })()}
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-end pt-4 mt-2">
          <button onClick={handleDownloadPdf} className="btn-outline px-5 py-2 flex items-center gap-2"><FaDownload size={12}/> Download PDF</button>
          <button onClick={handlePrint} className="btn-primary px-5 py-2 flex items-center gap-2"><FaPrint size={12}/> Print</button>
        </div>
      </div>
    </div>
  );
}
