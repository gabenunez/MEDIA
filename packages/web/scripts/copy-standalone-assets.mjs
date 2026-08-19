import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(root, "..");
const standaloneRoot = path.join(webRoot, ".next/standalone/packages/web");

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

copyDir(path.join(webRoot, ".next/static"), path.join(standaloneRoot, ".next/static"));
copyDir(path.join(webRoot, "public"), path.join(standaloneRoot, "public"));
copyPrerenderArtifacts(
  path.join(webRoot, ".next/server/app"),
  path.join(standaloneRoot, ".next/server/app"),
);

console.log("Copied Next static assets and prerender HTML into standalone bundle");

/**
 * Standalone HTML can lag the final `.next/static` chunk hashes. Copying
 * prerender artifacts after static files keeps the served document in sync
 * so `_next/static/chunks/*` do not 500.
 */
function copyPrerenderArtifacts(from, to) {
  if (!fs.existsSync(from)) return;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyPrerenderArtifacts(src, dest);
      continue;
    }
    if (!/\.(html|rsc|meta)$/.test(entry.name)) continue;
    fs.mkdirSync(to, { recursive: true });
    fs.copyFileSync(src, dest);
  }
}
