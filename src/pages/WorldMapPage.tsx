import type { TrafficEvent511In } from "@/server/adapters/traffic_511in";
import type { WsdotTrafficEvent } from "@/server/adapters/wsdot";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { isEqual } from "lodash-es";

// Dark theme overrides for Leaflet controls
const leafletDarkStyles = `
  .leaflet-control-zoom a {
    background-color: #1a1a1a !important;
    color: #888 !important;
    border-color: #333 !important;
  }
  .leaflet-control-zoom a:hover {
    background-color: #252525 !important;
    color: #eee !important;
  }
  .dark-popup .leaflet-popup-content-wrapper {
    background: transparent !important;
    box-shadow: none !important;
    padding: 0 !important;
  }
  .dark-popup .leaflet-popup-tip {
    background: #1a1a1a !important;
  }
  .dark-popup .leaflet-popup-content {
    margin: 0 !important;
  }
  .leaflet-popup-close-button {
    color: #666 !important;
  }
  .leaflet-popup-close-button:hover {
    color: #eee !important;
  }
`;

import { AlertTriangle, Car, Construction, MapPin } from "lucide-react";
import { leafletLayer } from "protomaps-leaflet";
import React, { useEffect, useRef, useState } from "react";

interface TrafficCardData {
  events: TrafficEvent511In[];
  lastUpdate: number;
}

interface WsdotCardData {
  events: WsdotTrafficEvent[];
  lastUpdate: number;
}

// Unified event type for display
interface UnifiedTrafficEvent {
  id: string;
  source: "511in" | "wsdot";
  title: string;
  tooltip?: string;
  priority: number;
  coordinates?: [number, number];
  category?: string;
  road?: string;
}

// US center for initial view
const US_CENTER: [number, number] = [39.5, -98.35];
const _DEFAULT_ZOOM = 4;

// Protomaps PMTiles URL (proxied through nginx to avoid CORS)
const PMTILES_URL = "/pmtiles/20260126.pmtiles";

// Get severity from event priority
const getSeverity = (event: UnifiedTrafficEvent): "high" | "medium" | "low" => {
  if (event.priority === 1) return "high";
  if (event.priority === 2 || event.priority === 3) return "medium";
  return "low";
};

// Get icon based on event type
const EventIcon = ({ event }: { event: UnifiedTrafficEvent }) => {
  const title = (event.title || "").toLowerCase();
  if (title.includes("construction") || title.includes("work zone")) {
    return <Construction size={14} className="text-[#F97316]" />;
  }
  if (
    title.includes("crash") ||
    title.includes("accident") ||
    title.includes("incident")
  ) {
    return <AlertTriangle size={14} className="text-[#ff3d3d]" />;
  }
  if (title.includes("traffic") || title.includes("congestion")) {
    return <Car size={14} className="text-[#fbbf24]" />;
  }
  return <MapPin size={14} className="text-[#888]" />;
};

import { withErrorBoundary } from "@/ui/components/ErrorBoundary";

const WorldMapPageComponent: React.FC = () => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const [trafficData, setTrafficData] = useState<TrafficCardData | null>(null);
  const [wsdotData, setWsdotData] = useState<WsdotCardData | null>(null);

  // Inject dark theme styles
  useEffect(() => {
    const styleEl = document.createElement("style");
    styleEl.textContent = leafletDarkStyles;
    document.head.appendChild(styleEl);
    return () => {
      document.head.removeChild(styleEl);
    };
  }, []);

  // Fetch traffic data from observable snapshots
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/observable/snapshots");
        const data = await res.json();
        if (data["traffic-511in-card"]) {
          setTrafficData((prev) => {
            if (isEqual(prev, data["traffic-511in-card"])) return prev;
            return data["traffic-511in-card"];
          });
        }
        if (data["wsdot-card"]) {
          setWsdotData((prev) => {
            if (isEqual(prev, data["wsdot-card"])) return prev;
            return data["wsdot-card"];
          });
        }
      } catch (err) {
        console.error("Failed to fetch traffic data:", err);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  // Combine events from both sources
  const unifiedEvents: UnifiedTrafficEvent[] = React.useMemo(() => {
    const events: UnifiedTrafficEvent[] = [];

    // Add 511IN events
    if (trafficData?.events) {
      for (const e of trafficData.events) {
        events.push({
          id: e.uri,
          source: "511in",
          title: e.title,
          tooltip: e.tooltip,
          priority: e.priority || 5,
          coordinates: e.coordinates,
          category: e.typename,
        });
      }
    }

    // Add WSDOT events
    if (wsdotData?.events) {
      for (const e of wsdotData.events) {
        events.push({
          id: `wsdot-${e.eventId}`,
          source: "wsdot",
          title: e.headline,
          tooltip: `${e.road} ${e.direction}`,
          priority: e.priority,
          coordinates: e.coordinates,
          category: e.category,
          road: e.road,
        });
      }
    }

    // Sort by priority
    return events.sort((a, b) => a.priority - b.priority);
  }, [trafficData, wsdotData]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Create map
    const map = L.map(mapContainerRef.current, {
      center: US_CENTER,
      zoom: 4,
      zoomControl: false,
      attributionControl: false,
    });

    // Add Protomaps layer with dark theme
    leafletLayer({
      url: PMTILES_URL,
      flavor: "dark",
    }).addTo(map);

    // Add zoom control to bottom right
    L.control.zoom({ position: "bottomright" }).addTo(map);

    // Create markers layer group
    markersRef.current = L.layerGroup().addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers when traffic data changes
  useEffect(() => {
    if (!mapRef.current || !markersRef.current) return;

    // Clear existing markers
    markersRef.current.clearLayers();

    // Filter events with valid coordinates
    const eventsWithCoords = unifiedEvents.filter(
      (e) => e.coordinates?.[0] && e.coordinates[1],
    );

    eventsWithCoords.forEach((event) => {
      const severity = getSeverity(event);
      // coordinates are [lng, lat], Leaflet needs [lat, lng]
      const [lng, lat] = event.coordinates!;

      const iconColor =
        severity === "high"
          ? "#ff3d3d"
          : severity === "medium"
            ? "#F97316"
            : "#d6ff79";

      // Different marker size based on source
      const size = event.source === "wsdot" ? 10 : 12;

      const customIcon = L.divIcon({
        className: "custom-marker",
        html: `<div style="width:${size}px;height:${size}px;background:${iconColor};border-radius:50%;border:2px solid #000;box-shadow:0 0 10px ${iconColor}80;"></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const marker = L.marker([lat, lng], { icon: customIcon });

      const stateLabel = event.source === "wsdot" ? "WA" : "IN";
      const categoryLabel = (event.category || "EVENT").toUpperCase();
      marker.bindPopup(
        `<div style="background:#1a1a1a;color:#eee;padding:8px 12px;border-radius:4px;font-family:monospace;font-size:12px;min-width:200px;">
          <div style="color:${iconColor};font-weight:bold;margin-bottom:4px;">${stateLabel} • ${categoryLabel}</div>
          <div style="margin-bottom:4px;">${event.title}</div>
          ${event.road ? `<div style="color:#888;font-size:10px;">${event.road}</div>` : ""}
        </div>`,
        { className: "dark-popup" },
      );

      marker.addTo(markersRef.current!);
    });
  }, [unifiedEvents]);

  return (
    <div className="h-screen bg-[#050505] text-[#ececec] font-sans flex flex-col overflow-hidden">
      {/* Top Section: Quick Stats */}
      <div className="flex-none bg-[#0a0a0a] border-b border-[#1a1a1a] p-4 z-20">
        <div className="flex items-center gap-6 overflow-x-auto pb-2 scrollbar-hide">
          {unifiedEvents.slice(0, 6).map((event) => {
            const severity = getSeverity(event);
            const stateLabel = event.source === "wsdot" ? "WA" : "IN";
            return (
              <div key={event.id} className="flex-none">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${
                      severity === "high"
                        ? "bg-[#ff3d3d]"
                        : severity === "medium"
                          ? "bg-[#F97316]"
                          : "bg-[#d6ff79]"
                    }`}
                  />
                  <div className="flex flex-col">
                    <div className="text-[11px] text-[#ccc] font-mono uppercase tracking-wider">
                      {event.category || "EVENT"}
                    </div>
                    <div className="text-sm font-medium text-[#eee] leading-tight max-w-[200px] truncate">
                      {event.title}
                    </div>
                    <div className="text-[10px] text-[#666] font-mono">
                      {stateLabel} • Priority {event.priority || "—"}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {unifiedEvents.length === 0 && (
            <div className="text-[#666] text-sm">No active incidents</div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Map Container */}
        <div className="flex-1 relative bg-[#050505] overflow-hidden">
          <div ref={mapContainerRef} className="absolute inset-0" />

          {/* Grid overlay */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:60px_60px] pointer-events-none z-10" />

          {/* Decorative corners */}
          <div className="absolute top-4 left-4 w-4 h-4 border-l border-t border-[#333] z-20" />
          <div className="absolute bottom-4 left-4 w-4 h-4 border-l border-b border-[#333] z-20" />
        </div>

        {/* Right Sidebar: Events */}
        <div className="w-80 flex-none border-l border-[#1a1a1a] bg-[#0a0a0a] flex flex-col z-10">
          <div className="p-4 border-b border-[#1a1a1a] flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-[#666] tracking-wider">
              Traffic Incidents
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#555] font-mono">
                {unifiedEvents.length} active
              </span>
              <div className="w-2 h-2 rounded-full bg-[#F97316] animate-pulse" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {unifiedEvents.map((event) => {
              const severity = getSeverity(event);
              const stateLabel = event.source === "wsdot" ? "WA" : "IN";
              const handleClick = () => {
                if (!mapRef.current || !event.coordinates) return;
                // coordinates are [lng, lat]
                const [lng, lat] = event.coordinates;
                mapRef.current.flyTo([lat, lng], 12, { duration: 0.5 });
              };
              return (
                <div
                  key={event.id}
                  onClick={handleClick}
                  className="group p-3 border border-[#1a1a1a] bg-[#050505] hover:border-[#F97316] transition-colors cursor-pointer rounded-sm"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <EventIcon event={event} />
                      <span className="text-[10px] text-[#F97316] font-mono uppercase">
                        {stateLabel} • {event.category || "EVENT"}
                      </span>
                    </div>
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${
                        severity === "high"
                          ? "bg-[#ff3d3d]"
                          : severity === "medium"
                            ? "bg-[#F97316]"
                            : "bg-[#d6ff79]"
                      }`}
                    />
                  </div>
                  <div className="text-sm font-medium text-[#eee] mb-1 line-clamp-2">
                    {event.title}
                  </div>
                  {event.road && (
                    <div className="text-[10px] text-[#777] font-mono mb-1">
                      {event.road}
                    </div>
                  )}
                  {event.coordinates && (
                    <div className="text-[10px] text-[#555] font-mono">
                      {event.coordinates[1].toFixed(4)},{" "}
                      {event.coordinates[0].toFixed(4)}
                    </div>
                  )}
                </div>
              );
            })}

            {unifiedEvents.length === 0 && (
              <div className="text-center text-[#555] py-8">
                <MapPin size={24} className="mx-auto mb-2 opacity-50" />
                <div className="text-sm">No active incidents</div>
              </div>
            )}

            {/* System Status in Sidebar */}
            <div className="mt-6 p-4 border border-[#1a1a1a] bg-[#080808] rounded-sm">
              <div className="text-[10px] text-[#666] font-mono mb-2 uppercase">
                Data Sources
              </div>
              <div className="flex justify-between items-center text-xs mb-1">
                <span>511 Indiana</span>
                <span className="text-[#F97316]">
                  {trafficData ? "Live" : "—"}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs mb-1">
                <span>WSDOT Washington</span>
                <span className="text-[#F97316]">
                  {wsdotData ? "Live" : "—"}
                </span>
              </div>
              <div className="w-full bg-[#1a1a1a] h-0.5 rounded-full overflow-hidden mb-3">
                <div className="bg-[#F97316] w-full h-full" />
              </div>
              <div className="flex justify-between items-center text-xs mb-1">
                <span>Last Update</span>
                <span className="text-[#888]">
                  {trafficData?.lastUpdate || wsdotData?.lastUpdate
                    ? new Date(
                        trafficData?.lastUpdate || wsdotData?.lastUpdate || 0,
                      ).toLocaleTimeString()
                    : "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const WorldMapPage = withErrorBoundary(WorldMapPageComponent, {
  title: "World Map",
});
