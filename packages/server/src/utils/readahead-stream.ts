import fs from "node:fs";
import { Readable } from "node:stream";

/**
 * A Readable that proactively reads ahead of the consumer into a bounded
 * in-memory buffer, decoupling the client's pace from raw disk latency.
 *
 * Why: progressive/direct playback serves a file from a shared, sometimes
 * heavily-contended disk. A plain fs.createReadStream only reads on demand, so
 * a transient multi-second disk stall drains the player's buffer and causes a
 * visible stutter. By keeping up to `readaheadBytes` queued ahead of what the
 * consumer has pulled, a short disk hiccup is absorbed by this buffer instead
 * of starving the client.
 *
 * Semantics match fs.createReadStream({ start, end }):
 *  - serves bytes [start, end] inclusive (end defaults to EOF),
 *  - pushes null at EOF,
 *  - emits 'error' on any fs failure,
 *  - releases the fd on end/error/destroy (including client abort).
 */
export interface ReadaheadOptions {
  /** First byte offset to read (inclusive). Default 0. */
  start?: number;
  /** Last byte offset to read (inclusive). Default: end of file. */
  end?: number;
  /** Size of each disk read. Default 1 MiB. */
  chunkBytes?: number;
  /** Max bytes buffered ahead of the consumer. Default 16 MiB. */
  readaheadBytes?: number;
}

const DEFAULT_CHUNK_BYTES = 1024 * 1024; // 1 MiB per disk read
const DEFAULT_READAHEAD_BYTES = 16 * 1024 * 1024; // 16 MiB prefetch ceiling

export class ReadaheadFileStream extends Readable {
  private fd: number | null = null;
  private readonly filePath: string;
  private readonly chunkBytes: number;
  private readonly readaheadBytes: number;

  /** Next byte offset to read from disk. */
  private diskPos: number;
  /** Last byte offset to serve (inclusive). */
  private readonly endPos: number;

  /** Bytes queued-but-not-yet-pushed to the consumer. */
  private queued: Buffer[] = [];
  private queuedBytes = 0;

  /** True while a disk read is in flight (single-flight fill loop). */
  private filling = false;
  /** Consumer wants more; keep pushing until push() returns false. */
  private wantData = false;
  /** All bytes up to endPos have been read from disk. */
  private diskDone = false;
  private destroyed_ = false;
  /** Guards drainToConsumer against re-entrant push()->_read() recursion. */
  private draining = false;

  constructor(filePath: string, options: ReadaheadOptions = {}) {
    super();
    this.filePath = filePath;
    const start = Math.max(0, Math.floor(options.start ?? 0));
    this.diskPos = start;
    // end is inclusive; Number.MAX_SAFE_INTEGER means "until EOF".
    this.endPos =
      options.end != null && Number.isFinite(options.end)
        ? Math.floor(options.end)
        : Number.MAX_SAFE_INTEGER;
    this.chunkBytes = Math.max(1, options.chunkBytes ?? DEFAULT_CHUNK_BYTES);
    this.readaheadBytes = Math.max(
      this.chunkBytes,
      options.readaheadBytes ?? DEFAULT_READAHEAD_BYTES,
    );
  }

  private openFd(): void {
    if (this.fd != null) return;
    try {
      this.fd = fs.openSync(this.filePath, "r");
    } catch (err) {
      this.destroy(err instanceof Error ? err : new Error(String(err)));
    }
  }

  override _read(): void {
    this.wantData = true;
    this.openFd();
    if (this.fd == null) return;
    this.drainToConsumer();
    void this.fill();
  }

  /** Push already-queued chunks to the consumer until it signals stop. */
  private drainToConsumer(): void {
    // push() can synchronously re-enter via _read(); let the outermost call
    // own the loop so we never double-shift or recurse unboundedly.
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.wantData && this.queued.length > 0) {
        const chunk = this.queued.shift()!;
        this.queuedBytes -= chunk.length;
        // push() returns false when the consumer's buffer is full; stop until
        // the next _read() call.
        if (!this.push(chunk)) {
          this.wantData = false;
        }
      }

      // Finished: disk exhausted and nothing left queued.
      if (this.diskDone && this.queued.length === 0 && !this.destroyed_) {
        this.push(null);
      }
    } finally {
      this.draining = false;
    }
  }

  /** Read ahead from disk until the readahead ceiling is hit or we reach EOF. */
  private async fill(): Promise<void> {
    if (this.filling || this.diskDone || this.destroyed_ || this.fd == null) {
      return;
    }
    this.filling = true;
    try {
      while (
        !this.destroyed_ &&
        !this.diskDone &&
        this.queuedBytes < this.readaheadBytes &&
        this.diskPos <= this.endPos
      ) {
        const remaining = this.endPos - this.diskPos + 1;
        // remaining can overflow when endPos is MAX_SAFE_INTEGER; cap by chunk.
        const toRead =
          remaining > this.chunkBytes ? this.chunkBytes : Math.max(0, remaining);
        if (toRead <= 0) {
          this.diskDone = true;
          break;
        }

        const buffer = Buffer.allocUnsafe(toRead);
        const { bytesRead } = await this.readAt(buffer, this.diskPos, toRead);

        if (bytesRead <= 0) {
          // EOF reached before endPos (e.g. end defaulted past real size).
          this.diskDone = true;
          break;
        }

        const chunk = bytesRead === toRead ? buffer : buffer.subarray(0, bytesRead);
        this.queued.push(chunk);
        this.queuedBytes += bytesRead;
        this.diskPos += bytesRead;

        if (this.diskPos > this.endPos) {
          this.diskDone = true;
        }

        // Hand buffered bytes to the consumer as they arrive.
        this.drainToConsumer();
      }
    } catch (err) {
      this.destroy(err instanceof Error ? err : new Error(String(err)));
      return;
    } finally {
      this.filling = false;
    }

    // Surface EOF/any newly queued data if the consumer is still waiting.
    if (!this.destroyed_) {
      this.drainToConsumer();
    }
  }

  private readAt(
    buffer: Buffer,
    position: number,
    length: number,
  ): Promise<{ bytesRead: number }> {
    return new Promise((resolve, reject) => {
      fs.read(
        this.fd!,
        buffer,
        0,
        length,
        position,
        (err, bytesRead) => {
          if (err) reject(err);
          else resolve({ bytesRead });
        },
      );
    });
  }

  override _destroy(
    err: Error | null,
    callback: (error?: Error | null) => void,
  ): void {
    this.destroyed_ = true;
    this.queued = [];
    this.queuedBytes = 0;
    const fd = this.fd;
    this.fd = null;
    if (fd != null) {
      fs.close(fd, () => callback(err));
    } else {
      callback(err);
    }
  }
}

/**
 * Drop-in for fs.createReadStream({ start, end }) that reads ahead into a
 * bounded buffer so transient disk stalls don't starve the consumer.
 */
export function createReadaheadStream(
  filePath: string,
  options: ReadaheadOptions = {},
): ReadaheadFileStream {
  return new ReadaheadFileStream(filePath, options);
}
