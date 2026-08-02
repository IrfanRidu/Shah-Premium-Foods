// Section 15 (Next.js Best Practices) — "Server-only modules": winston /
// winston-daily-rotate-file are Node-only packages (fs, streams) that
// would break or needlessly bloat a client bundle; this guarantees that
// at build time rather than by convention.
import "server-only";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

// ─────────────────────────────────────────────────────────────────────────
// Section 11 (Logging) — Winston setup, four categorized loggers: request,
// error, security, audit. This is the direct fulfillment of a comment
// already left in lib/apiObservability.js's `logRequest()`: "Swap this one
// function for a real logger (pino, winston) if/when this app adopts one
// — every call site stays the same." That's exactly what happens here —
// see apiObservability.js for the call-site side of this.
//
// Deployment reality this is built around (stated plainly, same spirit as
// security.js's own rate-limiter comment about its in-memory-vs-
// distributed trade-off): this app's documented primary deploy target is
// Vercel serverless (VERCEL_DEPLOYMENT.md), where each function invocation
// runs in an ephemeral container — the filesystem outside `/tmp` is
// effectively read-only, and even `/tmp` isn't shared across invocations
// or instances. A rotating log FILE written during one invocation is not
// reliably there to read from the next one. Vercel's own documented
// guidance is: write to stdout/stderr, which Vercel captures automatically
// into its own log viewer and any configured log drain. So:
//   - Console transport is ALWAYS on, on every logger — this is what
//     actually matters on Vercel, and is equally useful in local dev.
//   - File transports (winston-daily-rotate-file, actually satisfying the
//     literal "daily rotation" ask) are added ONLY when NOT running on
//     Vercel (detected via `process.env.VERCEL`, which Vercel's runtime
//     sets automatically) — i.e. for a traditional `next start` on a VPS/
//     container/on-prem box, where local disk genuinely persists and
//     rotation/retention on disk is the right tool. Nothing about the
//     call sites (logger.info(...), etc.) changes based on which
//     transports are active underneath.
// ─────────────────────────────────────────────────────────────────────────

const isVercel = !!process.env.VERCEL;
const isProd = process.env.NODE_ENV === "production";
const LOG_DIR = process.env.LOG_DIR || "logs";

const { combine, timestamp, json, printf, colorize, errors } = winston.format;

// One JSON object per line — matches the exact convention
// apiObservability.js's logRequest() already established (directly
// parseable by Vercel Logs / CloudWatch / Datadog / any aggregator without
// extra parsing rules), used for both the file transports and the console
// transport in production.
const jsonFormat = combine(
  errors({ stack: true }), // if a logged value is an Error, include its stack instead of just "[object Error]"
  timestamp(),
  json()
);

// Readable, colorized single-line format for local development only —
// nobody wants to eyeball raw JSON lines in a dev terminal.
const devConsoleFormat = combine(
  errors({ stack: true }),
  colorize(),
  timestamp({ format: "HH:mm:ss" }),
  printf(({ level, message, timestamp, category, ...meta }) => {
    delete meta.service; // repeated on every line, not useful for a human skimming dev output
    delete meta.environment;
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `${timestamp} [${category || "app"}] ${level}: ${message}${metaStr}`;
  })
);

function buildTransports(category, retentionDays) {
  const transports = [
    new winston.transports.Console({
      format: isProd ? jsonFormat : devConsoleFormat,
    }),
  ];

  if (!isVercel) {
    transports.push(
      new DailyRotateFile({
        dirname: LOG_DIR,
        filename: `${category}-%DATE%.log`,
        datePattern: "YYYY-MM-DD",
        zippedArchive: true,
        maxSize: "20m",
        // Retention deliberately differs by category — routine request
        // logs are high-volume and low individual value past a week or
        // two; security/audit logs are the kind of thing compliance or a
        // post-incident investigation needs to go back much further for,
        // so they're kept far longer, same reasoning any real logging
        // policy would use.
        maxFiles: `${retentionDays}d`,
        format: jsonFormat,
      })
    );
  }

  return transports;
}

function createCategoryLogger(category, { level, retentionDays }) {
  return winston.createLogger({
    level,
    // Every line from every logger carries these — useful the moment logs
    // ever get shipped somewhere shared, and lines up with the service
    // name Section 12's OpenTelemetry/Sentry setup uses too.
    defaultMeta: {
      category,
      service: "shah-premium-foods",
      environment: process.env.NODE_ENV || "development",
    },
    transports: buildTransports(category, retentionDays),
    exitOnError: false, // a logging call itself must never crash the process
  });
}

// Levels below use Winston's standard npm level ordering
// (error=0, warn=1, info=2, http=3, verbose=4, debug=5, silly=6 — lower
// number = more severe = always included whenever a less-strict threshold
// is set). Each logger's `level` is the loudest (highest-numbered) level
// it will actually emit; call sites pick the specific level per entry.

// Request log — high volume, routine. `http` level threshold: normal
// request entries are logged at .http(), while still allowing a request
// logger to escalate to .warn()/.error() if ever needed without being
// dropped by its own threshold.
export const requestLogger = createCategoryLogger("request", { level: "http", retentionDays: 7 });

// Error log — only real errors; deliberately strict threshold so this
// file/stream doesn't get diluted with routine noise.
export const errorLogger = createCategoryLogger("error", { level: "error", retentionDays: 30 });

// Security log — rate-limit hits, CSRF rejections, login lockouts/IP
// blocks. `info` threshold since severity varies by event (a routine
// rate-limit hit vs. an account lockout vs. a blocked IP aren't equally
// serious) — the call site chooses .info()/.warn()/.error() per event,
// this only sets the floor.
export const securityLogger = createCategoryLogger("security", { level: "info", retentionDays: 90 });

// Audit log — "who did what, when" for authenticated mutating actions.
// Longest retention of the four: audit trails are the category most
// likely to matter months later, for accountability/compliance, not
// day-to-day debugging.
export const auditLogger = createCategoryLogger("audit", { level: "info", retentionDays: 365 });
