import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDir, "..");

function normalizeGatewayPrefix(value) {
  if (!value || value === "/") return "";
  const trimmed = String(value).replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

const gatewayPrefix = normalizeGatewayPrefix(
  process.env.MEDIA_GATEWAY_PREFIX ?? process.env.NEXT_PUBLIC_GATEWAY_PREFIX,
);

if (!gatewayPrefix) {
  process.exit(0);
}

function gatewayAssetUrl(assetPath) {
  const params = new URLSearchParams();
  params.set("__p", assetPath);
  return `${gatewayPrefix}?${params.toString()}`;
}

function rewriteHtml(html) {
  return html.replace(
    /(href|src)="(\/_next\/[^"]+)"/g,
    (_match, attr, assetPath) => `${attr}="${gatewayAssetUrl(assetPath)}"`,
  );
}

function walkHtmlFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkHtmlFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(fullPath);
    }
  }
  return files;
}

let rewritten = 0;
for (const root of [
  path.join(webRoot, ".next/server"),
  path.join(webRoot, ".next/standalone/packages/web/.next/server"),
]) {
  for (const file of walkHtmlFiles(root)) {
    const original = fs.readFileSync(file, "utf8");
    const next = rewriteHtml(original);
    if (next !== original) {
      fs.writeFileSync(file, next);
      rewritten += 1;
    }
  }
}

console.log(`[gateway] Rewrote asset URLs in ${rewritten} HTML file(s)`);
