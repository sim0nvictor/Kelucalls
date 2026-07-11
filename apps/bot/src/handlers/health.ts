import type { IncomingMessage, ServerResponse } from "node:http";

export function handleHealth(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "kelucalls-telegram-bot" }));
    return true;
  }

  return false;
}

