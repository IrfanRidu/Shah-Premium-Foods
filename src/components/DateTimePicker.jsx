"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { FaCalendarAlt, FaClock, FaChevronLeft, FaChevronRight } from "react-icons/fa";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const POPUP_WIDTH = 320;
const POPUP_HEIGHT_ESTIMATE = 430;

// value / onChange use the same "YYYY-MM-DDTHH:mm" local string format as a
// native <input type="datetime-local"> so this is a drop-in replacement.
function parseLocalValue(str) {
  if (!str) {
    const now = new Date();
    now.setSeconds(0, 0);
    return now;
  }
  const [datePart, timePart] = str.split("T");
  const [y, m, d] = (datePart || "").split("-").map(Number);
  const [hh, mm] = (timePart || "00:00").split(":").map(Number);
  if (!y || !m || !d) {
    const now = new Date();
    now.setSeconds(0, 0);
    return now;
  }
  return new Date(y, m - 1, d, hh || 0, mm || 0);
}

function toLocalValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDisplay(str) {
  if (!str) return "";
  const d = parseLocalValue(str);
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function buildMonthGrid(viewYear, viewMonth) {
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startOffset = firstOfMonth.getDay(); // 0=Sun
  const gridStart = new Date(viewYear, viewMonth, 1 - startOffset);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  }
  return cells;
}

export default function DateTimePicker({ value, onChange, label, placeholder = "Select date & time", className = "" }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState(() => parseLocalValue(value));
  const [viewYear, setViewYear] = useState(() => parseLocalValue(value).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => parseLocalValue(value).getMonth());
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const popupRef = useRef(null);

  useEffect(() => setMounted(true), []);

  const computePosition = useCallback(() => {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    let left = rect.left;
    let top = rect.bottom + 8;

    // Flip horizontally if it would overflow the right edge
    if (left + POPUP_WIDTH > window.innerWidth - 8) {
      left = Math.max(8, rect.right - POPUP_WIDTH);
    }
    // Flip above the trigger if it would overflow the bottom edge
    if (top + POPUP_HEIGHT_ESTIMATE > window.innerHeight - 8) {
      top = Math.max(8, rect.top - POPUP_HEIGHT_ESTIMATE - 8);
    }
    setCoords({ top, left });
  }, []);

  // Re-sync draft + position whenever the popup is (re)opened
  useEffect(() => {
    if (open) {
      const d = parseLocalValue(value);
      setDraft(d);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
      computePosition();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep position correct on resize; close on scroll of the page behind it
  // (prevents the popup floating away from its trigger if the modal scrolls)
  useEffect(() => {
    if (!open) return;
    const onResize = () => computePosition();
    const onScroll = (e) => {
      if (popupRef.current && popupRef.current.contains(e.target)) return; // scrolling inside popup itself is fine
      setOpen(false);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, computePosition]);

  // Click outside = cancel (discard draft, don't apply)
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        popupRef.current && !popupRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const grid = buildMonthGrid(viewYear, viewMonth);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const selectDay = (cellDate) => {
    const updated = new Date(draft);
    updated.setFullYear(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate());
    setDraft(updated);
  };

  const setHour = (h) => { const u = new Date(draft); u.setHours(h); setDraft(u); };
  const setMinute = (m) => { const u = new Date(draft); u.setMinutes(m); setDraft(u); };

  const goPrevMonth = () => {
    const m = viewMonth === 0 ? 11 : viewMonth - 1;
    const y = viewMonth === 0 ? viewYear - 1 : viewYear;
    setViewMonth(m); setViewYear(y);
  };
  const goNextMonth = () => {
    const m = viewMonth === 11 ? 0 : viewMonth + 1;
    const y = viewMonth === 11 ? viewYear + 1 : viewYear;
    setViewMonth(m); setViewYear(y);
  };

  const applyNow = () => {
    const now = new Date(); now.setSeconds(0, 0);
    setDraft(now); setViewYear(now.getFullYear()); setViewMonth(now.getMonth());
  };

  const handleOk = () => {
    onChange(toLocalValue(draft));
    setOpen(false);
  };
  const handleCancel = () => setOpen(false);

  const popup = open && (
    <div
      ref={popupRef}
      style={{ position: "fixed", top: coords.top, left: coords.left, width: POPUP_WIDTH, zIndex: 9999 }}
      className="bg-[var(--color-surface)] border border-theme rounded-2xl shadow-2xl p-4 animate-slide-up"
    >
      {/* Calendar header */}
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={goPrevMonth} className="p-1.5 rounded-lg hover:bg-[var(--color-border)] transition-colors" aria-label="Previous month">
          <FaChevronLeft size={12} />
        </button>
        <span className="font-semibold text-sm">{MONTHS[viewMonth]} {viewYear}</span>
        <button type="button" onClick={goNextMonth} className="p-1.5 rounded-lg hover:bg-[var(--color-border)] transition-colors" aria-label="Next month">
          <FaChevronRight size={12} />
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-[10px] font-semibold text-theme-muted py-1">{w}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1 mb-4">
        {grid.map((cellDate, i) => {
          const inMonth = cellDate.getMonth() === viewMonth;
          const isSelected = cellDate.toDateString() === draft.toDateString();
          const isToday = cellDate.getTime() === today.getTime();
          return (
            <button
              key={i}
              type="button"
              onClick={() => selectDay(cellDate)}
              className={`h-8 w-8 mx-auto rounded-lg text-xs flex items-center justify-center transition-colors
                ${isSelected ? "bg-theme-primary text-white font-bold" : inMonth ? "hover:bg-[var(--color-border)]" : "text-theme-muted/40 hover:bg-[var(--color-border)]"}
                ${isToday && !isSelected ? "ring-1 ring-[var(--color-primary)]" : ""}`}
            >
              {cellDate.getDate()}
            </button>
          );
        })}
      </div>

      {/* Clock / time selectors */}
      <div className="flex items-center gap-2 mb-4 pt-3 border-t border-theme">
        <FaClock className="text-theme-muted shrink-0" size={13} />
        <select
          value={draft.getHours()}
          onChange={(e) => setHour(Number(e.target.value))}
          className="input-field py-1.5 text-sm flex-1"
        >
          {Array.from({ length: 24 }).map((_, h) => (
            <option key={h} value={h}>{String(h).padStart(2, "0")}</option>
          ))}
        </select>
        <span className="font-bold text-theme-muted">:</span>
        <select
          value={draft.getMinutes()}
          onChange={(e) => setMinute(Number(e.target.value))}
          className="input-field py-1.5 text-sm flex-1"
        >
          {Array.from({ length: 60 }).map((_, m) => (
            <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
          ))}
        </select>
        <button type="button" onClick={applyNow} className="text-xs font-semibold text-theme-primary hover:underline shrink-0 px-1">
          Now
        </button>
      </div>

      {/* Footer actions — explicit OK required to apply & close */}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={handleCancel} className="btn-outline px-4 py-1.5 text-sm">Cancel</button>
        <button type="button" onClick={handleOk} className="btn-primary px-5 py-1.5 text-sm">OK</button>
      </div>
    </div>
  );

  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium mb-1">{label}</label>}
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        className="input-field w-full flex items-center justify-between gap-2 text-left"
      >
        <span className={value ? "" : "text-theme-muted"}>{value ? formatDisplay(value) : placeholder}</span>
        <FaCalendarAlt className="text-theme-muted shrink-0" size={13} />
      </button>

      {mounted && popup && createPortal(popup, document.body)}
    </div>
  );
}
