// backend/routes/sse.js
import express from "express";
import { readGames } from "./games.js";

const router = express.Router();
let clients = [];

// SSE endpoint
router.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  clients.push(res);

  req.on("close", () => {
    clients = clients.filter(c => c !== res);
  });
});

export function sendSSE(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(c => c.write(payload));
}

// optional ping every 25s
setInterval(() => {
  clients.forEach(c => c.write(": ping\n\n"));
}, 25000);

export default router;
export { readGames };
