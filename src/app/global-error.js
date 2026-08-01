"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Section 12 (Monitoring) — direct fix for a real warning Sentry's own SDK
// printed during actual local development:
//   "It seems like you don't have a global error handler set up... add a
//   global-error.js file with Sentry instrumentation so that React
//   rendering errors are reported to Sentry."
//
// Next.js App Router convention: a regular error.js catches errors within
// its own route segment and still renders inside the root layout around
// it; global-error.js is the one exception — it catches errors in the
// ROOT layout itself, which means (this is the part that's easy to miss)
// it REPLACES the root layout entirely when it renders, rather than being
// wrapped by it. That's why this file renders its own complete <html>/
// <body> below — app/layout.jsx isn't there to provide them for this
// specific case, since the layout itself is (potentially) what errored.
//
// Deliberately minimal and dependency-light: no design-system components,
// no next/font, no imports from anywhere else in the app — if the ROOT
// layout is broken badly enough to reach this file at all, this is the
// one piece of UI that has to keep working regardless of what's wrong
// elsewhere, so it can't lean on the rest of the app's own machinery.
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <div style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "2rem",
          gap: "1rem",
        }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ color: "#666", maxWidth: "28rem", margin: 0 }}>
            We've been notified and are looking into it. Please try again.
          </p>
          <button
            onClick={() => reset()}
            style={{
              marginTop: "0.5rem",
              padding: "0.625rem 1.5rem",
              borderRadius: "9999px",
              border: "none",
              background: "#16a34a",
              color: "white",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
