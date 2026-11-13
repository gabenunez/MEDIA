import { describe, expect, it } from "vitest";

/**
 * Mirrors ScannerService.withChainLock. This is the primitive that stops two
 * concurrent episode ingests of the same brand-new show from racing their
 * find-or-create into duplicate rows. Kept in sync with scanner.ts.
 */
function makeChainLock() {
  const chain = new Map<string, Promise<void>>();
  return async function withChainLock<T>(
    key: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const previous = chain.get(key) ?? Promise.resolve();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    chain.set(key, tail);
    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (chain.get(key) === tail) {
        chain.delete(key);
      }
    }
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("withChainLock", () => {
  it("serializes work sharing a key (no overlap)", async () => {
    const lock = makeChainLock();
    let active = 0;
    let maxActive = 0;

    const task = () =>
      lock("House", async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await tick();
        active--;
      });

    await Promise.all([task(), task(), task()]);

    expect(maxActive).toBe(1);
  });

  it("prevents a duplicate create under concurrency for the same key", async () => {
    const lock = makeChainLock();
    const rows: string[] = [];

    // Simulates find-or-create: both callers race, but the lock makes the
    // second see the row the first created.
    const findOrCreate = () =>
      lock("House", async () => {
        const existing = rows.find((r) => r === "House");
        if (existing) return existing;
        await tick(); // metadata lookup / insert latency
        rows.push("House");
        return "House";
      });

    await Promise.all([findOrCreate(), findOrCreate(), findOrCreate()]);

    expect(rows.filter((r) => r === "House")).toHaveLength(1);
  });

  it("lets different keys run concurrently", async () => {
    const lock = makeChainLock();
    let active = 0;
    let maxActive = 0;

    const task = (key: string) =>
      lock(key, async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await tick();
        active--;
      });

    await Promise.all([task("House"), task("Glee"), task("Cops")]);

    expect(maxActive).toBeGreaterThan(1);
  });
});
