import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { io } from "socket.io-client";

const socket = io("https://trip-chain.vercel.app/", { transports: ["websocket"] }); // adjust if you changed port

function uid() {
  return (crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
}

export default function App() {
  const mapRef = useRef(null);
  const pathRef = useRef(null);
  const heatRef = useRef(null);

  // NEW: user marker + accuracy circle
  const userMarkerRef = useRef(null);
  const accuracyRef = useRef(null);

  const deviceIdRef = useRef(localStorage.getItem("deviceId") || uid());
  const [isCollecting, setIsCollecting] = useState(false);
  const [status, setStatus] = useState("idle");

  const recentAccel = useRef({ax:0, ay:0, az:0});
  const hpState = useRef({ax:0, ay:0, az:0});
  const lastBumpTs = useRef(0);
  const lastPosRef = useRef({lat:null,lng:null,speed:0,ts:0});

  useEffect(() => {
    localStorage.setItem("deviceId", deviceIdRef.current);

    // Init map
    const map = L.map("map");
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);

    // Path polyline (line of travel)
    pathRef.current = L.polyline([], { weight: 4, opacity: 0.9, color: "#22c55e" }).addTo(map);

    // Heat/bumps layer
    heatRef.current = L.layerGroup().addTo(map);

    // Socket listeners
    socket.on("pos", drawRemote);
    socket.on("bump", addHeatDot);
    socket.on("heat:init", (pts) => pts.forEach(addHeatDot));

    setStatus("ready");
    return () => {
      socket.off("pos", drawRemote);
      socket.off("bump", addHeatDot);
      map.remove();
    };
  }, []);

  function drawRemote(_p) {
    // no-op for now, you can render other users separately
  }

  function addHeatDot(b) {
    const size = 40 + Math.min(60, b.score * 10);
    const opacity = Math.max(0.25, Math.min(0.6, b.score / 3));
    L.circle([b.lat, b.lng], {
      radius: size, color: "#f59e0b", fillColor: "#f59e0b",
      fillOpacity: opacity, weight: 0
    }).addTo(heatRef.current);
  }

  async function ensureMotionPermission() {
    const anyWin = window;
    if (typeof anyWin.DeviceMotionEvent?.requestPermission === "function") {
      try { return (await anyWin.DeviceMotionEvent.requestPermission()) === "granted"; }
      catch { return false; }
    }
    return true;
  }

  async function start() {
    setStatus("requesting");
    const ok = await ensureMotionPermission();
    if (!ok) {
      alert("Motion permission denied. Tap Start again and allow access.");
      setStatus("ready");
      return;
    }
    startSensors();
    startGPS();
    setIsCollecting(true);
    setStatus("collecting");
  }

  function stop() {
    stopSensors();
    stopGPS();
    setIsCollecting(false);
    setStatus("ready");
  }

  // === GPS ===
  const watchIdRef = useRef(null);
  function startGPS() {
    if (!("geolocation" in navigator)) return alert("Geolocation not supported");
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy, speed } = pos.coords;
        const ts = Date.now();

        // 1) Update path polyline (line of travel)
        const latlng = [lat, lng];
        pathRef.current.addLatLng(latlng);

        // Center on first fix
        if (pathRef.current.getLatLngs().length === 1) {
          mapRef.current.setView(latlng, 16);
        }

        // 2) NEW: Update user marker + accuracy ring
        updateUserMarker(lat, lng, accuracy);

        // 3) Emit live position to server
        socket.emit("pos", {
          deviceId: deviceIdRef.current, lat, lng, speed: speed ?? 0, ts
        });

        // Save latest for bump geotagging
        lastPosRef.current = { lat, lng, speed: speed ?? 0, ts };
      },
      (err) => console.error(err),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
  }

  function stopGPS() {
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    // Optional: keep marker/path on map after stop
  }

  // NEW: create/update the moving user marker
  function updateUserMarker(lat, lng, accuracy = 0) {
    const latlng = [lat, lng];

    if (!userMarkerRef.current) {
      // Minimal pulse dot marker (circleMarker) + a small heading-agnostic icon
      userMarkerRef.current = L.marker(latlng, {
        title: "You are here"
      }).addTo(mapRef.current);

      // Optional: draw a blue accuracy circle
      accuracyRef.current = L.circle(latlng, {
        radius: Math.min(Math.max(accuracy || 0, 5), 100), // clamp 5–100m
        color: "#3b82f6",
        fillColor: "#3b82f6",
        fillOpacity: 0.15,
        weight: 1
      }).addTo(mapRef.current);
    } else {
      userMarkerRef.current.setLatLng(latlng);
      if (accuracyRef.current) {
        accuracyRef.current.setLatLng(latlng);
        if (accuracy) accuracyRef.current.setRadius(Math.min(Math.max(accuracy, 5), 100));
      }
    }
  }

  // === Motion (bump detector) ===
  function startSensors() {
    window.addEventListener("devicemotion", onMotion, { passive: true });
  }
  function stopSensors() {
    window.removeEventListener("devicemotion", onMotion);
  }

  const cfg = {
    hpAlpha: 0.8,
    jerkThresh: 3.0,
    minGapMs: 1500,
    minSpeedMps: 2.0
  };

  let prev = {ax:0, ay:0, az:0, t:0};

  function onMotion(e) {
    const t = performance.now();
    const ax = e.accelerationIncludingGravity?.x ?? 0;
    const ay = e.accelerationIncludingGravity?.y ?? 0;
    const az = e.accelerationIncludingGravity?.z ?? 0;

    const a = cfg.hpAlpha;
    hpState.current.ax = a * (hpState.current.ax + ax - recentAccel.current.ax);
    hpState.current.ay = a * (hpState.current.ay + ay - recentAccel.current.ay);
    hpState.current.az = a * (hpState.current.az + az - recentAccel.current.az);
    recentAccel.current = {ax, ay, az};

    const dt = (t - prev.t) / 1000;
    const jx = dt > 0 ? (hpState.current.ax - prev.ax) / dt : 0;
    const jy = dt > 0 ? (hpState.current.ay - prev.ay) / dt : 0;
    const jz = dt > 0 ? (hpState.current.az - prev.az) / dt : 0;
    const jerkMag = Math.sqrt(jx*jx + jy*jy + jz*jz);

    prev = { ax: hpState.current.ax, ay: hpState.current.ay, az: hpState.current.az, t };

    const now = Date.now();
    const last = lastPosRef.current;
    if (!last || last.lat == null) return;
    if ((last.speed ?? 0) < cfg.minSpeedMps) return;
    if (now - lastBumpTs.current < cfg.minGapMs) return;

    if (jerkMag > cfg.jerkThresh) {
      lastBumpTs.current = now;
      const score = Math.min(5, (jerkMag - cfg.jerkThresh) * 0.8 + 1);
      const bump = { deviceId: deviceIdRef.current, lat: last.lat, lng: last.lng, score, ts: now };
      addHeatDot(bump);
      socket.emit("bump", bump);
    }
  }

  return (
    <div className="w-full h-full">
      <header className="fixed top-3 left-1/2 -translate-x-1/2 z-[1000]">
        <div className="px-4 py-2 rounded-2xl bg-slate-900/70 backdrop-blur border border-slate-700/50 shadow-lg flex items-center gap-3">
          <div className="text-sm">
            <div className="font-semibold">Trip Roughness</div>
            <div className="text-xs opacity-80">{status}</div>
          </div>
          {!isCollecting ? (
            <button
              onClick={start}
              className="ml-2 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-semibold"
            >
              Start
            </button>
          ) : (
            <button
              onClick={stop}
              className="ml-2 px-3 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-slate-900 font-semibold"
            >
              Stop
            </button>
          )}
        </div>
      </header>
      <div id="map" style={{height:"100dvh"}}></div>
    </div>
  );
}
