import { env } from "../env.js";
import { StubChannel } from "./stub.js";
import { Msg91Channel } from "./msg91.js";
import type { Channel } from "./types.js";

let instance: Channel | null = null;

/**
 * `CHANNEL_DRIVER` is the single switch between a demo that costs nothing and a
 * live deployment. Nothing outside this file knows which driver is loaded.
 */
export function channel(): Channel {
  if (instance) return instance;
  switch (env.CHANNEL_DRIVER) {
    case "msg91":
      instance = new Msg91Channel();
      break;
    default:
      instance = new StubChannel();
  }
  return instance;
}

export type { Channel, SendRequest, SendResult } from "./types.js";
