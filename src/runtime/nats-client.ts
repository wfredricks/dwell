/**
 * NatsClient — real implementation of the NatsClient interface using nats.js
 *
 * @adopt:dwell-nats-url  [resolved: nats://nats:4222]
 */

import { connect, StringCodec, NatsConnection } from 'nats';
import type { NatsClient } from '../types.js';

const NATS_URL = process.env['NATS_URL'] ?? 'nats://nats:4222'; // @adopt:dwell-nats-url [resolved: nats://nats:4222]

const sc = StringCodec();

export class RealNatsClient implements NatsClient {
  private nc: NatsConnection | null = null;

  async connect(): Promise<void> {
    this.nc = await connect({ servers: NATS_URL });
    console.log(`[NatsClient] Connected to ${NATS_URL}`);
  }

  publish(subject: string, data: unknown): void {
    if (!this.nc) throw new Error('[NatsClient] Not connected');
    this.nc.publish(subject, sc.encode(JSON.stringify(data)));
  }

  subscribe(subject: string, handler: (data: unknown) => void): () => void {
    if (!this.nc) throw new Error('[NatsClient] Not connected');
    const sub = this.nc.subscribe(subject, {
      callback: (err, msg) => {
        if (err) {
          console.error('[NatsClient] subscription error', err);
          return;
        }
        try {
          handler(JSON.parse(sc.decode(msg.data)));
        } catch (e) {
          console.error('[NatsClient] message parse error', e);
        }
      },
    });
    return () => sub.unsubscribe();
  }

  async drain(): Promise<void> {
    if (this.nc) await this.nc.drain();
  }
}
