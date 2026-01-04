// backend/routes/events.js
import express from "express";

const router = express.Router();
const clients = new Set();

router.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  clients.add(res);

  req.on("close", () => {
    clients.delete(res);
  });
});

export function broadcast(event, payload) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    client.write(msg);
  }
}

export default router;
