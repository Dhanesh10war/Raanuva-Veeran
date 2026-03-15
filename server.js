"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = require("express");
var vite_1 = require("vite");
var ws_1 = require("ws");
var http_1 = require("http");
var livekit_server_sdk_1 = require("livekit-server-sdk");
var dotenv_1 = require("dotenv");
dotenv_1.default.config();
function startServer() {
    return __awaiter(this, void 0, void 0, function () {
        var app, server, PORT, wss, rooms, vite;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    app = (0, express_1.default)();
                    server = (0, http_1.createServer)(app);
                    PORT = process.env.PORT || 3000;
                    app.use(express_1.default.json());
                    wss = new ws_1.WebSocketServer({ server: server });
                    rooms = new Map();
                    wss.on("connection", function (ws) {
                        var currentRoom = null;
                        var currentUserId = null;
                        ws.on("message", function (data) {
                            var _a, _b, _c, _d;
                            var message = JSON.parse(data.toString());
                            switch (message.type) {
                                case "join":
                                    currentRoom = message.room;
                                    currentUserId = message.userId;
                                    var userName_1 = message.name;
                                    var isAdmin_1 = message.isAdmin;
                                    var isListener_1 = message.isListener;
                                    if (!rooms.has(currentRoom)) {
                                        rooms.set(currentRoom, new Map());
                                    }
                                    (_a = rooms.get(currentRoom)) === null || _a === void 0 ? void 0 : _a.set(currentUserId, { ws: ws, name: userName_1, isAdmin: isAdmin_1, isListener: isListener_1 });
                                    // Notify others in the room and send existing participants to new joiner
                                    var existingParticipants_1 = [];
                                    (_b = rooms.get(currentRoom)) === null || _b === void 0 ? void 0 : _b.forEach(function (participant, id) {
                                        if (id !== currentUserId) {
                                            existingParticipants_1.push({
                                                userId: id,
                                                name: participant.name,
                                                isAdmin: participant.isAdmin,
                                                isListener: participant.isListener
                                            });
                                            if (participant.ws.readyState === ws_1.WebSocket.OPEN) {
                                                participant.ws.send(JSON.stringify({
                                                    type: "user-joined",
                                                    userId: currentUserId,
                                                    name: userName_1,
                                                    isAdmin: isAdmin_1,
                                                    isListener: isListener_1
                                                }));
                                            }
                                        }
                                    });
                                    // Send the list of existing participants to the new joiner
                                    ws.send(JSON.stringify({
                                        type: "participants-list",
                                        participants: existingParticipants_1
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
                                        (_c = rooms.get(currentRoom)) === null || _c === void 0 ? void 0 : _c.forEach(function (participant) {
                                            if (participant.ws.readyState === ws_1.WebSocket.OPEN) {
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
                                    (_d = rooms.get(currentRoom)) === null || _d === void 0 ? void 0 : _d.forEach(function (participant) {
                                        if (participant.ws.readyState === ws_1.WebSocket.OPEN) {
                                            participant.ws.send(JSON.stringify(message));
                                        }
                                    });
                                    break;
                            }
                        });
                        ws.on("close", function () {
                            var _a, _b, _c;
                            if (currentRoom && currentUserId && rooms.has(currentRoom)) {
                                (_a = rooms.get(currentRoom)) === null || _a === void 0 ? void 0 : _a.delete(currentUserId);
                                // Notify others
                                (_b = rooms.get(currentRoom)) === null || _b === void 0 ? void 0 : _b.forEach(function (participant) {
                                    if (participant.ws.readyState === ws_1.WebSocket.OPEN) {
                                        participant.ws.send(JSON.stringify({
                                            type: "user-left",
                                            userId: currentUserId
                                        }));
                                    }
                                });
                                if (((_c = rooms.get(currentRoom)) === null || _c === void 0 ? void 0 : _c.size) === 0) {
                                    rooms.delete(currentRoom);
                                }
                            }
                        });
                    });
                    // API routes
                    app.get("/api/health", function (req, res) {
                        res.json({ status: "ok" });
                    });
                    // LiveKit Token Generation Endpoint
                    app.post("/api/livekit-token", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                        var _a, roomName, participantName, isAdmin, apiKey, apiSecret, at, token, error_1;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    _b.trys.push([0, 2, , 3]);
                                    _a = req.body, roomName = _a.roomName, participantName = _a.participantName, isAdmin = _a.isAdmin;
                                    if (!roomName || !participantName) {
                                        return [2 /*return*/, res.status(400).json({ error: "Missing roomName or participantName" })];
                                    }
                                    apiKey = process.env.LIVEKIT_API_KEY;
                                    apiSecret = process.env.LIVEKIT_API_SECRET;
                                    if (!apiKey || !apiSecret) {
                                        return [2 /*return*/, res.status(500).json({ error: "LiveKit credentials not configured on server" })];
                                    }
                                    at = new livekit_server_sdk_1.AccessToken(apiKey, apiSecret, {
                                        identity: participantName,
                                        name: participantName,
                                    });
                                    // Teachers can publish (send video/audio), Students can only subscribe (watch/listen)
                                    at.addGrant({
                                        roomJoin: true,
                                        room: roomName,
                                        canPublish: isAdmin,
                                        canSubscribe: true
                                    });
                                    return [4 /*yield*/, at.toJwt()];
                                case 1:
                                    token = _b.sent();
                                    res.json({ token: token, url: process.env.LIVEKIT_URL });
                                    return [3 /*break*/, 3];
                                case 2:
                                    error_1 = _b.sent();
                                    console.error("Error generating token:", error_1);
                                    res.status(500).json({ error: "Failed to generate LiveKit token" });
                                    return [3 /*break*/, 3];
                                case 3: return [2 /*return*/];
                            }
                        });
                    }); });
                    if (!(process.env.NODE_ENV !== "production")) return [3 /*break*/, 2];
                    return [4 /*yield*/, (0, vite_1.createServer)({
                            server: { middlewareMode: true },
                            appType: "spa",
                        })];
                case 1:
                    vite = _a.sent();
                    app.use(vite.middlewares);
                    return [3 /*break*/, 3];
                case 2:
                    app.use(express_1.default.static("dist"));
                    _a.label = 3;
                case 3:
                    server.listen(PORT, "0.0.0.0", function () {
                        console.log("Server running on http://localhost:".concat(PORT));
                    });
                    return [2 /*return*/];
            }
        });
    });
}
startServer();
