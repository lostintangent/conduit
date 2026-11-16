/** The search results page for `query` */
export function searchUrl(query: string): string {
  return `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
}

/** Hosts that serve plain http, which are on this machine or this network */
const isLocalHost = (host: string) =>
  host === "localhost" ||
  /\.(localhost|local|test)$/.test(host) ||
  /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
  host.startsWith("[");

/**
 * Turns what the user typed into an address to load, searching the web for
 * anything that doesn't look like an address.
 */
export function normalizeUrl(input: string): string {
  const text = input.trim();
  if (text.length === 0) return text;
  if (/^(https?|file):\/\//i.test(text)) return text;

  // A word on its own is a search, unless it's a host with a port or a path
  const isWord = !/[.:/]/.test(text) && text.toLowerCase() !== "localhost";
  if (/\s/.test(text) || isWord) return searchUrl(text);

  const host = text.toLowerCase().split("/")[0].replace(/:\d*$/, "");
  return `${isLocalHost(host) ? "http" : "https"}://${text}`;
}

/** The site an address is on, e.g. the one a page's icon goes with */
export function siteOf(url: string | undefined): string | undefined {
  try {
    return url ? new URL(url).origin : undefined;
  } catch {
    return undefined;
  }
}
