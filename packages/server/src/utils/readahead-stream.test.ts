import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createReadaheadStream } from "./readahead-stream.js";

function collect(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

describe("createReadaheadStream", () => {
  let tmpDir: string;
  let filePath: string;
  let data: Buffer;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "readahead-"));
    filePath = path.join(tmpDir, "video.bin");
    // 5 MiB of deterministic non-repeating bytes.
    data = Buffer.alloc(5 * 1024 * 1024);
    for (let i = 0; i < data.length; i++) data[i] = (i * 131 + 7) & 0xff;
    fs.writeFileSync(filePath, data);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reads the whole file byte-for-byte (no range)", async () => {
    const out = await collect(
      createReadaheadStream(filePath, { chunkBytes: 64 * 1024 }),
    );
    expect(out.length).toBe(data.length);
    expect(out.equals(data)).toBe(true);
  });

  it("serves an inclusive byte range exactly like fs.createReadStream", async () => {
    const start = 1_000_000;
    const end = 2_500_000; // inclusive
    const [mine, reference] = await Promise.all([
      collect(createReadaheadStream(filePath, { start, end, chunkBytes: 128 * 1024 })),
      collect(fs.createReadStream(filePath, { start, end })),
    ]);
    expect(mine.length).toBe(end - start + 1);
    expect(mine.equals(reference)).toBe(true);
  });

  it("matches fs.createReadStream for a start-only range (to EOF)", async () => {
    const start = 4_000_000;
    const [mine, reference] = await Promise.all([
      collect(createReadaheadStream(filePath, { start, chunkBytes: 256 * 1024 })),
      collect(fs.createReadStream(filePath, { start })),
    ]);
    expect(mine.length).toBe(data.length - start);
    expect(mine.equals(reference)).toBe(true);
  });

  it("handles a single-byte range", async () => {
    const out = await collect(
      createReadaheadStream(filePath, { start: 42, end: 42 }),
    );
    expect(out.length).toBe(1);
    expect(out[0]).toBe(data[42]);
  });

  it("stops at EOF when end exceeds the real file size", async () => {
    const out = await collect(
      createReadaheadStream(filePath, { start: 0, end: data.length + 10_000 }),
    );
    // Never serves past the real end of file.
    expect(out.length).toBe(data.length);
    expect(out.equals(data)).toBe(true);
  });

  it("respects the readahead ceiling (bounded memory) yet returns all bytes", async () => {
    const stream = createReadaheadStream(filePath, {
      chunkBytes: 64 * 1024,
      readaheadBytes: 256 * 1024, // tiny ceiling relative to 5 MiB file
    });
    // Slow consumer: pull one chunk, pause, repeat — exercises back-pressure.
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (c: Buffer) => {
        chunks.push(c);
        stream.pause();
        setTimeout(() => stream.resume(), 1);
      });
      stream.on("end", resolve);
      stream.on("error", reject);
    });
    const out = Buffer.concat(chunks);
    expect(out.length).toBe(data.length);
    expect(out.equals(data)).toBe(true);
  });

  it("emits an error when the file does not exist", async () => {
    const stream = createReadaheadStream(path.join(tmpDir, "missing.bin"));
    await expect(collect(stream)).rejects.toBeTruthy();
  });

  it("closes the file descriptor on destroy (client abort)", async () => {
    const stream = createReadaheadStream(filePath, { chunkBytes: 64 * 1024 });
    // Start reading, then abort partway like a client disconnect.
    await new Promise<void>((resolve) => {
      stream.once("data", () => resolve());
    });
    const closed = new Promise<void>((resolve) => stream.once("close", () => resolve()));
    stream.destroy();
    await closed;
    expect(stream.destroyed).toBe(true);
  });

  it("produces correct output across many randomized ranges", async () => {
    for (let i = 0; i < 20; i++) {
      const start = Math.floor(Math.random() * data.length);
      const end = Math.min(
        data.length - 1,
        start + Math.floor(Math.random() * 500_000),
      );
      const out = await collect(
        createReadaheadStream(filePath, {
          start,
          end,
          chunkBytes: 1 + Math.floor(Math.random() * 200_000),
          readaheadBytes: 1 + Math.floor(Math.random() * 1_000_000),
        }),
      );
      expect(out.equals(data.subarray(start, end + 1))).toBe(true);
    }
  });
});
