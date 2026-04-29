// server.ts
import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import dotenv from "dotenv";
import path from "path";
dotenv.config();
async function startServer() {
  const app = express();
  const server = createServer(app);
  const PORT = parseInt(process.env.PORT || "3000", 10);
  app.use(express.json());
  const wss = new WebSocketServer({ server });
  const livekitHost = (process.env.LIVEKIT_URL || "").replace("wss://", "https://").replace("ws://", "http://");
  const roomService = new RoomServiceClient(
    livekitHost,
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET
  );
  const rooms = /* @__PURE__ */ new Map();
  wss.on("connection", (ws) => {
    let currentRoom = null;
    let currentUserId = null;
    ws.on("message", (data) => {
      const message = JSON.parse(data.toString());
      switch (message.type) {
        case "join":
          currentRoom = message.room;
          currentUserId = message.userId;
          const userName = message.name;
          const isAdmin = message.isAdmin;
          const isListener = message.isListener;
          if (!rooms.has(currentRoom)) {
            rooms.set(currentRoom, /* @__PURE__ */ new Map());
          }
          rooms.get(currentRoom)?.set(currentUserId, { ws, name: userName, isAdmin, isListener });
          const existingParticipants = [];
          rooms.get(currentRoom)?.forEach((participant, id) => {
            if (id !== currentUserId) {
              existingParticipants.push({
                userId: id,
                name: participant.name,
                isAdmin: participant.isAdmin,
                isListener: participant.isListener
              });
              if (participant.ws.readyState === WebSocket.OPEN) {
                participant.ws.send(JSON.stringify({
                  type: "user-joined",
                  userId: currentUserId,
                  name: userName,
                  isAdmin,
                  isListener
                }));
              }
            }
          });
          ws.send(JSON.stringify({
            type: "participants-list",
            participants: existingParticipants
          }));
          break;
        case "toggle-hand":
        case "remote-mute":
        case "mute-all":
        case "lower-all-hands":
        case "poll-created":
        case "poll-voted":
        case "question-asked":
        case "question-upvoted":
        case "end-meeting":
        case "remove-participant":
          if (currentRoom) {
            rooms.get(currentRoom)?.forEach((participant) => {
              if (participant.ws.readyState === WebSocket.OPEN) {
                participant.ws.send(JSON.stringify(message));
              }
            });
          }
          break;
        case "speaker-approved":
          if (currentRoom && message.targetId) {
            roomService.updateParticipant(currentRoom, message.targetId, {
              permission: { canPublish: true, canSubscribe: true, canPublishData: true }
            }).catch((err) => console.warn("LiveKit updateParticipant (approve) failed:", err.message));
            rooms.get(currentRoom)?.forEach((participant) => {
              if (participant.ws.readyState === WebSocket.OPEN) {
                participant.ws.send(JSON.stringify(message));
              }
            });
          }
          break;
        case "speaker-revoked":
          if (currentRoom && message.targetId) {
            roomService.updateParticipant(currentRoom, message.targetId, {
              permission: { canPublish: false, canSubscribe: true, canPublishData: true }
            }).catch((err) => console.warn("LiveKit updateParticipant (revoke) failed:", err.message));
            rooms.get(currentRoom)?.forEach((participant) => {
              if (participant.ws.readyState === WebSocket.OPEN) {
                participant.ws.send(JSON.stringify(message));
              }
            });
          }
          break;
        case "ping":
          break;
        case "chat":
          rooms.get(currentRoom)?.forEach((participant) => {
            if (participant.ws.readyState === WebSocket.OPEN) {
              participant.ws.send(JSON.stringify(message));
            }
          });
          break;
      }
    });
    ws.on("close", () => {
      if (currentRoom && currentUserId && rooms.has(currentRoom)) {
        rooms.get(currentRoom)?.delete(currentUserId);
        rooms.get(currentRoom)?.forEach((participant) => {
          if (participant.ws.readyState === WebSocket.OPEN) {
            participant.ws.send(JSON.stringify({
              type: "user-left",
              userId: currentUserId
            }));
          }
        });
        if (rooms.get(currentRoom)?.size === 0) {
          rooms.delete(currentRoom);
        }
      }
    });
  });
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });
  app.post("/api/livekit-token", async (req, res) => {
    try {
      const { roomName, participantName, isAdmin, identity } = req.body;
      if (!roomName || !participantName) {
        return res.status(400).json({ error: "Missing roomName or participantName" });
      }
      const apiKey = process.env.LIVEKIT_API_KEY;
      const apiSecret = process.env.LIVEKIT_API_SECRET;
      if (!apiKey || !apiSecret) {
        return res.status(500).json({ error: "LiveKit credentials not configured on server" });
      }
      const at = new AccessToken(apiKey, apiSecret, {
        identity: identity || participantName,
        name: participantName
      });
      at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: isAdmin,
        canSubscribe: true
      });
      const token = await at.toJwt();
      res.json({ token, url: process.env.LIVEKIT_URL });
    } catch (error) {
      console.error("Error generating token:", error);
      res.status(500).json({ error: "Failed to generate LiveKit token" });
    }
  });
  app.post("/api/livekit-token-refresh", async (req, res) => {
    try {
      const { roomName, participantName, identity, canPublish } = req.body;
      if (!roomName || !participantName || !identity) {
        return res.status(400).json({ error: "Missing roomName, participantName, or identity" });
      }
      const apiKey = process.env.LIVEKIT_API_KEY;
      const apiSecret = process.env.LIVEKIT_API_SECRET;
      if (!apiKey || !apiSecret) {
        return res.status(500).json({ error: "LiveKit credentials not configured on server" });
      }
      const at = new AccessToken(apiKey, apiSecret, {
        identity,
        name: participantName
      });
      at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: !!canPublish,
        canSubscribe: true
      });
      const token = await at.toJwt();
      res.json({ token, url: process.env.LIVEKIT_URL });
    } catch (error) {
      console.error("Error refreshing token:", error);
      res.status(500).json({ error: "Failed to refresh LiveKit token" });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    app.use("/app", express.static("dist"));
    app.get("/", (req, res) => {
      res.redirect("/app");
    });
    app.get("/app/*", (req, res) => {
      res.sendFile(path.resolve(process.cwd(), "dist", "index.html"));
    });
  }
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();
