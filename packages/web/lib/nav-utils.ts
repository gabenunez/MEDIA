/** Match nav href against pathname (static export uses trailing slashes). */
export function isNavActive(pathname: string, href: string): boolean {
  const normalize = (value: string) => value.replace(/\/$/, "") || "/";
  const current = normalize(pathname);
  const target = normalize(href);

  if (target === "/") {
    return current === "/";
  }

  return current === target || current.startsWith(`${target}/`);
}
