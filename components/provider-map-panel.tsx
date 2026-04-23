"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildProviderMarkers } from "@/lib/provider-map";

const MAP_CONTAINER_ID = "provider-mappls-canvas";
const MAPPLS_CSS_ID = "mappls-web-sdk-css";
const INDIA_CENTER = { lat: 22.9734, lng: 78.6569 };
const GREEN_MARKER_ICON = "/green-dot-marker.svg";
const MAPPLS_SCRIPT_URLS = (accessToken: string) => [
  `https://sdk.mappls.com/map/sdk/web?v=3.0&access_token=${accessToken}`,
  `https://sdk.mappls.com/map/sdk/web?v=3.0&layer=vector&access_token=${accessToken}`,
  `https://apis.mappls.com/advancedmaps/api/${accessToken}/map_sdk?layer=vector&v=3.0`
];

function ensureMapplsCss() {
  if (document.getElementById(MAPPLS_CSS_ID)) {
    return;
  }

  const link = document.createElement("link");
  link.id = MAPPLS_CSS_ID;
  link.rel = "stylesheet";
  link.href = "https://apis.mappls.com/vector_map/assets/v3.5/mappls-glob.css";
  document.head.appendChild(link);
}

function removeExistingMapplsScripts() {
  document.querySelectorAll('script[data-mappls-sdk="true"]').forEach((node) => node.remove());
}

function loadScriptFromUrl(src: string) {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.dataset.mapplsSdk = "true";
    script.onload = () => {
      if (window.mappls?.Map) {
        resolve();
        return;
      }

      reject(new Error("The Mappls SDK loaded, but the map API was not available."));
    };
    script.onerror = () => reject(new Error("The Mappls SDK could not be loaded."));
    document.head.appendChild(script);
  });
}

async function loadMapplsScript(accessToken: string) {
  if (window.mappls?.Map) {
    return;
  }

  let lastError: Error | null = null;

  for (const src of MAPPLS_SCRIPT_URLS(accessToken)) {
    try {
      removeExistingMapplsScripts();
      await loadScriptFromUrl(src);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("The Mappls SDK could not be loaded.");
    }
  }

  throw lastError || new Error("The Mappls SDK could not be loaded.");
}

export function ProviderMapPanel({ results, mapplsPublicKey }: { results: any[]; mapplsPublicKey?: string | null }) {
  const mapInstanceRef = useRef<any>(null);
  const markerRefs = useRef<any[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const markers = useMemo(() => buildProviderMarkers(results), [results]);
  const [selectedMarker, setSelectedMarker] = useState<(typeof markers)[number] | null>(null);

  useEffect(() => {
    if (!mapplsPublicKey || mapInstanceRef.current) {
      return;
    }

    let disposed = false;
    setMapError(null);
    setMapReady(false);
    ensureMapplsCss();

    loadMapplsScript(mapplsPublicKey)
      .then(() => {
        if (disposed) {
          return;
        }

        if (!window.mappls?.Map) {
          setMapError("The Mappls web SDK loaded, but the India basemap API was not available.");
          return;
        }

        const mapObject = new window.mappls.Map(MAP_CONTAINER_ID, {
          center: INDIA_CENTER,
          zoom: 4.8,
          zoomControl: true,
          fullscreenControl: false,
          geolocation: false,
          location: false
        });

        mapInstanceRef.current = mapObject;
        setMapReady(true);

        mapObject.on?.("load", () => {
          if (!disposed) {
            setMapReady(true);
          }
        });

        mapObject.addListener?.("load", () => {
          if (!disposed) {
            setMapReady(true);
          }
        });
      })
      .catch((error) => {
        if (!disposed) {
          setMapError(error instanceof Error ? error.message : "The India basemap could not be loaded.");
        }
      });

    return () => {
      disposed = true;
      markerRefs.current.forEach((marker) => marker?.remove?.());
      markerRefs.current = [];
      mapInstanceRef.current?.remove?.();
      mapInstanceRef.current = null;
      setMapReady(false);
      setSelectedMarker(null);
    };
  }, [mapplsPublicKey]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.mappls || !mapReady) {
      return;
    }

    markerRefs.current.forEach((marker) => marker?.remove?.());
    markerRefs.current = [];

    if (markers.length === 0) {
      setSelectedMarker(null);
      map.setCenter?.(INDIA_CENTER);
      map.setZoom?.(4.8);
      return;
    }

    markers.forEach((marker) => {
      const markerInstance = new window.mappls.Marker({
        map,
        position: { lat: marker.lat, lng: marker.lng },
        icon: GREEN_MARKER_ICON,
        width: 28,
        height: 28,
        fitbounds: false
      });
      const handleSelect = () => setSelectedMarker(marker);
      markerInstance.on?.("click", handleSelect);
      markerInstance.addListener?.("click", handleSelect);
      markerRefs.current.push(markerInstance);
    });

    if (markers.length === 1) {
      map.setCenter?.({ lat: markers[0].lat, lng: markers[0].lng });
      map.setZoom?.(7);
    }
  }, [markers, mapReady]);

  return (
    <section className="panel panel-pad map-panel">
      <div className="split">
        <div>
          <h2 className="section-title">Provider Map</h2>
          <p className="section-copy">
            Matching providers are plotted on an interactive India basemap from MapmyIndia. Click a green dot to view the provider details and offering links.
          </p>
        </div>
        <div className="map-toolbar">
          <span className="pill">{markers.length} provider locations</span>
          <span className="pill">MapmyIndia</span>
        </div>
      </div>

      <div className="map-layout map-layout-full">
        <div className="mappls-shell">
          {mapplsPublicKey ? (
            <>
              <div id={MAP_CONTAINER_ID} className="mappls-canvas" />
              {selectedMarker ? (
                <aside className="map-popup-panel">
                  <div className="map-popup-header">
                    <div>
                      <h3>{selectedMarker.providerName}</h3>
                      <p>{selectedMarker.locationLabel}</p>
                    </div>
                    <button className="map-popup-close" type="button" onClick={() => setSelectedMarker(null)}>
                      Close
                    </button>
                  </div>
                  <div className="map-popup-content">
                    {selectedMarker.associationStatus ? <p>Status: {selectedMarker.associationStatus}</p> : null}
                    {selectedMarker.email ? <p>Email: {selectedMarker.email}</p> : null}
                    {selectedMarker.website ? (
                      <p>
                        Website:{" "}
                        <a className="result-link" href={selectedMarker.website} target="_blank" rel="noreferrer">
                          {selectedMarker.website}
                        </a>
                      </p>
                    ) : null}
                    <div className="map-popup-offerings">
                      {selectedMarker.offerings.map((offering, index) => (
                        <div className="provider-offering" key={`${selectedMarker.providerName}-${offering.offeringId || index}`}>
                          <strong>{offering.offeringName || "Untitled offering"}</strong>
                          <span>{[offering.offeringGroup || "Offering", offering.valueChain || "No value chain", offering.application || "No application"].join(" | ")}</span>
                          <div className="provider-offering-links">
                            {offering.offeringId ? (
                              <Link className="result-link" href={`/offering/${offering.offeringId}`}>
                                View details
                              </Link>
                            ) : null}
                            {offering.greLink ? (
                              <a className="result-link" href={offering.greLink} target="_blank" rel="noreferrer">
                                View on GRE
                              </a>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </aside>
              ) : null}
              {!mapReady && !mapError ? <div className="notice">Preparing India map...</div> : null}
              {mapError ? <div className="notice warn">{mapError}</div> : null}
            </>
          ) : (
            <div className="notice warn">Map key missing. Add `MAPPLS_PUBLIC_KEY` to enable the interactive India map.</div>
          )}
        </div>
      </div>
    </section>
  );
}
