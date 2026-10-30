import { useState } from "react";
import { Chevron, ChevronRight } from "./Icons";
import type { SlideImage } from "./api";
import "./hero-carousel.css";

interface Props {
  slides: SlideImage[]; // up to five images
  tabIndex?: number;
}

/** Manual carousel for the details page: arrows and dots, no autoplay. Shows the credit for licensed images. */
export default function HeroCarousel({ slides, tabIndex }: Props) {
  const [index, setIndex] = useState(0);
  const count = slides.length;
  const cur = Math.min(index, count - 1);
  const slide = slides[cur];

  return (
    <div className="hero-carousel">
      <img className="hero" src={slide.url} alt="" />
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
      {slide.credit && (
        <p className="hero-credit">
          {slide.creditUrl ? (
            <a href={slide.creditUrl} target="_blank" rel="noopener noreferrer" tabIndex={tabIndex}>{slide.credit}</a>
          ) : (
            slide.credit
          )}
        </p>
      )}
    </div>
  );
}
