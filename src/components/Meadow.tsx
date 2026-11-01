"use client";

import { useEffect, useRef, useState } from "react";

/** The meadow at the end of every page. Its pictures are only fetched once it scrolls into view. */
export function Meadow() {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setNear(true);
        observer.disconnect();
      },
      { threshold: 0.01 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="meadow" aria-hidden>
      {near && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="meadow-day" src="/meadow/day.webp" alt="" width={1300} height={272} loading="lazy" decoding="async" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="meadow-night" src="/meadow/night.webp" alt="" width={1300} height={272} loading="lazy" decoding="async" />
        </>
      )}
    </div>
  );
}
