"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { FaChevronLeft, FaChevronRight, FaPlay, FaPause } from "react-icons/fa";

// Fix 18: Detect if a slide is a video
const isVideo = (url) => {
  if (!url) return false;
  return /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(url) || url.includes("video");
};

// Fix 19: Generate the landing page URL for a banner/slide
// Fix 8: default target is now the flat all-products page, not the category grid
export function bannerLandingHref(slide) {
  if (!slide || typeof slide === "string") return "/products";
  if (slide.campaignId) return `/banner-page/${slide.campaignId}?type=campaign`;
  if (slide.productIds?.length) return `/banner-page/${slide._id || "default"}?type=products`;
  return "/products"; // default → all products
}

export default function Carousel({ banners = [] }) {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const videoRef = useRef(null);
  const timerRef = useRef(null);

  const slides = banners.length ? banners : [null]; // always at least one slot (default)

  const goTo   = (i) => setIdx((i + slides.length) % slides.length);
  const goNext = useCallback(() => goTo(idx + 1), [idx, slides.length]);
  const goPrev = () => goTo(idx - 1);

  const currentSlide = slides[idx];
  const currentIsVideo = isVideo(currentSlide?.video || currentSlide?.image || currentSlide);

  // Auto-advance: paused for videos (they advance on video-end), normal interval for images
  const startTimer = useCallback(() => {
    clearInterval(timerRef.current);
    if (paused || slides.length <= 1 || currentIsVideo) return;
    timerRef.current = setInterval(goNext, 4500);
  }, [goNext, paused, slides.length, currentIsVideo]);

  useEffect(() => {
    startTimer();
    return () => clearInterval(timerRef.current);
  }, [startTimer]);

  // Fix 18: when video ends, advance to next slide
  const handleVideoEnd = () => {
    clearInterval(timerRef.current);
    goNext();
  };

  if (!banners.length) {
    return (
      <div className="w-full aspect-[3/1] bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-h)] flex items-center justify-center rounded-2xl relative overflow-hidden">
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: "radial-gradient(circle at 20% 80%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        <div className="text-center text-white px-6 relative z-10">
          <h1 className="font-display text-3xl md:text-5xl font-bold mb-3">Shah Premium Foods</h1>
          <p className="text-lg opacity-80 mb-6">Fresh groceries delivered to your door</p>
          <button
            onClick={() => router.push("/products")}
            className="bg-white/20 backdrop-blur-sm border border-white/40 text-white font-bold px-8 py-3 rounded-full hover:bg-white/30 transition-all text-sm"
          >
            Shop Now →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-hidden rounded-2xl group" role="region" aria-label="Hero banner">
      {/* Slides */}
      <div
        className="flex transition-transform duration-500 ease-in-out"
        style={{ transform: `translateX(-${idx * 100}%)` }}
      >
        {slides.map((slide, i) => {
          const videoUrl = slide?.video;
          const imageUrl = slide?.image || (typeof slide === "string" ? slide : "");
          const useVideo = isVideo(videoUrl) && videoUrl;
          const btnText  = slide?.buttonText || "";
          const landingHref = bannerLandingHref(slide);

          return (
            <div key={i} className="w-full shrink-0 aspect-[3/1] bg-[var(--color-surface)] relative">
              {useVideo ? (
                <video
                  ref={i === idx ? videoRef : undefined}
                  src={videoUrl}
                  className="w-full h-full object-cover"
                  autoPlay muted playsInline
                  onEnded={handleVideoEnd}
                />
              ) : (
                <img src={imageUrl} alt={slide?.title || `Banner ${i + 1}`} className="w-full h-full object-cover" />
              )}

              {/* Fix 19: Custom banner button overlay */}
              {(btnText || slide?.title) && (
                <div className="absolute inset-0 flex items-end justify-start p-6 sm:p-10 bg-gradient-to-t from-black/50 via-black/10 to-transparent">
                  <div className="space-y-3 max-w-lg">
                    {slide?.title && (
                      <h2 className="text-white font-display text-2xl sm:text-4xl font-bold drop-shadow-lg">{slide.title}</h2>
                    )}
                    {slide?.subtitle && (
                      <p className="text-white/90 text-sm sm:text-base drop-shadow">{slide.subtitle}</p>
                    )}
                    {btnText && (
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(landingHref); }}
                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-sm transition-all
                          bg-white/20 backdrop-blur-md border border-white/50 text-white
                          hover:bg-white hover:text-[var(--color-primary)] shadow-lg"
                      >
                        {btnText}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Controls */}
      {slides.length > 1 && (
        <>
          <button onClick={goPrev}
            className="absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white z-10">
            <FaChevronLeft size={14} />
          </button>
          <button onClick={goNext}
            className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white z-10">
            <FaChevronRight size={14} />
          </button>
          <button onClick={() => setPaused((p) => !p)}
            className="absolute right-3 bottom-3 h-7 w-7 bg-white/70 backdrop-blur-sm rounded-full flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white z-10">
            {paused ? <FaPlay size={10} /> : <FaPause size={10} />}
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 items-center z-10">
            {slides.map((_, i) => (
              <button key={i} onClick={() => goTo(i)}
                className={`carousel-dot ${i === idx ? "active" : ""}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
