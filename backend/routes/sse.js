import express from "express";

const router = express.Router();
const clients = new Set();

router.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  clients.add(res);

  // initial hello (optional but useful)
  res.write("event: connected\ndata: {}\n\n");

  req.on("close", () => {
    clients.delete(res);
  });
});

// keep-alive
setInterval(() => {
  for (const client of clients) {
    client.write(": ping\n\n");
  }
}, 25000);

export function broadcast(event, payload) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    client.write(msg);
  }
}

export default router;
