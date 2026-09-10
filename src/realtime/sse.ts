import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Opens a Server-Sent Events stream on a Fastify reply and returns a `send`
 * function plus automatic keep-alive. The caller pushes snapshots; this handles
 * the wire format, the heartbeat that stops proxies from closing an idle
 * connection, and cleanup when the farmer walks out of range.
 */
export function openSse(request: FastifyRequest, reply: FastifyReply) {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  reply.raw.write("retry: 3000\n\n"); // tell the browser to reconnect after 3s

  const send = (data: unknown, event?: string) => {
    if (reply.raw.writableEnded) return;
    if (event) reply.raw.write(`event: ${event}\n`);
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const heartbeat = setInterval(() => {
    if (!reply.raw.writableEnded) reply.raw.write(": ping\n\n");
  }, 25_000);

  const close = () => {
    clearInterval(heartbeat);
    if (!reply.raw.writableEnded) reply.raw.end();
  };

  request.raw.on("close", close);
  return { send, close };
}
