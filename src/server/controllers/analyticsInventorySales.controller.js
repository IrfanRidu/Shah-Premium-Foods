import OrderModel from "../models/order.model.js";
import ProductModel from "../models/product.model.js";
import InventoryLogModel from "../models/inventoryLog.model.js";
import { round2, pctChange } from "../utils/analyticsHelpers.js";

const statusReachedAt = (order, status) => {
  const entries = order.statusHistory || [];
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].status === status) return new Date(entries[i].changedAt);
  }
  return order.order_status === status ? new Date(order.updatedAt) : null;
};

export const getInventorySalesMetricsController = async (req, res) => {
  try {
    const { from, to } = req.query;
    const start = from ? new Date(from) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end   = to   ? new Date(to)   : new Date();
    end.setHours(23, 59, 59, 999);
    const prevStart = new Date(start.getTime() - (end.getTime() - start.getTime()));

    const [allProducts, allDelivered, damageLogsInRange, receivedLogsInRange] = await Promise.all([
      ProductModel.find({}).select("name price costPrice stock lowStockThreshold overstockThreshold publish"),
      OrderModel.find({ order_status: "Delivered" }),
      InventoryLogModel.find({ type: "damage", createdAt: { $gte: start, $lte: end } }).populate("productId", "price costPrice"),
      InventoryLogModel.find({ type: { $in: ["restock", "initial"] }, createdAt: { $gte: start, $lte: end } }),
    ]);

    // ── Inventory Metrics ──────────────────────────────────────
    const publishedProducts = allProducts.filter((p) => p.publish);
    const totalProducts   = publishedProducts.length;
    const totalVariants   = 0; // Fix 36: no variant system in this catalog — reported as N/A
    const stockQuantity   = publishedProducts.reduce((s, p) => s + (p.stock || 0), 0);
    const lowStockCount   = publishedProducts.filter((p) => p.stock > 0 && p.stock <= (p.lowStockThreshold || 10)).length;
    const outOfStockCount = publishedProducts.filter((p) => p.stock === 0).length;
    const overstockCount  = publishedProducts.filter((p) => p.stock > (p.overstockThreshold || 200)).length;

    const inventoryValue = publishedProducts.reduce((s, p) => {
      const unitCost = p.costPrice > 0 ? p.costPrice : p.price * 0.6;
      return s + unitCost * (p.stock || 0);
    }, 0);

    const deadStockValue = damageLogsInRange.reduce((s, l) => {
      const unitCost = l.productId?.costPrice > 0 ? l.productId.costPrice : (l.productId?.price || 0) * 0.6;
      return s + unitCost * l.quantity;
    }, 0);

    // COGS in range (for turnover)
    const withDate = allDelivered.map((o) => ({ o, d: statusReachedAt(o, "Delivered") })).filter((x) => x.d);
    const inRange = withDate.filter((x) => x.d >= start && x.d <= end).map((x) => x.o);
    let cogsInRange = 0, unitsSoldInRange = 0;
    for (const o of inRange) {
      for (const item of o.productDetails) {
        const lr = (item.price || 0) * (item.quantity || 0);
        cogsInRange += item.costPrice > 0 ? item.costPrice * item.quantity : lr * 0.6;
        unitsSoldInRange += item.quantity || 0;
      }
    }

    // Inventory Turnover = COGS ÷ Average Inventory. We don't keep daily snapshots,
    // so "Average Inventory" is approximated as current inventory value (at cost) —
    // labelled clearly on the frontend as an approximation.
    const avgInventoryApprox = inventoryValue > 0 ? inventoryValue : null;
    const inventoryTurnover = avgInventoryApprox ? round2(cogsInRange / avgInventoryApprox) : null;
    const dio = inventoryTurnover > 0 ? round2(365 / inventoryTurnover) : null;

    const unitsReceived = receivedLogsInRange.reduce((s, l) => s + l.quantity, 0);
    const sellThroughRate = unitsReceived > 0 ? round2((unitsSoldInRange / unitsReceived) * 100) : null;

    // ── Sales Metrics ──────────────────────────────────────────
    const grossSales = inRange.reduce((s, o) => s + (o.subTotalAmt || 0), 0);
    const discounts  = inRange.reduce((s, o) => s + (o.discountAmt || 0), 0);
    const returnedInRange = (await OrderModel.find({ order_status: "Return" }))
      .map((o) => ({ o, d: statusReachedAt(o, "Return") }))
      .filter((x) => x.d && x.d >= start && x.d <= end).map((x) => x.o);
    const returns = returnedInRange.reduce((s, o) => s + (o.subTotalAmt || 0), 0);
    const netSales = round2(grossSales - returns - discounts);

    const totalOrders = inRange.length;
    const avgItemsPerOrder = totalOrders > 0 ? round2(unitsSoldInRange / totalOrders) : 0;
    const revenueForAOV = inRange.reduce((s, o) => s + ((o.totalAmt || 0) - (o.deliveryCharge || 0)), 0);
    const aov = totalOrders > 0 ? round2(revenueForAOV / totalOrders) : 0;
    const customerIds = new Set(inRange.map((o) => o.userId?.toString()).filter(Boolean));
    const revenuePerCustomer = customerIds.size > 0 ? round2(revenueForAOV / customerIds.size) : 0;

    // Sales growth vs previous equal-length window
    const prevInRange = withDate.filter((x) => x.d >= prevStart && x.d < start).map((x) => x.o);
    const prevGrossSales = prevInRange.reduce((s, o) => s + (o.subTotalAmt || 0), 0);
    const salesGrowth = pctChange(grossSales, prevGrossSales);

    // Daily/Weekly/Monthly/Annual sales — bucketed over the range
    const byDay = new Map();
    for (const o of inRange) {
      const d = statusReachedAt(o, "Delivered");
      const key = d.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) || 0) + (o.subTotalAmt || 0));
    }
    const dailySalesSeries = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, sales]) => ({ date, sales: round2(sales) }));

    return res.json({
      success: true, error: false,
      data: {
        period: { from: start, to: end },
        inventoryMetrics: {
          inventoryValue: round2(inventoryValue),
          totalProducts, totalVariants,
          stockQuantity,
          lowStockCount, outOfStockCount, overstockCount,
          deadStockValue: round2(deadStockValue),
          inventoryTurnover, dio,
          sellThroughRate,
          unitsReceived, unitsSoldInRange,
        },
        salesMetrics: {
          grossSales: round2(grossSales),
          netSales,
          totalOrders,
          aov,
          avgItemsPerOrder,
          revenuePerCustomer,
          salesGrowth,
          dailySalesSeries,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
