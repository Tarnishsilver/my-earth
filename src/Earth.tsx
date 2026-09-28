/**
 * Earth.tsx
 * Standalone 3D Earth — ArcGIS Maps SDK 5.1 SceneView + Copernicus GLO-30 DSM.
 * Ported from JalRakshak/frontend/src/map3d (ArcGISTerrainEngine + GLO30ElevationLayer).
 */

import { useEffect, useRef, useState } from "react";
import "@arcgis/core/assets/esri/themes/dark/main.css";
import Map from "@arcgis/core/Map";
import SceneView from "@arcgis/core/views/SceneView";
import type BaseElevationLayer from "@arcgis/core/layers/BaseElevationLayer";
import { GLO30ElevationLayer } from "./GLO30ElevationLayer";

/**
 * `BaseElevationLayer.createSubclass()` is typed as returning `typeof Accessor`
 * (see node_modules/@arcgis/core/core/Accessor.d.ts) — it has no generic
 * parameter, so TypeScript cannot see the custom `load()` / `getElevationAt()`
 * members defined in GLO30ElevationLayer.ts. We recover the real shape with an
 * intersection instead of falling back to `any`.
 */
type GLO30ElevationLayerInstance = InstanceType<typeof GLO30ElevationLayer> &
  InstanceType<typeof BaseElevationLayer> & {
    load(): Promise<unknown>;
    getElevationAt(lon: number, lat: number): number | null;
  };

export default function Earth() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<SceneView | null>(null);
  const elevationRef = useRef<GLO30ElevationLayerInstance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ lon: number; lat: number; elev: number } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    (async () => {
      try {
        // 1. Load the local Copernicus GLO-30 DSM elevation grid (14 MB float32 + metadata)
        const elevation = new GLO30ElevationLayer() as GLO30ElevationLayerInstance;
        await elevation.load();
        if (cancelled) return;
        elevationRef.current = elevation;

        // 2. Attach it as the scene ground
        const map = new Map({
          basemap: "hybrid",
          ground: { layers: [elevation] },
        });

        // 3. Create the WebGL 3D view
        const view = new SceneView({
          container,
          map,
          qualityProfile: "high",
          environment: {
            background: { type: "color", color: [15, 23, 42, 1] },
            starsEnabled: false,
            atmosphereEnabled: true,
            lighting: {
              directShadowsEnabled: true,
              date: new Date("2026-06-21T12:00:00Z"),
            },
          },
          ui: { components: [] },
          camera: {
            position: { longitude: 78.445, latitude: 30.23, z: 3200 },
            heading: 32,
            tilt: 58,
          },
        });
        viewRef.current = view;

        // 4. Live elevation readout on hover — proof the terrain grid is sampling
        view.on("pointer-move", (event) => {
          if (cancelled) return;
          const pt = view.toMap({ x: event.x, y: event.y });
          if (!pt || pt.longitude == null || pt.latitude == null) return;
          const elev = elevation.getElevationAt(pt.longitude, pt.latitude);
          if (elev === null) return;
          setCursor({
            lon: pt.longitude,
            lat: pt.latitude,
            elev: Math.round(elev * 10) / 10,
          });
        });

        await view.when();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();

    return () => {
      cancelled = true;
      viewRef.current?.destroy();
      viewRef.current = null;
      elevationRef.current = null;
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#060913" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {error && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "rgba(15, 23, 42, 0.95)",
            border: "1px solid #ef4444",
            borderRadius: 8,
            padding: 20,
            color: "#fff",
            fontFamily: "monospace",
            fontSize: 12,
            maxWidth: 480,
            textAlign: "center",
          }}
        >
          <strong>3D Terrain failed to load</strong>
          <div style={{ marginTop: 8, color: "#94a3b8" }}>{error}</div>
        </div>
      )}

      {cursor && (
        <div
          style={{
            position: "absolute",
            bottom: 16,
            left: 16,
            background: "rgba(15, 23, 42, 0.9)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 5,
            padding: "5px 10px",
            color: "#cbd5e1",
            fontFamily: "monospace",
            fontSize: 11,
          }}
        >
          <span style={{ color: "#f8fafc", fontWeight: 700 }}>{cursor.elev} m MSL</span>
          {"  ·  "}
          {cursor.lat.toFixed(4)}°N, {cursor.lon.toFixed(4)}°E
          {"  ·  "}
          <span style={{ color: "#38bdf8" }}>Copernicus GLO-30 DSM</span>
        </div>
      )}
    </div>
  );
}
