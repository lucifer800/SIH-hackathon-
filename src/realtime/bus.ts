import { EventEmitter } from "node:events";

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
  constructor() {
    // A busy centre can have many farmers streaming one day at once.
    this.emitter.setMaxListeners(1000);
  }

  private key(centreId: string, date: string) {
    return `q:${centreId}:${date}`;
  }

  publish(centreId: string, date: string) {
    this.emitter.emit(this.key(centreId, date), { type: "queue-updated", centreId, date } as QueueEvent);
  }

  subscribe(centreId: string, date: string, handler: (e: QueueEvent) => void): () => void {
    const key = this.key(centreId, date);
    this.emitter.on(key, handler);
    return () => this.emitter.off(key, handler);
  }
}

export const bus = new Bus();
