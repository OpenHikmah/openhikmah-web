import { describe, it, expect, vi, beforeEach } from "vitest";

// Controllable fake ioredis. `behavior.*` are reconfigured per test; `ctor`
// records construction so we can assert the client is NOT built when disabled.
const behavior = vi.hoisted(() => ({
  ctor: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  ping: vi.fn(),
  multiExec: vi.fn(),
  subscribe: vi.fn((..._args: unknown[]) => Promise.resolve()),
}));

vi.mock("ioredis", () => {
  // Minimal inline emitter (avoids importing "node:events" inside a hoisted
  // vi.mock factory) — just enough for redisSubscribe's on()/emit()/listenerCount().
  class MockRedis {
    private listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    constructor(...args: unknown[]) {
      behavior.ctor(...args);
    }
    on(event: string, handler: (...args: unknown[]) => void) {
      let set = this.listeners.get(event);
      if (!set) {
        set = new Set();
        this.listeners.set(event, set);
      }
      set.add(handler);
      return this;
    }
    emit(event: string, ...args: unknown[]) {
      this.listeners.get(event)?.forEach((handler) => handler(...args));
    }
    listenerCount(event: string) {
      return this.listeners.get(event)?.size ?? 0;
    }
    get(...a: unknown[]) {
      return behavior.get(...a);
    }
    set(...a: unknown[]) {
      return behavior.set(...a);
    }
    del(...a: unknown[]) {
      return behavior.del(...a);
    }
    ping(...a: unknown[]) {
      return behavior.ping(...a);
    }
    multi() {
      const chain = {
        incr: () => chain,
        expire: () => chain,
        exec: () => behavior.multiExec(),
      };
      return chain;
    }
    subscribe(...a: unknown[]) {
      return behavior.subscribe(...a);
    }
    duplicate() {
      return new MockRedis();
    }
  }
  return { default: MockRedis };
});

// lib/redis caches the client on module scope AND on globalThis, so reset both
// between tests to get a clean disabled/enabled decision each time.
beforeEach(() => {
  vi.resetModules();
  delete (globalThis as { __redis?: unknown }).__redis;
  delete (globalThis as { __redisSub?: unknown }).__redisSub;
  delete (globalThis as { __redisSubHandlers?: unknown }).__redisSubHandlers;
  delete process.env.REDIS_URL;
  behavior.ctor.mockReset();
  behavior.get.mockReset();
  behavior.set.mockReset();
  behavior.del.mockReset();
  behavior.ping.mockReset();
  behavior.multiExec.mockReset();
  behavior.subscribe.mockReset().mockReturnValue(Promise.resolve());
});

describe("lib/redis — disabled (no REDIS_URL)", () => {
  it("reports disabled and every helper is a no-op without constructing a client", async () => {
    const r = await import("@/lib/infra/redis");
    expect(r.redisEnabled()).toBe(false);
    expect(await r.redisGet("k")).toBeNull();
    await expect(r.redisSet("k", "v", 60)).resolves.toBeUndefined();
    await expect(r.redisDel("k")).resolves.toBeUndefined();
    expect(await r.redisIncrWithTtl("k", 60)).toBeNull();
    expect(behavior.ctor).not.toHaveBeenCalled();
  });
});

describe("lib/redis — enabled, healthy", () => {
  beforeEach(() => {
    process.env.REDIS_URL = "redis://localhost:6379";
  });

  it("redisGet returns the value and redisIncrWithTtl returns the INCR count", async () => {
    behavior.get.mockResolvedValue("hello");
    behavior.multiExec.mockResolvedValue([
      [null, 4],
      [null, 1],
    ]);
    const r = await import("@/lib/infra/redis");

    expect(r.redisEnabled()).toBe(true);
    expect(await r.redisGet("k")).toBe("hello");
    expect(await r.redisIncrWithTtl("k", 60)).toBe(4);
    expect(behavior.ctor).toHaveBeenCalledTimes(1);
  });
});

describe("lib/redis — enabled, but every call errors (fail-open)", () => {
  beforeEach(() => {
    process.env.REDIS_URL = "redis://localhost:6379";
  });

  it("swallows errors: reads return null, writes resolve, incr returns null", async () => {
    behavior.get.mockRejectedValue(new Error("down"));
    behavior.set.mockRejectedValue(new Error("down"));
    behavior.del.mockRejectedValue(new Error("down"));
    behavior.multiExec.mockRejectedValue(new Error("down"));
    const r = await import("@/lib/infra/redis");

    expect(await r.redisGet("k")).toBeNull();
    await expect(r.redisSet("k", "v", 60)).resolves.toBeUndefined();
    await expect(r.redisDel("k")).resolves.toBeUndefined();
    expect(await r.redisIncrWithTtl("k", 60)).toBeNull();
    // The Redis path was genuinely entered (then swallowed) — not short-circuited:
    expect(behavior.get).toHaveBeenCalledOnce();
    expect(behavior.set).toHaveBeenCalledOnce();
    expect(behavior.del).toHaveBeenCalledOnce();
  });

  it("redisIncrWithTtl returns null when exec() reports an INCR error", async () => {
    behavior.multiExec.mockResolvedValue([[new Error("partial"), undefined]]);
    const r = await import("@/lib/infra/redis");
    expect(await r.redisIncrWithTtl("k", 60)).toBeNull();
  });

  it("redisIncrWithTtl returns null when exec() yields no result", async () => {
    behavior.multiExec.mockResolvedValue(undefined);
    const r = await import("@/lib/infra/redis");
    expect(await r.redisIncrWithTtl("k", 60)).toBeNull();
  });
});

describe("redisSubscribe", () => {
  beforeEach(() => {
    process.env.REDIS_URL = "redis://localhost:6379";
  });

  interface MockSubscriber {
    emit(event: string, ...args: unknown[]): void;
    listenerCount(event: string): number;
  }
  function subscriberClient(): MockSubscriber {
    return (globalThis as { __redisSub?: MockSubscriber }).__redisSub!;
  }

  it("registers only one underlying 'message' listener across repeated calls", async () => {
    const r = await import("@/lib/infra/redis");
    r.redisSubscribe("chan-a", vi.fn());
    r.redisSubscribe("chan-a", vi.fn());
    r.redisSubscribe("chan-b", vi.fn());
    expect(subscriberClient().listenerCount("message")).toBe(1);
  });

  it("re-issues SUBSCRIBE on every call (self-heals a failed earlier attempt) without stacking listeners", async () => {
    const r = await import("@/lib/infra/redis");
    r.redisSubscribe("chan-a", vi.fn());
    r.redisSubscribe("chan-a", vi.fn());
    expect(behavior.subscribe).toHaveBeenCalledTimes(2);
    expect(behavior.subscribe).toHaveBeenCalledWith("chan-a");
    // The listener dedup (not the subscribe call) is what actually prevents
    // the redundant-dispatch bug this fix targets:
    expect(subscriberClient().listenerCount("message")).toBe(1);
  });

  it("dispatches an incoming message to every handler registered for that channel", async () => {
    const r = await import("@/lib/infra/redis");
    const handlerA1 = vi.fn();
    const handlerA2 = vi.fn();
    const handlerB = vi.fn();
    r.redisSubscribe("chan-a", handlerA1);
    r.redisSubscribe("chan-a", handlerA2);
    r.redisSubscribe("chan-b", handlerB);

    subscriberClient().emit("message", "chan-a", "hello");

    expect(handlerA1).toHaveBeenCalledWith("hello");
    expect(handlerA2).toHaveBeenCalledWith("hello");
    expect(handlerB).not.toHaveBeenCalled();
  });
});
