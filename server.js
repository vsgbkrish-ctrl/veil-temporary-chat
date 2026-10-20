const express = require("express");
const http = require("http");
const helmet = require("helmet");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 6 * 1024 * 1024,
  cors: { origin: false }
});

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdn.socket.io"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "blob:", "data:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(express.static("public", { maxAge: "1h" }));
app.get("/health", (_req, res) => res.json({ ok: true }));

// Ephemeral in-memory state only. Nothing is written to a database or disk.
const rooms = new Map(); // code -> { members: Set(socketId), createdAt }
const socketRoom = new Map(); // socketId -> code
const rate = new Map();

function allow(socket, action, limit = 12, windowMs = 60_000) {
  const key = `${socket.handshake.address || "unknown"}:${action}`;
  const now = Date.now();
  const old = rate.get(key) || [];
  const recent = old.filter(t => now - t < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  rate.set(key, recent);
  return true;
}
function makeCode() {
  // 8 uppercase hex characters: random 32-bit code; rate-limit joins.
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}
function cleanRoom(code, reason = "A participant left. This room has been destroyed.") {
  const room = rooms.get(code);
  if (!room) return;
  rooms.delete(code);
  for (const id of room.members) {
    socketRoom.delete(id);
    const s = io.sockets.sockets.get(id);
    if (s) {
      s.emit("room-destroyed", { message: reason });
      s.leave(code);
      if (s.connected) s.disconnect(true);
    }
  }
}
function removeSocket(socket, reason) {
  const code = socketRoom.get(socket.id);
  if (!code) return;
  const room = rooms.get(code);
  socketRoom.delete(socket.id);
  if (room) cleanRoom(code, reason || "A participant disconnected. This room has been destroyed.");
}

io.on("connection", socket => {
  socket.on("create-room", callback => {
    if (!allow(socket, "create", 8)) return callback?.({ ok: false, error: "Too many attempts. Try again shortly." });
    // Remove any room this socket was previously in.
    removeSocket(socket, "A participant changed rooms. This room has been destroyed.");
    let code;
    do { code = makeCode(); } while (rooms.has(code));
    rooms.set(code, { members: new Set([socket.id]), createdAt: Date.now() });
    socketRoom.set(socket.id, code);
    socket.join(code);
    callback?.({ ok: true, code });
  });

  socket.on("join-room", (rawCode, callback) => {
    if (!allow(socket, "join", 15)) return callback?.({ ok: false, error: "Too many attempts. Try again shortly." });
    const code = String(rawCode || "").trim().toUpperCase().replace(/[^A-F0-9]/g, "");
    const room = rooms.get(code);
    if (!room) return callback?.({ ok: false, error: "Code not found. Ask the other person to create a new room." });
    if (room.members.size >= 2 || room.members.has(socket.id)) {
      return callback?.({ ok: false, error: "This room is full or already joined." });
    }
    removeSocket(socket, "A participant changed rooms. This room has been destroyed.");
    room.members.add(socket.id);
    socketRoom.set(socket.id, code);
    socket.join(code);
    callback?.({ ok: true });
    io.to(code).emit("peer-status", { connected: true });
  });

  socket.on("chat-message", payload => {
    const code = socketRoom.get(socket.id);
    const room = rooms.get(code);
    if (!code || !room || room.members.size !== 2) return;
    const text = String(payload?.text || "").slice(0, 4000);
    if (!text.trim()) return;
    // Relayed only to the other participant; not saved by this server.
    for (const id of room.members) {
      if (id !== socket.id) io.to(id).emit("chat-message", { text, from: "peer", at: Date.now() });
    }
  });

  socket.on("media-message", payload => {
    const code = socketRoom.get(socket.id);
    const room = rooms.get(code);
    if (!code || !room || room.members.size !== 2) return;
    const name = String(payload?.name || "file").replace(/[^\w.\- ()]/g, "_").slice(0, 100);
    const mime = String(payload?.mime || "application/octet-stream").slice(0, 100);
    const data = String(payload?.data || "");
    // Base64 data URL only, with an explicit 4 MiB payload cap.
    if (!data.startsWith("data:") || data.length > 4 * 1024 * 1024 * 1.4) {
      socket.emit("app-error", { message: "File is too large. Maximum size is 4 MiB." });
      return;
    }
    for (const id of room.members) {
      if (id !== socket.id) io.to(id).emit("media-message", { name, mime, data, from: "peer", at: Date.now() });
    }
  });

  socket.on("leave-room", () => removeSocket(socket, "A participant left. This room has been destroyed."));
  socket.on("disconnect", () => removeSocket(socket, "A participant disconnected. This room has been destroyed."));
});

// Destroy stale rooms as a safety net (10 minute maximum lifetime).
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.createdAt > 10 * 60 * 1000) {
      cleanRoom(code, "This room expired after 10 minutes.");
    }
  }
}, 30_000).unref();

const port = Number(process.env.PORT || 3000);
server.listen(port, "0.0.0.0", () => console.log(`Veil listening on ${port}`));
