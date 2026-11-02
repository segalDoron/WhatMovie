import { useState } from "react";
import { Chevron, ChevronRight } from "./Icons";
import "./hero-carousel.css";

interface Props {
  slides: string[]; // up to ten image URLs; the first one is the main image
  tabIndex?: number;
}

/** Manual carousel for the details page: arrows and dots, no autoplay. */
export default function HeroCarousel({ slides, tabIndex }: Props) {
  const [index, setIndex] = useState(0);
  const count = slides.length;
  const cur = Math.min(index, count - 1);

  return (
    <div className="hero-carousel" role="group" aria-roledescription="carousel" aria-label="Movie images">
      <div className="hero-viewport">
        <div className="hero-track" style={{ transform: `translateX(-${cur * 100}%)` }}>
          {slides.map((src, n) => {
            const near = n === cur || n === (cur + 1) % count || n === (cur - 1 + count) % count;
            return <img key={src} className="hero" src={src} alt="" loading={near ? "eager" : "lazy"} decoding="async" />;
          })}
        </div>
      </div>
      {count > 1 && (
        <>
          <button
            type="button"
            className="hero-nav prev"
            onClick={() => setIndex((cur - 1 + count) % count)}
            aria-label="Previous image"
            tabIndex={tabIndex}
          >
            <Chevron />
          </button>
          <button
            type="button"
            className="hero-nav next"
            onClick={() => setIndex((cur + 1) % count)}
            aria-label="Next image"
            tabIndex={tabIndex}
          >
            <ChevronRight />
          </button>
          <div className="hero-dots">
            {slides.map((_, n) => (
              <button
                key={n}
                type="button"
                className="hero-dot"
                aria-label={`Image ${n + 1} of ${count}`}
                aria-pressed={n === cur}
                onClick={() => setIndex(n)}
                tabIndex={tabIndex}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
