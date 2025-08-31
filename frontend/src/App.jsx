import React, { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  CircleMarker,
  Polyline,
  Popup,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { io } from "socket.io-client";

// --- Fix Leaflet default marker icons (for fallback marker) ---
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// --- Config (override in public/index.html if you like) ---
const SOCKET_URL =
  (typeof window !== "undefined" && window.SOCKET_URL) ||
  "http://192.168.1.23:5000";

const socket = io(SOCKET_URL, {
  transports: ["websocket"],
  reconnectionAttempts: 5,
  timeout: 10000,
  withCredentials: true,
});

// Haversine distance (meters)
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Auto-tune thresholds by speed
function getAutoParams(speedKmh) {
  if (speedKmh < 5) return { cooldown: 2500, sensitivity: 10 };
  if (speedKmh < 25) return { cooldown: 1800, sensitivity: 12 };
  if (speedKmh < 60) return { cooldown: 1200, sensitivity: 14 };
  return { cooldown: 800, sensitivity: 16 };
}

// Custom icons
const userIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const bumpIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export default function App() {
  const [position, setPosition] = useState({ lat: 28.6139, lon: 77.209 }); // Delhi default
  const [speedKmh, setSpeedKmh] = useState(0);

  // Motion / bumps
  const [accel, setAccel] = useState({ x: 0, y: 0, z: 0, linear: 0 });
  const [bumps, setBumps] = useState([]);
  const [detecting, setDetecting] = useState(false);

  // Networking
  const [connected, setConnected] = useState(false);

  // Sensitivity / cooldown controls
  const [autoTune, setAutoTune] = useState(true);
  const [manualSensitivity, setManualSensitivity] = useState(12);
  const [manualCooldownMs, setManualCooldownMs] = useState(2000);

  const { cooldown: autoCooldown, sensitivity: autoSensitivity } =
    getAutoParams(speedKmh);
  const effectiveCooldown = autoTune ? autoCooldown : manualCooldownMs;
  const effectiveSensitivity = autoTune ? autoSensitivity : manualSensitivity;

  // Refs
  const lastGeoRef = useRef(null); // {lat, lon, t}
  const motionHandlerRef = useRef(null);
  const lastBumpRef = useRef(0);

  // Path + highlighted segments
  const [path, setPath] = useState([]); // [[lat, lon], ...]
  const [redSegments, setRedSegments] = useState([]); // [ [[lat,lon],...], ... ]

  // Socket listeners
  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onNewBump = (b) => setBumps((prev) => [b, ...prev]);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("new-bump", onNewBump);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("new-bump", onNewBump);
    };
  }, []);

  // Geolocation tracking + path building
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const opts = { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 };

    const handlePos = (pos) => {
      const { latitude, longitude, speed } = pos.coords;
      const now = Date.now();
      const next = { lat: latitude, lon: longitude };

      setPosition(next);

      // Append to path (dedupe identical)
      setPath((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last[0] !== next.lat || last[1] !== next.lon) {
          const updated = [...prev, [next.lat, next.lon]];
          if (updated.length > 10000) updated.shift(); // cap to avoid memory issues
          return updated;
        }
        return prev;
      });

      // Speed calculation (prefer native, else derive)
      let spdMs = typeof speed === "number" && speed >= 0 ? speed : null;
      if (spdMs == null && lastGeoRef.current) {
        const dt = (now - lastGeoRef.current.t) / 1000;
        if (dt > 0.5 && dt < 15) {
          const d = haversineMeters(
            lastGeoRef.current.lat,
            lastGeoRef.current.lon,
            latitude,
            longitude
          );
          spdMs = d / dt;
        }
      }
      if (spdMs != null && Number.isFinite(spdMs)) {
        const kmh = Math.max(0, Math.min(180, spdMs * 3.6));
        setSpeedKmh(kmh);
      }
      lastGeoRef.current = { lat: latitude, lon: longitude, t: now };
    };

    navigator.geolocation.getCurrentPosition(handlePos, console.warn, opts);
    const id = navigator.geolocation.watchPosition(
      handlePos,
      console.warn,
      opts
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [speedKmh]);

  // iOS motion permission helper
  const requestMotionPermission = async () => {
    const DM = window.DeviceMotionEvent;
    if (DM && typeof DM.requestPermission === "function") {
      try {
        const res = await DM.requestPermission();
        return res === "granted";
      } catch {
        return false;
      }
    }
    return true;
  };

  // Build a red segment around a strong bump (~30 m back along path)
  const addRedSegmentNear = (centerLat, centerLon) => {
    const MAX_BACK_METERS = 30;
    if (path.length < 2) return;
    let seg = [[centerLat, centerLon]];
    let acc = 0;
    for (let i = path.length - 1; i > 0; i--) {
      const [aLat, aLon] = path[i];
      const [bLat, bLon] = path[i - 1];
      seg.unshift([aLat, aLon]); // older → newer
      acc += haversineMeters(aLat, aLon, bLat, bLon);
      if (acc >= MAX_BACK_METERS) break;
    }
    if (seg.length >= 2) setRedSegments((prev) => [...prev, seg]);
  };

  // Motion sensor → bump detection
  useEffect(() => {
    if (!detecting) {
      if (motionHandlerRef.current) {
        window.removeEventListener("devicemotion", motionHandlerRef.current);
        motionHandlerRef.current = null;
      }
      return;
    }

    const handler = (event) => {
      const g = event.accelerationIncludingGravity || { x: 0, y: 0, z: 0 };
      const x = g.x || 0;
      const y = g.y || 0;
      const z = g.z || 0;
      const total = Math.sqrt(x * x + y * y + z * z);
      const linear = Math.abs(total - 9.81); // approx gravity removal
      setAccel({ x, y, z, linear });

      const now = Date.now();
      if (
        linear > effectiveSensitivity &&
        now - lastBumpRef.current > effectiveCooldown
      ) {
        lastBumpRef.current = now;

        const bump = {
          id: String(now),
          time: new Date().toLocaleTimeString(),
          coords: position,
          accel: linear.toFixed(2),
          speedKmh: Number(speedKmh.toFixed(1)),
        };
        setBumps((prev) => [bump, ...prev]);
        socket.emit("send-bump", bump);

        // Highlight strong bumps
        const highThreshold = Math.max(16, effectiveSensitivity + 3);
        if (linear >= highThreshold) {
          addRedSegmentNear(position.lat, position.lon);
        }
      }
    };

    motionHandlerRef.current = handler;
    window.addEventListener("devicemotion", handler, { passive: true });
    return () => {
      window.removeEventListener("devicemotion", handler);
      motionHandlerRef.current = null;
    };
  }, [
    detecting,
    position,
    effectiveSensitivity,
    effectiveCooldown,
    speedKmh,
    path,
  ]);

  const startDetection = async () => {
    const ok = await requestMotionPermission();
    if (!ok) {
      alert("Please allow motion & orientation access.");
      return;
    }
    setDetecting(true);
  };
  const stopDetection = () => setDetecting(false);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4">
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Header */}
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">🚗 Road Bump Detector</h1>
          <div
            className={`px-3 py-1 rounded-full text-sm ${
              connected
                ? "bg-emerald-900/40 text-emerald-300"
                : "bg-rose-900/40 text-rose-300"
            }`}
          >
            {connected ? "Connected" : "Offline"}
          </div>
        </header>

        <section className="grid md:grid-cols-3 gap-4">
          {/* Map */}
          <div className="md:col-span-2 bg-[#0f1115] rounded-2xl shadow p-3 border border-white/5">
            <div className="rounded-xl overflow-hidden" style={{ height: 500 }}>
              <MapContainer
                center={[position.lat, position.lon]}
                zoom={16}
                style={{ height: "100%", width: "100%" }}
                attributionControl={false} // watermark removed for dev
              >
                {/* Dark detailed tiles (Carto Dark Matter) */}
                <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

                {/* User marker (blue) */}
                <Marker position={[position.lat, position.lon]} icon={userIcon}>
                  <Popup>
                    📍 You are here
                    <br />
                    Speed: {speedKmh.toFixed(1)} km/h
                  </Popup>
                </Marker>

                {/* Travelled path (cyan) */}
                {path.length >= 2 && (
                  <Polyline
                    positions={path}
                    pathOptions={{ color: "#22d3ee", weight: 5, opacity: 0.9 }}
                  />
                )}

                {/* Red segments for high bumps */}
                {redSegments.map((seg, i) => (
                  <Polyline
                    key={`hot-${i}`}
                    positions={seg}
                    pathOptions={{ color: "#ef4444", weight: 7, opacity: 0.95 }}
                  />
                ))}

                {/* Bump markers (red icons) */}
                {bumps.map((b) => (
                  <Marker
                    key={b.id}
                    position={[b.coords.lat, b.coords.lon]}
                    icon={bumpIcon}
                  >
                    <Popup>
                      ⚠️ {b.time}
                      <br />
                      Accel: {b.accel} m/s²
                      <br />
                      Speed: {b.speedKmh ?? speedKmh.toFixed(1)} km/h
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          </div>

          {/* Controls */}
          <div className="bg-[#0f1115] rounded-2xl shadow p-4 space-y-4 border border-white/5">
            {/* Start/Stop + quick stats */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {!detecting ? (
                  <button
                    onClick={startDetection}
                    className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 transition"
                  >
                    Start
                  </button>
                ) : (
                  <button
                    onClick={stopDetection}
                    className="px-4 py-2 rounded-xl bg-slate-700 text-slate-100 hover:bg-slate-600 transition"
                  >
                    Stop
                  </button>
                )}
                <span className="text-sm text-slate-300">
                  Linear a: {accel.linear.toFixed(2)} m/s²
                </span>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-200">
                  Speed: <b>{speedKmh.toFixed(1)} km/h</b>
                </div>
                <div className="text-xs text-slate-400">
                  Cooldown: <b>{effectiveCooldown} ms</b> · Sensitivity:{" "}
                  <b>{effectiveSensitivity}</b>
                </div>
              </div>
            </div>

            {/* X/Y/Z counters */}
            <div className="text-sm grid grid-cols-3 gap-2">
              <div className="bg-slate-800/60 rounded-xl p-3 text-center border border-white/5">
                <div className="text-slate-400">X</div>
                <div className="font-mono">{accel.x.toFixed(2)}</div>
              </div>
              <div className="bg-slate-800/60 rounded-xl p-3 text-center border border-white/5">
                <div className="text-slate-400">Y</div>
                <div className="font-mono">{accel.y.toFixed(2)}</div>
              </div>
              <div className="bg-slate-800/60 rounded-xl p-3 text-center border border-white/5">
                <div className="text-slate-400">Z</div>
                <div className="font-mono">{accel.z.toFixed(2)}</div>
              </div>
            </div>

            {/* Auto-Tune */}
            <div className="flex items-center justify-between bg-slate-800/60 rounded-xl p-3 border border-white/5">
              <div>
                <div className="font-medium">Auto-Tune by Speed</div>
                <div className="text-xs text-slate-400">
                  Adjusts cooldown & sensitivity from GPS speed
                </div>
              </div>
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={autoTune}
                  onChange={(e) => setAutoTune(e.target.checked)}
                />
                <div className="w-11 h-6 bg-slate-600/60 rounded-full peer peer-checked:bg-indigo-600 relative">
                  <div className="absolute top-0.5 left-0.5 h-5 w-5 bg-white rounded-full transition-transform peer-checked:translate-x-5"></div>
                </div>
              </label>
            </div>

            {/* Manual controls */}
            <div className={autoTune ? "opacity-50 pointer-events-none" : ""}>
              <label className="block text-sm font-medium mb-1">
                Sensitivity: {manualSensitivity}
              </label>
              <input
                type="range"
                min={6}
                max={20}
                step={0.5}
                value={manualSensitivity}
                onChange={(e) => setManualSensitivity(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />

              <div className="mt-3">
                <label className="block text-sm font-medium mb-1">
                  Cooldown (ms): {manualCooldownMs}
                </label>
                <input
                  type="range"
                  min={500}
                  max={5000}
                  step={100}
                  value={manualCooldownMs}
                  onChange={(e) => setManualCooldownMs(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>
            </div>

            {/* Bumps list */}
            <div className="bg-slate-800/60 rounded-xl p-3 border border-white/5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Bumps</h3>
                <span className="text-xs text-slate-400">
                  {bumps.length} total
                </span>
              </div>
              <ul className="mt-2 max-h-56 overflow-auto space-y-1">
                {bumps.map((b) => (
                  <li
                    key={b.id}
                    className="text-sm bg-slate-900/60 rounded-lg border border-white/10 p-2 flex items-center justify-between"
                  >
                    <span>
                      {b.time} — {b.coords.lat.toFixed(5)},{" "}
                      {b.coords.lon.toFixed(5)}
                    </span>
                    <span className="font-mono text-slate-300">
                      a:{b.accel} · {b.speedKmh ?? speedKmh.toFixed(1)} km/h
                    </span>
                  </li>
                ))}
                {bumps.length === 0 && (
                  <li className="text-sm text-slate-400">
                    No bumps detected yet.
                  </li>
                )}
              </ul>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-xs text-slate-400">
          Dark tiles: Carto “Dark Matter”. For production, add proper
          attribution.
        </footer>
      </div>
    </div>
  );
}
