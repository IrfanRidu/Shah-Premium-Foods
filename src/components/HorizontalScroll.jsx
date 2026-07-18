"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";

/**
 * Horizontally-scrollable row with hover-to-reveal nav buttons, native
 * touch/scrollbar support, and an optional auto-scroll mode.
 *
 * autoScroll: when true AND the content overflows past one visible row,
 * the row glides forward on its own (ping-pong: forward → pause → backward → pause → …).
 * Any user interaction (hover, touch, manual arrow click) pauses it briefly, then it resumes.
 * If everything already fits in one row, nothing auto-scrolls — there's nothing to reveal.
 */
export default function HorizontalScroll({ children, className = "", autoScroll = false, autoScrollSpeed = 40 }) {
  const ref   = useRef(null);
  const [canLeft,  setCanLeft]  = useState(false);
  const [canRight, setCanRight] = useState(false);

  const pausedRef    = useRef(false);
  const directionRef = useRef(1); // 1 = forward, -1 = backward
  const rafRef        = useRef(null);
  const resumeTimerRef= useRef(null);

  const check = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    el.addEventListener("scroll", check, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener("scroll", check); };
  }, [check]);

  // ── Auto-scroll loop (rAF, frame-time based so speed is consistent) ──
  useEffect(() => {
    if (!autoScroll) return;
    const el = ref.current;
    if (!el) return;

    let lastTime = null;

    const pauseThenReverse = () => {
      pausedRef.current = true;
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = setTimeout(() => { pausedRef.current = false; }, 1600);
    };

    const step = (time) => {
      if (lastTime === null) lastTime = time;
      const deltaSec = (time - lastTime) / 1000;
      lastTime = time;

      const maxScroll = el.scrollWidth - el.clientWidth;

      // Only glide if there's actually more than one row's worth of content
      if (maxScroll > 10 && !pausedRef.current) {
        let next = el.scrollLeft + directionRef.current * autoScrollSpeed * deltaSec;
        if (next >= maxScroll) {
          next = maxScroll;
          directionRef.current = -1;
          pauseThenReverse();
        } else if (next <= 0) {
          next = 0;
          directionRef.current = 1;
          pauseThenReverse();
        }
        el.scrollLeft = next;
      }
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearTimeout(resumeTimerRef.current);
    };
  }, [autoScroll, autoScrollSpeed]);

  const pauseBriefly = (ms = 2200) => {
    if (!autoScroll) return;
    pausedRef.current = true;
    clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => { pausedRef.current = false; }, ms);
  };

  const scroll = (dir) => {
    const el = ref.current;
    if (!el) return;
    pauseBriefly();
    el.scrollBy({ left: dir * 300, behavior: "smooth" });
  };

  return (
    <div
      className="relative group"
      onMouseEnter={() => { if (autoScroll) pausedRef.current = true; }}
      onMouseLeave={() => pauseBriefly(800)}
      onTouchStart={() => { if (autoScroll) pausedRef.current = true; }}
      onTouchEnd={() => pauseBriefly(2200)}
    >
      {/* Left button */}
      {canLeft && (
        <button onClick={() => scroll(-1)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-9 w-9 bg-white/90 backdrop-blur-sm border border-theme rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-all hover:bg-white -ml-2 opacity-0 group-hover:opacity-100"
          aria-label="Scroll left">
          <FaChevronLeft size={13} />
        </button>
      )}

      {/* Scrollable track — hides native scrollbar visually but stays touch/wheel scrollable */}
      <div
        ref={ref}
        className={`flex gap-4 overflow-x-auto pb-2 ${className}`}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {children}
      </div>

      {/* Right button */}
      {canRight && (
        <button onClick={() => scroll(1)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-9 w-9 bg-white/90 backdrop-blur-sm border border-theme rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-all hover:bg-white -mr-2 opacity-0 group-hover:opacity-100"
          aria-label="Scroll right">
          <FaChevronRight size={13} />
        </button>
      )}
    </div>
  );
}
