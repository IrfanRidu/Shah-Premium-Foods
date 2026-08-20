"use client";
import { useState, useEffect, useCallback } from "react";

// Session 4 (Compare feature). Ephemeral, session-scoped by design — no
// backend model, no API route, no Redux. localStorage is the correct,
// standard tool here: this is real application code running in a real
// browser (NOT a claude.ai artifact preview, where localStorage is
// off-limits) — and a compare list is exactly the kind of small,
// disposable, per-browser state that doesn't warrant a database
// round-trip or tying it to a user account. A lightweight custom event
// keeps every component using this hook (ProductCard's compare toggle,
// CompareBar, the /compare page) in sync with each other the instant
// any one of them changes the list, without needing Redux for
// something this small and intentionally disposable.
const STORAGE_KEY = "compareList";
const EVENT_NAME = "compareListChanged";
const MAX_COMPARE = 4;

function readList() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeList(list) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(EVENT_NAME));
  } catch {
    // localStorage can throw (private-browsing quota, disabled storage)
    // — compare is a nice-to-have, fail silently rather than crash the
    // page over it.
  }
}

export function useCompare() {
  const [list, setList] = useState([]);

  useEffect(() => {
    setList(readList());
    const onChange = () => setList(readList());
    window.addEventListener(EVENT_NAME, onChange);
    window.addEventListener("storage", onChange); // cross-tab sync
    return () => {
      window.removeEventListener(EVENT_NAME, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const isComparing = useCallback((productId) => list.includes(productId), [list]);

  // Returns { ok: true } or { ok: false, reason: "max" } rather than
  // throwing/toasting itself — keeps this hook UI-library-agnostic
  // (no react-hot-toast import here); the caller decides how to surface
  // the "you can only compare up to 4" case.
  const toggle = useCallback((productId) => {
    const current = readList();
    if (current.includes(productId)) {
      writeList(current.filter((id) => id !== productId));
      return { ok: true };
    }
    if (current.length >= MAX_COMPARE) {
      return { ok: false, reason: "max" };
    }
    writeList([...current, productId]);
    return { ok: true };
  }, []);

  const remove = useCallback((productId) => writeList(readList().filter((id) => id !== productId)), []);
  const clear = useCallback(() => writeList([]), []);

  return { list, isComparing, toggle, remove, clear, max: MAX_COMPARE };
}
