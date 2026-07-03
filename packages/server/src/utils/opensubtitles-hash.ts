import fs from "node:fs";

/** OpenSubtitles movie hash from first/last 64 KiB + file size. */
export function computeOpenSubtitlesHash(filePath: string): {
  hash: string;
  size: number;
} {
  const size = fs.statSync(filePath).size;
  const chunkSize = 65536;
  const buffer = Buffer.alloc(chunkSize);

  const fd = fs.openSync(filePath, "r");
  try {
    fs.readSync(fd, buffer, 0, Math.min(chunkSize, size), 0);

    let hash = BigInt(size);
    for (let i = 0; i < chunkSize; i++) {
      hash += BigInt(buffer[i] ?? 0);
    }

    if (size > chunkSize) {
      const tail = Buffer.alloc(chunkSize);
      fs.readSync(fd, tail, 0, chunkSize, Math.max(0, size - chunkSize));
      for (let i = 0; i < chunkSize; i++) {
        hash += BigInt(tail[i] ?? 0);
      }
    }

    hash &= 0xffffffffffffffffn;
    return { hash: hash.toString(16).padStart(16, "0"), size };
  } finally {
    fs.closeSync(fd);
  }
}
