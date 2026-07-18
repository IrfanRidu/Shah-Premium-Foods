import OrderModel from "../models/order.model.js";
import CartProductModel from "../models/cartProduct.model.js";
import UserModel from "../models/user.model.js";
import ProductModel from "../models/product.model.js";
import CouponModel from "../models/coupon.model.js";
import InventoryLogModel from "../models/inventoryLog.model.js";
import AddressModel from "../models/address.model.js";
import { resolveDeliveryCharge } from "./deliveryZone.controller.js";
import stripe from "../config/stripe.js";
import { createNotification } from "./notification.controller.js";
import SiteSettingsModel from "../models/siteSettings.model.js";
import { evaluateCoupon } from "../utils/couponEligibility.js";


const generateOrderId = () => `ORD-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

// Validates + computes discount for a coupon code against the order's
// authoritative (DB-priced) line items. Returns { discount, coupon } or
// throws an Error with a user-facing message. Uses the same eligibility/
// discount math as the live "Apply" preview (coupon.controller.js) via the
// shared couponEligibility helper, so the two can never disagree — this is
// still the authoritative check (re-run here from DB data regardless of
// what the client claimed when placing the order).
const resolveCoupon = async (code, productDetails, userId) => {
  if (!code) return { discount: 0, coupon: null };
  const coupon = await CouponModel.findOne({ code: code.toUpperCase().trim(), isActive: true });
  if (!coupon) throw new Error("Invalid or expired coupon code");

  const items = productDetails.map((p) => ({ productId: p.productId, price: p.price, quantity: p.quantity }));
  const { discount } = evaluateCoupon(coupon, items, userId);

  return { discount, coupon };
};

const markCouponUsed = async (coupon, userId, orderId) => {
  if (!coupon) return;
  await CouponModel.findByIdAndUpdate(coupon._id, {
    $inc: { usedCount: 1 },
    $push: { usedBy: { userId, orderId, usedAt: new Date() } },
  });
};

// Safe-number helper — never lets NaN/undefined/strings reach a Mongoose Number field
const safeNum = (n, fallback = 0) => {
  const num = Number(n);
  return Number.isFinite(num) ? num : fallback;
};

// Computes authoritative order line items AND subtotal purely from the database —
// the client's cart math is used only for display, never trusted for what gets charged/stored.
const buildOrderItems = async (list_items) => {
  const productIds = list_items.map((i) => i.productId._id || i.productId);
  const products = await ProductModel.find({ _id: { $in: productIds } }).select("name image price discount costPrice");
  const map = new Map(products.map((p) => [p._id.toString(), p]));

  let subTotal = 0;
  const productDetails = list_items.map((item) => {
    const id = (item.productId._id || item.productId).toString();
    const dbProduct = map.get(id);

    const rawPrice = safeNum(dbProduct?.price ?? item.productId?.price, 0);
    const discountPct = safeNum(dbProduct?.discount ?? item.productId?.discount, 0);
    const chargedUnitPrice = Math.round((rawPrice - (rawPrice * discountPct) / 100) * 100) / 100;
    const quantity = Math.max(0, Math.floor(safeNum(item.quantity, 0)));

    subTotal += chargedUnitPrice * quantity;

    return {
      productId: id,
      name: dbProduct?.name || item.productId?.name || "Product",
      image: dbProduct?.image || item.productId?.image || [],
      quantity,
      price: chargedUnitPrice,
      costPrice: safeNum(dbProduct?.costPrice, 0),
    };
  });

  return { productDetails, subTotal: Math.round(subTotal * 100) / 100 };
};

const decrementStockAndLog = async (productDetails, orderId, userId) => {
  for (const item of productDetails) {
    const product = await ProductModel.findById(item.productId);
    if (!product) continue;
    const previousStock = product.stock;
    const newStock = Math.max(0, previousStock - item.quantity);
    await ProductModel.findByIdAndUpdate(item.productId, { stock: newStock });
    await new InventoryLogModel({
      productId: item.productId, type: "sale", quantity: item.quantity,
      previousStock, newStock, note: `Order ${orderId}`, createdBy: userId, reference: orderId,
    }).save();
  }
};

// CASH ON DELIVERY ORDER
export const cashOnDeliveryOrderController = async (req, res) => {
  try {
    const userId = req.userId;
    const { list_items, addressId, couponCode, deliveryZoneId } = req.body;

    if (!list_items || list_items.length === 0) {
      return res.status(400).json({ message: "No items in order", error: true, success: false });
    }
    if (!addressId) {
      return res.status(400).json({ message: "Delivery address is required", error: true, success: false });
    }

    // Validate that name, phone and address are set
    const user = await UserModel.findById(userId).select("name email mobile");
    if (!user?.name) {
      return res.status(400).json({ message: "Please set your name in your profile before placing an order", error: true, success: false });
    }
    if (!user?.mobile) {
      return res.status(400).json({ message: "Please add your phone number in your profile before placing an order", error: true, success: false });
    }

    // Authoritative subtotal + line items computed from the database — never from client math
    const { productDetails, subTotal } = await buildOrderItems(list_items);
    if (subTotal <= 0) {
      return res.status(400).json({ message: "Order amount is invalid. Please refresh your cart and try again.", error: true, success: false });
    }

    let discount = 0, coupon = null;
    try {
      ({ discount, coupon } = await resolveCoupon(couponCode, productDetails, userId));
    } catch (couponErr) {
      return res.status(400).json({ message: couponErr.message, error: true, success: false });
    }
    discount = safeNum(discount, 0);

    // Delivery charge is resolved server-side. If the user explicitly picked a zone at
    // checkout (Fix 7), that zone is authoritative; otherwise it falls back to matching
    // the address city. The charge amount itself is always recomputed here, never trusted
    // from the client.
    const address = await AddressModel.findById(addressId);
    const { charge: deliveryCharge, zoneName: deliveryZoneName, zoneId: resolvedZoneId } =
      await resolveDeliveryCharge(address?.city, subTotal, deliveryZoneId);

    const finalTotal = safeNum(Math.round(Math.max(0, subTotal - discount + deliveryCharge) * 100) / 100, subTotal);
    
    const order = new OrderModel({
      userId,
      orderId: generateOrderId(),
      productDetails,
      paymentId: "",
      payment_status: "CASH ON DELIVERY",
      delivery_address: addressId,
      subTotalAmt: subTotal,
      discountAmt: discount,
      deliveryCharge: safeNum(deliveryCharge, 0),
      deliveryZoneName: deliveryZoneName || "",
      deliveryZoneId: resolvedZoneId || null,
      totalAmt: finalTotal,
      couponCode: coupon ? coupon.code : "",
      order_status: "Pending",
      statusHistory: [{ status: "Pending", note: "Order placed by customer", changedAt: new Date() }],
      customerSnapshot: { name: user?.name || "", email: user?.email || "", mobile: user?.mobile || "" },
    });
    const saved = await order.save();

    await UserModel.updateOne({ _id: userId }, { $push: { orderHistory: saved._id } });
    await decrementStockAndLog(productDetails, saved.orderId, userId);
    if (coupon) await markCouponUsed(coupon, userId, saved.orderId);
    // Fix 4: notify admins/agents of the new order
    createNotification({
      type: "new_order",
      title: `New order ${saved.orderId}`,
      message: `${saved.customerSnapshot?.name || "A customer"} placed an order — ${productDetails.length} item(s)`,
      link: "/dashboard/admin-orders",
      targetModule: "orders",
      relatedId: saved._id,
    });

    await CartProductModel.deleteMany({ userId });
    await UserModel.updateOne({ _id: userId }, { shopping_cart: [] });

    const populated = await OrderModel.findById(saved._id).populate("delivery_address").populate("userId", "name email mobile");

    return res.status(201).json({ message: "Order placed successfully", error: false, success: true, data: saved });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};

// STRIPE CHECKOUT SESSION
export const paymentController = async (req, res) => {
  try {
    const userId = req.userId;
    const { list_items, addressId, couponCode } = req.body;

    if (!list_items || list_items.length === 0) {
      return res.status(400).json({ message: "No items in order", error: true, success: false });
    }

    // Authoritative subtotal computed from the database — never from client math
    const { productDetails, subTotal } = await buildOrderItems(list_items);
    if (subTotal <= 0) {
      return res.status(400).json({ message: "Order amount is invalid. Please refresh your cart and try again.", error: true, success: false });
    }

    let discount = 0, coupon = null;
    try {
      ({ discount, coupon } = await resolveCoupon(couponCode, productDetails, userId));
    } catch (couponErr) {
      return res.status(400).json({ message: couponErr.message, error: true, success: false });
    }
    discount = safeNum(discount, 0);

    // Delivery charge resolved server-side from the address's city
    const address = await AddressModel.findById(addressId);
    const { charge: deliveryCharge, zoneName: deliveryZoneName } = await resolveDeliveryCharge(address?.city, subTotal);

    const user = await UserModel.findById(userId);
    const discountRatio = subTotal > 0 ? discount / subTotal : 0;

    const line_items = list_items.map((item) => {
      const product = item.productId;
      const price = safeNum(product?.price, 0);
      const discountPct = safeNum(product?.discount, 0);
      const unitPrice = price - (price * discountPct) / 100;
      const discountedUnit = Math.max(0, unitPrice * (1 - discountRatio));
      return {
        price_data: {
          currency: "usd",
          product_data: { name: product.name, images: product.image, metadata: { productId: product._id } },
          unit_amount: Math.round(discountedUnit * 100),
        },
        adjustable_quantity: { enabled: false },
        quantity: Math.max(1, Math.floor(safeNum(item.quantity, 1))),
      };
    });

    if (deliveryCharge > 0) {
      line_items.push({
        price_data: {
          currency: "usd",
          product_data: { name: `Delivery Charge${deliveryZoneName ? ` (${deliveryZoneName})` : ""}` },
          unit_amount: Math.round(deliveryCharge * 100),
        },
        quantity: 1,
      });
    }

    const finalTotal = Math.round(Math.max(0, subTotal - discount + deliveryCharge) * 100) / 100;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: user.email,
      metadata: {
        userId: userId.toString(),
        addressId: addressId?.toString() || "",
        subTotalAmt: subTotal.toString(),
        totalAmt: finalTotal.toString(),
        discountAmt: discount.toString(),
        deliveryCharge: deliveryCharge.toString(),
        deliveryZoneName: deliveryZoneName || "",
        couponCode: coupon ? coupon.code : "",
        couponId: coupon ? coupon._id.toString() : "",
      },
      line_items,
      success_url: `${process.env.FRONTEND_URL}/success`,
      cancel_url: `${process.env.FRONTEND_URL}/cancel`,
    });

    return res.json({ message: "Checkout session created", error: false, success: true, data: session.url });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};

// COD ORDER WHERE THE DELIVERY CHARGE MUST BE PAID ONLINE UPFRONT
// (admin-controlled via siteSettings.codRequireDeliveryCharge). Only the
// delivery charge goes through Stripe here; the product total stays cash-on-
// delivery. The actual order is created by the webhook once that small
// payment succeeds — mirrors the full-online-payment flow for consistency.
export const payCodDeliveryChargeController = async (req, res) => {
  try {
    const userId = req.userId;
    const { list_items, addressId, couponCode, deliveryZoneId } = req.body;

    if (!list_items || list_items.length === 0) {
      return res.status(400).json({ message: "No items in order", error: true, success: false });
    }
    if (!addressId) {
      return res.status(400).json({ message: "Delivery address is required", error: true, success: false });
    }

    const user = await UserModel.findById(userId).select("name email mobile");
    if (!user?.name) {
      return res.status(400).json({ message: "Please set your name in your profile before placing an order", error: true, success: false });
    }
    if (!user?.mobile) {
      return res.status(400).json({ message: "Please add your phone number in your profile before placing an order", error: true, success: false });
    }

    const { productDetails, subTotal } = await buildOrderItems(list_items);
    if (subTotal <= 0) {
      return res.status(400).json({ message: "Order amount is invalid. Please refresh your cart and try again.", error: true, success: false });
    }

    let discount = 0, coupon = null;
    try {
      ({ discount, coupon } = await resolveCoupon(couponCode, productDetails, userId));
    } catch (couponErr) {
      return res.status(400).json({ message: couponErr.message, error: true, success: false });
    }
    discount = safeNum(discount, 0);

    // Same zone-selection rule as the plain COD path (Fix 7): the zone the
    // customer explicitly picked at checkout is authoritative when supplied.
    const address = await AddressModel.findById(addressId);
    const { charge: deliveryCharge, zoneName: deliveryZoneName, zoneId: resolvedZoneId } =
      await resolveDeliveryCharge(address?.city, subTotal, deliveryZoneId);

    if (deliveryCharge <= 0) {
      return res.status(400).json({
        message: "No delivery charge applies to this order — you can place it as a regular Cash on Delivery order.",
        error: true, success: false,
      });
    }

    const finalTotal = safeNum(Math.round(Math.max(0, subTotal - discount + deliveryCharge) * 100) / 100, subTotal);

    // Lightweight cart snapshot (productId + quantity only) so the webhook can
    // rebuild authoritative line items from the database after payment succeeds.
    const cartSnapshot = JSON.stringify(
      list_items.map((i) => ({ productId: (i.productId?._id || i.productId)?.toString(), quantity: i.quantity }))
    );

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: user.email,
      metadata: {
        orderType: "cod-delivery-charge",
        userId: userId.toString(),
        addressId: addressId?.toString() || "",
        subTotalAmt: subTotal.toString(),
        totalAmt: finalTotal.toString(),
        discountAmt: discount.toString(),
        deliveryCharge: deliveryCharge.toString(),
        deliveryZoneName: deliveryZoneName || "",
        deliveryZoneId: resolvedZoneId ? resolvedZoneId.toString() : "",
        couponCode: coupon ? coupon.code : "",
        couponId: coupon ? coupon._id.toString() : "",
        cartSnapshot,
      },
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: `Delivery Charge${deliveryZoneName ? ` (${deliveryZoneName})` : ""} — rest paid by cash on delivery`,
          },
          unit_amount: Math.round(deliveryCharge * 100),
        },
        quantity: 1,
      }],
      success_url: `${process.env.FRONTEND_URL}/success`,
      cancel_url: `${process.env.FRONTEND_URL}/cancel`,
    });

    return res.json({ message: "Delivery charge payment session created", error: false, success: true, data: session.url });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};

const getOrderProductItems = async (lineItems) => {
  const productList = [];
  if (lineItems?.data?.length) {
    for (const item of lineItems.data) {
      const productInfo = await stripe.products.retrieve(item.price.product);
      const dbProduct = await ProductModel.findById(productInfo.metadata.productId).select("costPrice");
      productList.push({
        productId: productInfo.metadata.productId,
        name: productInfo.name,
        image: productInfo.images,
        quantity: item.quantity,
        price: item.price.unit_amount / 100,
        costPrice: dbProduct?.costPrice || 0,
      });
    }
  }
  return productList;
};

// STRIPE WEBHOOK
export const webhookStripeController = async (request, response) => {
  const sig = request.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(request.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error("Webhook signature verification failed:", error.message);
    return response.status(400).send(`Webhook Error: ${error.message}`);
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.metadata.userId;
      const user = await UserModel.findById(userId).select("name email mobile");

      // ── Branch 1: COD order where only the delivery charge was prepaid ──
      if (session.metadata.orderType === "cod-delivery-charge") {
        let snapshotItems = [];
        try { snapshotItems = JSON.parse(session.metadata.cartSnapshot || "[]"); } catch { snapshotItems = []; }

        const { productDetails } = await buildOrderItems(snapshotItems);
        const deliveryCharge = safeNum(session.metadata.deliveryCharge, 0);

        const order = new OrderModel({
          userId,
          orderId: generateOrderId(),
          productDetails,
          paymentId: session.payment_intent,
          payment_status: "COD (Delivery Charge Paid Online)",
          delivery_address: session.metadata.addressId || undefined,
          subTotalAmt: safeNum(session.metadata.subTotalAmt, 0),
          discountAmt: safeNum(session.metadata.discountAmt, 0),
          deliveryCharge,
          deliveryChargePaidOnline: true,
          deliveryZoneName: session.metadata.deliveryZoneName || "",
          deliveryZoneId: session.metadata.deliveryZoneId || null,
          totalAmt: safeNum(session.metadata.totalAmt, 0),
          couponCode: session.metadata.couponCode || "",
          order_status: "Pending",
          statusHistory: [{ status: "Pending", note: "Order placed — delivery charge paid online, product total due in cash on delivery", changedAt: new Date() }],
          customerSnapshot: { name: user?.name || "", email: user?.email || "", mobile: user?.mobile || "" },
        });
        const saved = await order.save();

        await UserModel.updateOne({ _id: userId }, { $push: { orderHistory: saved._id } });
        await decrementStockAndLog(productDetails, saved.orderId, userId);
        createNotification({
          type: "new_order",
          title: `New order ${saved.orderId}`,
          message: `${saved.customerSnapshot?.name || "A customer"} placed an order — ${productDetails.length} item(s)`,
          link: "/dashboard/admin-orders",
          targetModule: "orders",
          relatedId: saved._id,
        });
        if (session.metadata.couponId) {
          const coupon = await CouponModel.findById(session.metadata.couponId);
          if (coupon) await markCouponUsed(coupon, userId, saved.orderId);
        }
        await CartProductModel.deleteMany({ userId });
        await UserModel.updateOne({ _id: userId }, { shopping_cart: [] });
        break;
      }

      // ── Branch 2: full online payment (existing flow) ──
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
      const productDetails = await getOrderProductItems(lineItems);

      const order = new OrderModel({
        userId,
        orderId: generateOrderId(),
        productDetails,
        paymentId: session.payment_intent,
        payment_status: session.payment_status,
        delivery_address: session.metadata.addressId || undefined,
        subTotalAmt: safeNum(session.metadata.subTotalAmt, 0),
        discountAmt: safeNum(session.metadata.discountAmt, 0),
        deliveryCharge: safeNum(session.metadata.deliveryCharge, 0),
        deliveryZoneName: session.metadata.deliveryZoneName || "",
        totalAmt: safeNum(session.metadata.totalAmt, 0),
        couponCode: session.metadata.couponCode || "",
        order_status: "Confirmed",
        statusHistory: [{ status: "Confirmed", note: "Payment confirmed via Stripe", changedAt: new Date() }],
        customerSnapshot: { name: user?.name || "", email: user?.email || "", mobile: user?.mobile || "" },
      });
      const saved = await order.save();

      await UserModel.updateOne({ _id: userId }, { $push: { orderHistory: saved._id } });
      await decrementStockAndLog(productDetails, saved.orderId, userId);
      createNotification({
        type: "new_order",
        title: `New order ${saved.orderId}`,
        message: `${saved.customerSnapshot?.name || "A customer"} placed an order — ${productDetails.length} item(s)`,
        link: "/dashboard/admin-orders",
        targetModule: "orders",
        relatedId: saved._id,
      });
      if (session.metadata.couponId) {
        const coupon = await CouponModel.findById(session.metadata.couponId);
        if (coupon) await markCouponUsed(coupon, userId, saved.orderId);
      }
      await CartProductModel.deleteMany({ userId });
      await UserModel.updateOne({ _id: userId }, { shopping_cart: [] });

      const populated = await OrderModel.findById(saved._id).populate("delivery_address").populate("userId", "name email mobile");
      break;
    }
    default:
      break;
  }

  response.json({ received: true });
};

// GET ORDERS FOR LOGGED IN USER
export const getOrderDetailsController = async (req, res) => {
  try {
    const userId = req.userId;
    const orders = await OrderModel.find({ userId }).sort({ createdAt: -1 }).populate("delivery_address");
    return res.json({ message: "Orders fetched successfully", error: false, success: true, data: orders });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};

// GET single order (owner or admin)
export const getOrderByIdController = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await OrderModel.findById(id).populate("delivery_address").populate("userId", "name email mobile");
    if (!order) return res.status(404).json({ success: false, error: true, message: "Order not found" });
    if (order.userId?._id?.toString() !== req.userId) {
      const requester = await UserModel.findById(req.userId);
      if (!requester || !["ADMIN", "SUPERADMIN"].includes(requester.role)) {
        return res.status(403).json({ success: false, error: true, message: "Not authorized to view this order" });
      }
    }
    return res.json({ success: true, error: false, data: order });
  } catch (error) {
    return res.status(500).json({ success: false, error: true, message: error.message });
  }
};

// CUSTOMER: Cancel own order (only while Pending/Confirmed)
export const cancelOwnOrderController = async (req, res) => {
  try {
    const userId = req.userId;
    const { orderId } = req.body;
    const order = await OrderModel.findOne({ _id: orderId, userId });
    if (!order) return res.status(404).json({ success: false, error: true, message: "Order not found" });
    if (!["Pending", "Confirmed"].includes(order.order_status)) {
      return res.status(400).json({ success: false, error: true, message: "This order can no longer be cancelled. Please contact support." });
    }

    order.order_status = "Cancelled";
    order.statusHistory.push({ status: "Cancelled", note: "Cancelled by customer", changedAt: new Date() });
    await order.save();

    // Restock items
    for (const item of order.productDetails) {
      const product = await ProductModel.findById(item.productId);
      if (!product) continue;
      const previousStock = product.stock;
      const newStock = previousStock + item.quantity;
      await ProductModel.findByIdAndUpdate(item.productId, { stock: newStock });
      await new InventoryLogModel({ productId: item.productId, type: "return", quantity: item.quantity, previousStock, newStock, note: `Cancelled order ${order.orderId}`, reference: order.orderId }).save();
    }

    return res.json({ success: true, error: false, data: order, message: "Order cancelled" });
  } catch (error) {
    return res.status(500).json({ success: false, error: true, message: error.message });
  }
};

// ADMIN: GET ALL ORDERS (optionally filtered by status, paginated)
export const getAllOrdersController = async (req, res) => {
  try {
    const { status, page = 1, limit = 100, from, to } = req.query;
    const query = {};
    if (status && status !== "All") query.order_status = status;
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to)   query.createdAt.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [orders, total, statusCounts] = await Promise.all([
      OrderModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit))
        .populate("delivery_address").populate("userId", "name email mobile"),
      OrderModel.countDocuments(query),
      OrderModel.aggregate([{ $group: { _id: "$order_status", count: { $sum: 1 } } }]),
    ]);

    const counts = statusCounts.reduce((acc, s) => { acc[s._id] = s.count; return acc; }, {});

    return res.json({
      message: "All orders fetched successfully", error: false, success: true,
      data: orders, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)), statusCounts: counts,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};

// ADMIN: UPDATE ORDER STATUS
export const updateOrderStatusController = async (req, res) => {
  try {
    const { orderId, order_status, status, note } = req.body;
    const newStatus = order_status || status;

    if (!orderId || !newStatus) {
      return res.status(400).json({ message: "Order id and status are required", error: true, success: false });
    }

    const order = await OrderModel.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found", error: true, success: false });

    const previousStatus = order.order_status;
    order.order_status = newStatus;
    order.statusHistory.push({ status: newStatus, note: note || "", changedBy: req.userId, changedAt: new Date() });
    if (newStatus === "Refunded") {
      order.refundNote = note || "";
      order.refundedAt = new Date();
    }

    // Restock automatically only for Cancelled/Return — NOT Refunded. A refund
    // is a payment-status change and doesn't guarantee the physical item came
    // back (e.g. goodwill refunds, damaged-item refunds). If a return DID
    // happen alongside the refund, mark the order "Return" (which restocks)
    // before/after marking it "Refunded", or use Inventory → Adjust Stock.
    if (["Cancelled","Return"].includes(newStatus) && !["Cancelled","Return","Refunded"].includes(previousStatus)) {
      for (const item of order.productDetails) {
        const product = await ProductModel.findById(item.productId);
        if (!product) continue;
        const previousStock = product.stock;
        const newStock = previousStock + item.quantity;
        await ProductModel.findByIdAndUpdate(item.productId, { stock: newStock });
        await new InventoryLogModel({ productId: item.productId, type: "return", quantity: item.quantity, previousStock, newStock, note: `Order ${order.orderId} marked ${newStatus}`, createdBy: req.userId, reference: order.orderId }).save();
      }
    }

    await order.save();
    const populated = await OrderModel.findById(orderId).populate("delivery_address").populate("userId", "name email mobile");

    return res.json({ message: "Order status updated", error: false, success: true, data: populated });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};
