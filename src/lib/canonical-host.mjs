const CANONICAL_ORIGIN = "https://habigoal.com";
const CANONICAL_HOST = "habigoal.com";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function canonicalHostRedirect(hostname, pathname, search = "") {
  const host = String(hostname ?? "").toLowerCase();
  if (host === CANONICAL_HOST || LOCAL_HOSTS.has(host)) return null;
  if (
    typeof pathname !== "string" ||
    !pathname.startsWith("/") ||
    pathname.startsWith("//") ||
    pathname.startsWith("/\\")
  ) {
    return null;
  }
  const query =
    typeof search === "string" && search.startsWith("?") ? search : "";
  const target = new URL(CANONICAL_ORIGIN);
  target.pathname = pathname;
  target.search = query;
  return target.toString();
}
