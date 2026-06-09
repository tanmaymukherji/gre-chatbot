"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GreFeatureItem, ConsortiumPartnerItem, ShowcaseContent } from "@/lib/showcase-content";

function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const imgRef = useRef<HTMLImageElement>(null);
  const lastTouchDist = useRef(0);

  const clamp = useCallback((v: number) => Math.max(0.25, Math.min(8, v)), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      setScale((s) => clamp(s - e.deltaY * 0.004));
    }
    const el = imgRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [clamp]);

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist.current = Math.hypot(dx, dy);
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      setScale((s) => clamp(s + (dist - lastTouchDist.current) * 0.01));
      lastTouchDist.current = dist;
    }
  }

  return (
    <div className="image-lightbox" role="dialog" aria-modal="true" onClick={onClose}>
      <button className="image-lightbox-close" type="button" aria-label="Close image" onClick={onClose}>
        &times;
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className="image-lightbox-img"
        style={{ transform: `scale(${scale})` }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
      />
    </div>
  );
}

function ShowcaseFeatureCarousel({ features }: { features: GreFeatureItem[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxSrc, setLightboxSrc] = useState("");
  const activeFeature = features[activeIndex] || null;

  useEffect(() => {
    if (features.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % features.length);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [features.length]);

  useEffect(() => {
    if (activeIndex >= features.length) setActiveIndex(0);
  }, [activeIndex, features.length]);

  if (!activeFeature) return null;

  function move(delta: number) {
    setActiveIndex((index) => (index + delta + features.length) % features.length);
  }

  return (
    <section className="panel panel-pad gre-feature-panel" aria-label="GRE feature">
      {lightboxSrc ? (
        <ImageLightbox src={lightboxSrc} alt={activeFeature.name} onClose={() => setLightboxSrc("")} />
      ) : null}
      <div className="split">
        <div>
          <p className="eyebrow">GRE Feature</p>
          <h2 className="section-title">{activeFeature.name}</h2>
        </div>
        {features.length > 1 ? (
          <div className="feature-carousel-controls">
            <button className="btn ghost" type="button" onClick={() => move(-1)} aria-label="Previous GRE feature">
              Prev
            </button>
            <span className="pill">{activeIndex + 1} / {features.length}</span>
            <button className="btn ghost" type="button" onClick={() => move(1)} aria-label="Next GRE feature">
              Next
            </button>
          </div>
        ) : null}
      </div>
      <div className="gre-feature-body">
        <div className="gre-feature-image-wrap" role="button" tabIndex={0}
          onClick={() => setLightboxSrc(activeFeature.imageUrl)}
          onKeyDown={(e) => { if (e.key === "Enter") setLightboxSrc(activeFeature.imageUrl); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={activeFeature.imageUrl} alt={activeFeature.name} />
        </div>
        <div className="gre-feature-copy">
          <p>{activeFeature.writeup}</p>
          {activeFeature.linkUrl ? (
            <a className="result-link" href={activeFeature.linkUrl} target="_blank" rel="noreferrer">
              Open feature link
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ConsortiumPartnerStrip({ partners }: { partners: ConsortiumPartnerItem[] }) {
  const rollingPartners = useMemo(() => [...partners, ...partners], [partners]);
  if (!partners.length) return null;

  return (
    <section className="panel panel-pad consortium-strip-panel" aria-label="Our Consortium Partners">
      <div className="split">
        <div>
          <p className="eyebrow">Our Consortium Partners</p>
          <h2 className="section-title">We are proud to collaborate with a diverse range of partners, including:</h2>
        </div>
      </div>
      <div className="consortium-marquee">
        <div className="consortium-track">
          {rollingPartners.map((partner, index) => {
            const content = (
              <>
                {partner.logoUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={partner.logoUrl} alt={partner.name} />
                ) : null}
                <span>{partner.name}</span>
              </>
            );
            return partner.websiteUrl ? (
              <a
                className="consortium-logo-card"
                href={partner.websiteUrl}
                target="_blank"
                rel="noreferrer"
                title={partner.name}
                key={`${partner.id}-${index}`}
              >
                {content}
              </a>
            ) : (
              <div className="consortium-logo-card" title={partner.name} key={`${partner.id}-${index}`}>
                {content}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function ShowcaseSections() {
  const [content, setContent] = useState<ShowcaseContent>({ features: [], partners: [] });

  useEffect(() => {
    fetch("/api/showcase", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        setContent({
          features: Array.isArray(data?.features) ? data.features : [],
          partners: Array.isArray(data?.partners) ? data.partners : []
        });
      })
      .catch(() => undefined);
  }, []);

  return (
    <>
      <ShowcaseFeatureCarousel features={content.features} />
      <ConsortiumPartnerStrip partners={content.partners} />
    </>
  );
}
