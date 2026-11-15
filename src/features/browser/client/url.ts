/** The search results page for `query` */
export function searchUrl(query: string): string {
  return `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
}

/**
 * Normalizes a URL input by adding protocol and handling search queries.
 * This uses the same logic as the browser toolbar URL submission.
 */
export function normalizeUrl(input: string): string {
  let targetUrl = input.trim();
  if (targetUrl.length === 0) return targetUrl;

  // If it contains spaces, treat as a search query
  if (targetUrl.includes(" ")) {
    targetUrl = searchUrl(targetUrl);
  } else if (!targetUrl.match(/^(https?|file):\/\//i)) {
    // Add protocol if missing
    const lowerTarget = targetUrl.toLowerCase();
    const host = lowerTarget.split("/")[0];

    const isLocalhost = host === "localhost" || host.startsWith("localhost:");

    const protocol = isLocalhost ? "http" : "https";
    targetUrl = `${protocol}://${targetUrl}`;
  }

  return targetUrl;
}
