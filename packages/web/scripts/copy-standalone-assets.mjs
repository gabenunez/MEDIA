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

console.log("Copied Next static assets into standalone bundle");
