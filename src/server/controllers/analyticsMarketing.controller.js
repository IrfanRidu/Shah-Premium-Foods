import OrderModel from "../models/order.model.js";
import ActivityLogModel from "../models/activityLog.model.js";
import AnalyticsSettingsModel from "../models/analyticsSettings.model.js";
import { round2, pctChange, dependentMetric } from "../utils/analyticsHelpers.js";

// Fix 38: Marketing & Website Performance tab.
//
// Traffic/behavior numbers are derived from ActivityLogModel (sessionId +
// actionType + metadata.path, logged by GlobalProvider's page-view effect
// and the various user-action call sites — search, add_to_cart, product
// view). Metrics that need data this system genuinely doesn't capture yet
// (device/user-agent, a distinct "checkout started" event, mobile-banking
// gateways) are reported as { value: null, missing: [...] } rather than
// invented — consistent with every other analytics tab in this project.
export const getMarketingMetricsController = async (req, res) => {
  try {
    const { from, to } = req.query;
    const start = from ? new Date(from) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end   = to   ? new Date(to)   : new Date();
    end.setHours(23, 59, 59, 999);

    const [logsInRange, ordersInRange, settings] = await Promise.all([
      ActivityLogModel.find({ createdAt: { $gte: start, $lte: end } }),
      OrderModel.find({ createdAt: { $gte: start, $lte: end } }),
      AnalyticsSettingsModel.findOne({ key: "main" }),
    ]);

    // ── Session reconstruction ───────────────────────────────────
    const bySession = new Map(); // sessionId -> { events: [], userId }
    for (const log of logsInRange) {
      const sid = log.sessionId || `anon-${log._id}`;
      const entry = bySession.get(sid) || { events: [], userId: log.userId?.toString() || null };
      entry.events.push(log);
      if (log.userId) entry.userId = log.userId.toString();
      bySession.set(sid, entry);
    }
    const sessions = [...bySession.values()];
    const sessionCount = sessions.length;
    const uniqueVisitors = sessionCount; // one browser session ≈ one visitor, in the absence of cross-device identity resolution

    const pageVisitsOf = (s) => s.events.filter((e) => e.actionType === "page_visit");
    const totalPageVisits = sessions.reduce((sum, s) => sum + pageVisitsOf(s).length, 0);
    const singlePageSessions = sessions.filter((s) => pageVisitsOf(s).length <= 1).length;
    const bounceRate = sessionCount > 0 ? round2((singlePageSessions / sessionCount) * 100) : 0;
    const pagesPerSession = sessionCount > 0 ? round2(totalPageVisits / sessionCount) : 0;

    // Average session duration = mean(last event time − first event time) across sessions with 2+ events
    const durations = sessions
      .filter((s) => s.events.length >= 2)
      .map((s) => {
        const times = s.events.map((e) => new Date(e.createdAt).getTime());
        return Math.max(...times) - Math.min(...times);
      });
    const avgSessionDurationSec = durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 1000)
      : 0;

    // ── Page-type breakdown ──────────────────────────────────────
    const pathOf = (e) => e.metadata?.path || "";
    const homepageViews = logsInRange.filter((e) => e.actionType === "page_visit" && pathOf(e) === "/").length;
    const categoryViews  = logsInRange.filter((e) => e.actionType === "page_visit" && pathOf(e).startsWith("/category")).length;
    const productViews   = logsInRange.filter((e) => e.actionType === "view").length;
    const searchesPerformed = logsInRange.filter((e) => e.actionType === "search").length;

    // ── Conversion / funnel ──────────────────────────────────────
    const ordersCount = ordersInRange.length;
    const conversionRate = sessionCount > 0 ? round2((ordersCount / sessionCount) * 100) : 0;

    // Cart abandonment — only computable for sessions we can tie to a user
    // (an anonymous add-to-cart with no later order can't be distinguished
    // from "still shopping" vs "gave up", so we scope this to logged-in
    // sessions, which we CAN check against real order history).
    const addToCartSessions = sessions.filter((s) => s.events.some((e) => e.actionType === "add_to_cart") && s.userId);
    const orderedUserIds = new Set(ordersInRange.map((o) => o.userId?.toString()).filter(Boolean));
    const abandonedCartSessions = addToCartSessions.filter((s) => !orderedUserIds.has(s.userId));
    const cartAbandonmentRate = addToCartSessions.length > 0
      ? round2((abandonedCartSessions.length / addToCartSessions.length) * 100)
      : 0;

    // Checkout completion rate needs a distinct "checkout started" event,
    // which this system doesn't instrument yet (only completed orders are
    // ever recorded) — honestly flagged rather than guessed.
    const checkoutCompletionRate = { value: null, missing: ["Checkout-start tracking isn't instrumented yet (only completed orders are recorded)"] };

    // ── Paid marketing (needs admin-entered spend/click figures) ──
    const cpc = dependentMetric(
      { "Ad Spend": settings?.adSpend, "Ad Clicks": settings?.adClicks },
      () => settings.adClicks > 0 ? round2(settings.adSpend / settings.adClicks) : 0
    );
    const cpa = dependentMetric(
      { "Ad Spend": settings?.adSpend },
      () => ordersCount > 0 ? round2(settings.adSpend / ordersCount) : 0
    );
    const roas = dependentMetric(
      { "Ad Spend": settings?.adSpend, "Ad Revenue": settings?.adRevenue },
      () => settings.adSpend > 0 ? round2(settings.adRevenue / settings.adSpend) : 0
    );
    const emailOpenRate = dependentMetric(
      { "Emails Sent": settings?.emailsSent, "Email Opens": settings?.emailOpens },
      () => settings.emailsSent > 0 ? round2((settings.emailOpens / settings.emailsSent) * 100) : 0
    );
    const emailClickRate = dependentMetric(
      { "Email Opens": settings?.emailOpens, "Email Clicks": settings?.emailClicks },
      () => settings.emailOpens > 0 ? round2((settings.emailClicks / settings.emailOpens) * 100) : 0
    );

    // ── New vs returning (session-level, by whether the tied user has any activity before `start`) ──
    let newVisitorSessions = 0, returningVisitorSessions = 0, unresolvedSessions = 0;
    for (const s of sessions) {
      if (!s.userId) { unresolvedSessions++; continue; }
      // handled in bulk below for efficiency
    }
    const userIdsWithSessions = [...new Set(sessions.map((s) => s.userId).filter(Boolean))];
    const priorActivityUserIds = userIdsWithSessions.length > 0
      ? new Set((await ActivityLogModel.find({ userId: { $in: userIdsWithSessions }, createdAt: { $lt: start } }).distinct("userId")).map((id) => id.toString()))
      : new Set();
    for (const s of sessions) {
      if (!s.userId) continue;
      if (priorActivityUserIds.has(s.userId)) returningVisitorSessions++;
      else newVisitorSessions++;
    }

    // Device breakdown needs user-agent capture, which ActivityLog doesn't
    // record today — flagged honestly instead of fabricated.
    const deviceBreakdown = { value: null, missing: ["Device/user-agent isn't captured on activity events yet"] };

    // ── Peak sales hour (from actual order timestamps — no dependency needed) ──
    const hourCounts = new Array(24).fill(0);
    for (const o of ordersInRange) hourCounts[new Date(o.createdAt).getUTCHours()]++;
    const peakHour = hourCounts.reduce((best, count, hour) => count > hourCounts[best] ? hour : best, 0);
    const peakSalesHour = ordersInRange.length > 0 ? `${String(peakHour).padStart(2, "0")}:00 UTC` : null;

    return res.json({
      success: true, error: false,
      data: {
        period: { from: start, to: end },
        marketingMetrics: {
          websiteVisitors: sessionCount,
          sessions: sessionCount,
          uniqueVisitors,
          conversionRate,
          bounceRate,
          cartAbandonmentRate,
          checkoutCompletionRate,
          cpc, cpa, roas,
          emailOpenRate, emailClickRate,
        },
        websitePerformance: {
          homepageViews, productViews, categoryViews, searchesPerformed,
          avgSessionDurationSec,
          pagesPerSession,
          exitRate: { value: null, missing: ["Per-page exit tracking needs page-level session ordering — only bounce rate (single-page sessions) is currently available"] },
          newVisitors: newVisitorSessions,
          returningVisitors: returningVisitorSessions,
          unresolvedVisitors: unresolvedSessions,
          deviceBreakdown,
          peakSalesHour,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
