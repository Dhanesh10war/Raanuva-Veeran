import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { AccessToken } from "livekit-server-sdk";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

async function startServer() {
  const app = express();
  const server = createServer(app);
  const PORT = parseInt(process.env.PORT || '3000', 10);

  app.use(express.json());

  // WebSocket Server for custom signaling (Chat, Polls, Q&A, Hands)
  const wss = new WebSocketServer({ server });

  // Map to track rooms and their participants: Map<roomName, Map<userId, { ws: WebSocket, name: string, isAdmin: boolean, isListener: boolean }>>
  const rooms = new Map<string, Map<string, { ws: WebSocket, name: string, isAdmin: boolean, isListener: boolean }>>();

  wss.on("connection", (ws) => {
    let currentRoom: string | null = null;
    let currentUserId: string | null = null;

    ws.on("message", (data) => {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case "join":
          currentRoom = message.room;
          currentUserId = message.userId;
          const userName = message.name;
          const isAdmin = message.isAdmin;
          const isListener = message.isListener;

          if (!rooms.has(currentRoom!)) {
            rooms.set(currentRoom!, new Map());
          }
          rooms.get(currentRoom!)?.set(currentUserId!, { ws, name: userName, isAdmin, isListener });

          // Notify others in the room and send existing participants to new joiner
          const existingParticipants: { userId: string, name: string, isAdmin: boolean, isListener: boolean }[] = [];
          rooms.get(currentRoom!)?.forEach((participant, id) => {
            if (id !== currentUserId) {
              existingParticipants.push({
                userId: id,
                name: participant.name,
                isAdmin: participant.isAdmin,
                isListener: (participant as any).isListener
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

          // Send the list of existing participants to the new joiner
          ws.send(JSON.stringify({
            type: "participants-list",
            participants: existingParticipants
          }));
          break;

        case "toggle-hand":
        case "remote-mute":
        case "mute-all":
        case "lower-all-hands":
        case "speaker-approved":
        case "poll-created":
        case "poll-voted":
        case "question-asked":
        case "question-upvoted":
        case "end-meeting":
        case "remove-participant":
          // Broadcast to everyone in the room
          if (currentRoom) {
            rooms.get(currentRoom)?.forEach((participant) => {
              if (participant.ws.readyState === WebSocket.OPEN) {
                participant.ws.send(JSON.stringify(message));
              }
            });
          }
          break;

        case "ping":
          // Ignore heartbeat pings
          break;

        case "chat":
          // Broadcast chat messages
          rooms.get(currentRoom!)?.forEach((participant) => {
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
        // Notify others
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

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // LiveKit Token Generation Endpoint
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

      // Generate the token
      const at = new AccessToken(apiKey, apiSecret, {
        identity: identity || participantName,
        name: participantName,
      });

      // Teachers can publish (send video/audio), Students can only subscribe (watch/listen)
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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files under the /app/ route 
    // This matches your vite.config.ts base: '/app/' setting
    app.use("/app", express.static("dist"));
    
    // Redirect root to /app
    app.get("/", (req, res) => {
      res.redirect("/app");
    });

    // SPA catch-all route for production
    app.get("/app/*", (req, res) => {
      res.sendFile(path.resolve(process.cwd(), "dist", "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
