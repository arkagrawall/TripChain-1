import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { io } from "socket.io-client";

// --- Fix Leaflet default marker icons ---
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// --- Use your LAN IP here ---
const SOCKET_URL =
  (typeof window !== "undefined" && window.SOCKET_URL) ||
  "http://192.168.1.23:5000"; // Replace with your LAN IP

const socket = io(SOCKET_URL, {
  transports: ["websocket"],
  reconnectionAttempts: 5,
  timeout: 10000,
  withCredentials: true,
});

function FlyTo({ lat, lon }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lon], map.getZoom(), { duration: 0.4 });
  }, [lat, lon, map]);
  return null;
}

export default function App() {
  const [position, setPosition] = useState({ lat: 28.6139, lon: 77.209 }); // Default Delhi
  const [bumps, setBumps] = useState([]);
  const [accel, setAccel] = useState({ x: 0, y: 0, z: 0, linear: 0 });
  const [detecting, setDetecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [sensitivity, setSensitivity] = useState(12);
  const [cooldownMs, setCooldownMs] = useState(2000);

  const lastBumpRef = useRef(0);
  const motionHandlerRef = useRef(null);

  // Socket connection + bumps listener
  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onNewBump = (bump) => setBumps((prev) => [bump, ...prev]);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("new-bump", onNewBump);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("new-bump", onNewBump);
    };
  }, []);

  // Geolocation tracking
  useEffect(() => {
    if (!("geolocation" in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => setPosition({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => console.warn("getCurrentPosition error:", err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );

    const id = navigator.geolocation.watchPosition(
      (pos) => setPosition({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => console.warn("watchPosition error:", err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );

    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // iOS device motion permission
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

  // Bump detection via DeviceMotion API
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
      const linear = Math.abs(total - 9.81); // remove gravity effect

      setAccel({ x, y, z, linear });

      const now = Date.now();
      if (linear > sensitivity && now - lastBumpRef.current > cooldownMs) {
        lastBumpRef.current = now;
        const bump = {
          id: String(now),
          time: new Date().toLocaleTimeString(),
          coords: position,
          accel: linear.toFixed(2),
        };
        setBumps((prev) => [bump, ...prev]);
        socket.emit("send-bump", bump);
      }
    };

    motionHandlerRef.current = handler;
    window.addEventListener("devicemotion", handler, { passive: true });

    return () => {
      window.removeEventListener("devicemotion", handler);
      motionHandlerRef.current = null;
    };
  }, [detecting, position, sensitivity, cooldownMs]);

  const startDetection = async () => {
    const ok = await requestMotionPermission();
    if (!ok) {
      alert("Please allow motion & orientation access.");
      return;
    }
    setDetecting(true);
  };
  const stopDetection = () => setDetecting(false);

  // Custom blue icon for user's location
  const youIcon = useMemo(
    () =>
      new L.Icon({
        iconUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
      }),
    []
  );

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto space-y-4">
        <header className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold">🚗 Road Bump Detector</h1>
          <div
            className={`px-3 py-1 rounded-full text-sm ${
              connected ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
            }`}
          >
            {connected ? "Connected" : "Offline"}
          </div>
        </header>

        <section className="grid md:grid-cols-3 gap-4">
          {/* Map Section */}
          <div className="md:col-span-2 bg-white rounded-2xl shadow p-3">
            <div className="rounded-xl overflow-hidden" style={{ height: 440 }}>
              <MapContainer
                center={[position.lat, position.lon]}
                zoom={15}
                style={{ height: "100%", width: "100%" }}
                attributionControl={false}  // 👈 Removes Leaflet watermark
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={[position.lat, position.lon]} icon={youIcon}>
                  <Popup>You are here</Popup>
                </Marker>
                {bumps.map((b) => (
                  <Marker key={b.id} position={[b.coords.lat, b.coords.lon]}>
                    <Popup>
                      ⚠️ {b.time} <br /> Accel: {b.accel}
                    </Popup>
                  </Marker>
                ))}
                <FlyTo lat={position.lat} lon={position.lon} />
              </MapContainer>
            </div>
          </div>

          {/* Control Panel */}
          <div className="bg-white rounded-2xl shadow p-4 space-y-4">
            <div className="flex items-center gap-2">
              {!detecting ? (
                <button
                  onClick={startDetection}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition"
                >
                  Start Detection
                </button>
              ) : (
                <button
                  onClick={stopDetection}
                  className="px-4 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 transition"
                >
                  Stop Detection
                </button>
              )}
              <span className="text-sm text-gray-600">
                Accel: {accel.linear.toFixed(2)} m/s²
              </span>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Sensitivity: {sensitivity}
              </label>
              <input
                type="range"
                min={6}
                max={20}
                step={1}
                value={sensitivity}
                onChange={(e) => setSensitivity(Number(e.target.value))}
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                Lower = detects smaller bumps.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Cooldown: {cooldownMs}ms
              </label>
              <input
                type="range"
                min={500}
                max={5000}
                step={100}
                value={cooldownMs}
                onChange={(e) => setCooldownMs(Number(e.target.value))}
                className="w-full"
              />
            </div>

            {/* Accelerometer values */}
            <div className="text-sm grid grid-cols-3 gap-2">
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <div className="text-gray-500">X</div>
                <div className="font-mono">{accel.x.toFixed(2)}</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <div className="text-gray-500">Y</div>
                <div className="font-mono">{accel.y.toFixed(2)}</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <div className="text-gray-500">Z</div>
                <div className="font-mono">{accel.z.toFixed(2)}</div>
              </div>
            </div>

            {/* Bumps List */}
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Bumps</h3>
                <span className="text-xs text-gray-500">{bumps.length} total</span>
              </div>
              <ul className="mt-2 max-h-56 overflow-auto space-y-1">
                {bumps.map((b) => (
                  <li
                    key={b.id}
                    className="text-sm bg-white rounded-lg border border-gray-200 p-2 flex items-center justify-between"
                  >
                    <span>
                      {b.time} — {b.coords.lat.toFixed(5)}, {b.coords.lon.toFixed(5)}
                    </span>
                    <span className="font-mono text-gray-600">a:{b.accel}</span>
                  </li>
                ))}
                {bumps.length === 0 && (
                  <li className="text-sm text-gray-500">No bumps detected yet.</li>
                )}
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
