import { EventEmitter } from "node:events";
import { createClient } from "redis";
import { env } from "../env.js";

/**
 * A tiny in-process pub/sub for live queue updates.
 *
 * The farmer's screen and the mandi board are server→client only, so a full
 * WebSocket buys nothing; Server-Sent Events over one emitter is enough and
 * survives flaky rural networks better (it reconnects itself). For more than one
 * API instance this emitter is swapped for Redis pub/sub — the publish/subscribe
 * shape stays identical, which is why the rest of the code only ever sees this
 * interface.
 */

export type QueueEvent = { type: "queue-updated"; centreId: string; date: string };

class Bus {
  private emitter = new EventEmitter();
  private redis: Awaited<ReturnType<typeof createClient>> | null = null;
  private redisSub: Awaited<ReturnType<typeof createClient>> | null = null;

  constructor() {
    this.emitter.setMaxListeners(1000);
    this.initRedis();
  }

  private async initRedis() {
    if (!env.REDIS_URL) return; // Fall back to in-memory
    try {
      this.redis = createClient({ url: env.REDIS_URL });
      this.redisSub = this.redis.duplicate();
      await this.redisSub.connect();
    } catch (e: any) {
      console.warn("[bus] Redis connection failed, falling back to in-memory", e);
      this.redis = null;
      this.redisSub = null;
    }
  }

  private key(centreId: string, date: string) {
    return `q:${centreId}:${date}`;
  }

  publish(centreId: string, date: string) {
    const key = this.key(centreId, date);
    const event = { type: "queue-updated", centreId, date } as QueueEvent;
    // Local emit for this instance
    this.emitter.emit(key, event);
    // Redis publish for other instances
    if (this.redis) {
      this.redis.publish(key, JSON.stringify(event)).catch(e => console.warn("[bus] Redis publish failed", e));
    }
  }

  subscribe(centreId: string, date: string, handler: (e: QueueEvent) => void): () => void {
    const key = this.key(centreId, date);
    this.emitter.on(key, handler);

    // Redis subscribe for cross-instance messages
    if (this.redisSub) {
      const onMessage = (msg: string) => {
        try {
          const event = JSON.parse(msg) as QueueEvent;
          handler(event);
        } catch { /* ignore parse errors */ }
      };
      this.redisSub.subscribe(key, onMessage).catch((e: any) => console.warn("[bus] Redis subscribe failed", e));

      return () => {
        this.emitter.off(key, handler);
        this.redisSub?.unsubscribe(key, onMessage).catch(() => {});
      };
    }

    return () => this.emitter.off(key, handler);
  }
}

export const bus = new Bus();
