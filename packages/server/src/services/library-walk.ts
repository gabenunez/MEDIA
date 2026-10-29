import fs from "node:fs";
import path from "node:path";

/**
 * Walk a library tree without following a directory twice.
 * Seedbox series folders are often symlinked, and a link back to a parent
 * used to recurse until the process crashed.
 */
export function walkMediaTree(
  root: string,
  visitFile: (fullPath: string, entryName: string) => void,
  shouldSkipEntry: (name: string, isDirectory: boolean) => boolean,
): void {
  const seen = new Set<string>();
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    let realDir: string;
    try {
      realDir = fs.realpathSync(current);
    } catch {
      continue;
    }
    if (seen.has(realDir)) continue;
    seen.add(realDir);

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (shouldSkipEntry(entry.name, entry.isDirectory())) continue;

      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (entry.isSymbolicLink()) {
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            stack.push(fullPath);
            continue;
          }
          if (!stat.isFile()) continue;
        } catch {
          continue;
        }
      } else if (!entry.isFile()) {
        continue;
      }

      visitFile(fullPath, entry.name);
    }
  }
}
