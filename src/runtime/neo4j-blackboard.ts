/**
 * Neo4jBlackboard — Blackboard implementation backed by Neo4j + NATS.
 *
 * write(key, value)  → stores as (:BBEntry {key, value, updatedAt}) in Neo4j,
 *                      then publishes to NATS subject `bb.write.${key}`
 * read(key)          → queries Neo4j for (:BBEntry {key}), returns parsed value or null
 * subscribe(pattern) → subscribes to NATS subject pattern, calls handler on match
 *
 * @adopt:dwell-neo4j-bb-url      [resolved: bolt://neo4j-bb:7687]
 * @adopt:dwell-neo4j-bb-user     [resolved: neo4j]
 * @adopt:dwell-neo4j-bb-password [resolved: dwell-bb]
 */

import neo4j, { Driver, Session } from 'neo4j-driver';
import type { Blackboard } from '../types.js';
import type { RealNatsClient } from './nats-client.js';

const NEO4J_URL      = process.env['NEO4J_URL']      ?? 'bolt://neo4j-bb:7687'; // @adopt:dwell-neo4j-bb-url      [resolved: bolt://neo4j-bb:7687]
const NEO4J_USER     = process.env['NEO4J_USER']     ?? 'neo4j';                // @adopt:dwell-neo4j-bb-user     [resolved: neo4j]
const NEO4J_PASSWORD = process.env['NEO4J_PASSWORD'] ?? 'dwell-bb';             // @adopt:dwell-neo4j-bb-password [resolved: dwell-bb]

export class Neo4jBlackboard implements Blackboard {
  private driver: Driver;

  constructor(private natsClient: RealNatsClient) {
    this.driver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  }

  async verifyConnectivity(): Promise<void> {
    await this.driver.verifyConnectivity();
    // Ensure constraint exists
    const session = this.driver.session();
    try {
      await session.run(
        'CREATE CONSTRAINT bb_entry_key IF NOT EXISTS FOR (e:BBEntry) REQUIRE e.key IS UNIQUE'
      );
    } catch {
      // Constraint may already exist; ignore
    } finally {
      await session.close();
    }
    console.log(`[Neo4jBlackboard] Connected to ${NEO4J_URL}`);
  }

  async write(key: string, value: unknown): Promise<void> {
    const session: Session = this.driver.session();
    try {
      await session.run(
        `MERGE (e:BBEntry {key: $key})
         SET e.value = $value, e.updatedAt = $updatedAt`,
        {
          key,
          value: JSON.stringify(value),
          updatedAt: new Date().toISOString(),
        }
      );
    } finally {
      await session.close();
    }
    // Notify subscribers via NATS
    this.natsClient.publish(`bb.write.${key}`, value);
  }

  async read(key: string): Promise<unknown> {
    const session: Session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (e:BBEntry {key: $key}) RETURN e.value AS value',
        { key }
      );
      if (result.records.length === 0) return null;
      const raw = result.records[0]?.get('value');
      if (raw == null) return null;
      return JSON.parse(raw as string);
    } finally {
      await session.close();
    }
  }

  subscribe(pattern: string, handler: (event: unknown) => void): () => void {
    // bb.write.${key} pattern — forward to NATS subscription
    const natsSubject = `bb.write.${pattern}`;
    return this.natsClient.subscribe(natsSubject, handler);
  }

  async readAll(): Promise<Array<{ key: string; value: unknown; updatedAt: string }>> {
    const session: Session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (e:BBEntry) RETURN e.key AS key, e.value AS value, e.updatedAt AS updatedAt'
      );
      return result.records.map((r) => ({
        key: r.get('key') as string,
        value: (() => { try { return JSON.parse(r.get('value') as string); } catch { return r.get('value'); } })(),
        updatedAt: r.get('updatedAt') as string,
      }));
    } finally {
      await session.close();
    }
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}
