// npm i express socket.io cors
import express from "express";
import http from "http";
import cors from "cors";
import { Server as IOServer } from "socket.io";

const app = express();
app.use(cors()); // tighten in prod
const server = http.createServer(app);
const io = new IOServer(server, {
  cors: {
    origin: "*", // set to your frontend origin in prod
    methods: ["GET", "POST"]
  }
});

// naive in-memory store (replace with MongoDB later)
const bumps = []; // {lat, lng, ts, score}
const livePositions = new Map(); // deviceId -> {lat,lng,ts}

io.on("connection", (socket) => {
  // send existing heat to new clients
  socket.emit("heat:init", bumps.slice(-5000));

  socket.on("pos", (data) => {
    // {deviceId, lat, lng, speed, ts}
    livePositions.set(data.deviceId, data);
    socket.broadcast.emit("pos", data);
  });

  socket.on("bump", (b) => {
    // {deviceId, lat, lng, score, ts}
    bumps.push(b);
    // keep memory bounded
    if (bumps.length > 20000) bumps.splice(0, bumps.length - 20000);
    io.emit("bump", b);
  });

  socket.on("disconnect", () => {
    // optional: remove device if you tracked by socket.id
  });
});

app.get("/", (_, res) => res.send("Socket server running"));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log("Listening on " + PORT));
