import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mountDwell } from '../mount.js';
import type { DwellDeps } from '../types.js';

function makeDeps(): DwellDeps {
  return {
    bb: {
      read: vi.fn().mockResolvedValue(null),
      write: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockReturnValue(() => {}),
    },
    zipper: {
      registerTool: vi.fn(),
      unregisterTool: vi.fn(),
    },
    nats: {
      publish: vi.fn(),
      subscribe: vi.fn().mockReturnValue(() => {}),
    },
    graph: {
      query: vi.fn().mockResolvedValue([]),
    },
  };
}

describe('mountDwell', () => {
  let deps: DwellDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  it('returns a handle with a dispose function', async () => {
    const handle = await mountDwell(deps);
    expect(handle).toBeDefined();
    expect(typeof handle.dispose).toBe('function');
  });

  it('publishes dwell.mounted on mount', async () => {
    await mountDwell(deps);
    expect(deps.nats.publish).toHaveBeenCalledWith(
      'dwell.mounted',
      expect.objectContaining({ version: '1.0.0' })
    );
  });

  it('mounted payload includes a timestamp', async () => {
    await mountDwell(deps);
    const [, payload] = (deps.nats.publish as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(payload.timestamp).toBeTruthy();
    expect(() => new Date(payload.timestamp)).not.toThrow();
  });

  it('publishes dwell.unmounted on dispose', async () => {
    const handle = await mountDwell(deps);
    await handle.dispose();
    expect(deps.nats.publish).toHaveBeenCalledWith(
      'dwell.unmounted',
      expect.objectContaining({ timestamp: expect.any(String) })
    );
  });

  it('dispose is idempotent — safe to call twice', async () => {
    const handle = await mountDwell(deps);
    await handle.dispose();
    await expect(handle.dispose()).resolves.not.toThrow();
  });

  it('can mount and dispose multiple independent instances', async () => {
    const deps2 = makeDeps();
    const h1 = await mountDwell(deps);
    const h2 = await mountDwell(deps2);
    await h1.dispose();
    await h2.dispose();
    expect(deps.nats.publish).toHaveBeenCalledWith('dwell.unmounted', expect.any(Object));
    expect(deps2.nats.publish).toHaveBeenCalledWith('dwell.unmounted', expect.any(Object));
  });
});
