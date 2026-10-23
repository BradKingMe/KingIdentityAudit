const GRAPH_ROOT = "https://graph.microsoft.com/v1.0/";
const GRAPH_ORIGIN = "https://graph.microsoft.com";

export class GraphReadError extends Error {
  constructor(status, code = "unknown") {
    super(`Microsoft Graph returned HTTP ${status} (${code}). Check the requested permission, signed-in role, tenant licensing, and collection scope.`);
    this.name = "GraphReadError";
    this.status = status;
    this.code = code;
  }
}

function assertGraphUrl(value) {
  const url = new URL(value, GRAPH_ROOT);
  if (url.origin !== GRAPH_ORIGIN || !url.pathname.startsWith("/v1.0/") || url.username || url.password || url.hash) {
    throw new Error("The Microsoft Graph paging link did not point to the v1.0 Graph endpoint.");
  }
  return url;
}

export async function fetchGraphCollection(accessToken, path, {
  fetchImpl = fetch,
  maxItems = 10_000,
  maxPages = 20,
  signal,
} = {}) {
  if (!accessToken || typeof accessToken !== "string") throw new Error("A Microsoft Graph access token is required.");
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 20_000 || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new Error("Graph collection limits must be positive bounded integers.");
  let next = assertGraphUrl(path);
  let pages = 0;
  let truncated = false;
  const records = [];
  const visited = new Set();

  while (next && pages < maxPages && records.length < maxItems) {
    if (visited.has(next.href)) throw new Error("Microsoft Graph repeated a paging link; collection was stopped.");
    visited.add(next.href);
    const response = await fetchImpl(next.href, {
      method: "GET",
      redirect: "error",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new GraphReadError(response.status, payload?.error?.code);
    if (!Array.isArray(payload?.value)) throw new Error("Microsoft Graph returned an unexpected collection response.");
    if (payload.value.some((row) => !row || typeof row !== "object" || Array.isArray(row))) throw new Error("Microsoft Graph returned an invalid collection record.");

    const remaining = Math.max(0, maxItems - records.length);
    records.push(...payload.value.slice(0, remaining));
    pages += 1;
    const nextLink = payload["@odata.nextLink"];
    if (payload.value.length > remaining || (nextLink && (records.length >= maxItems || pages >= maxPages))) {
      truncated = true;
      next = null;
    } else if (nextLink) {
      next = assertGraphUrl(nextLink);
    } else {
      next = null;
    }
  }

  return { records, pages, truncated };
}

export function graphQueryPath(resource, parameters = {}) {
  const params = new URLSearchParams(parameters);
  return `${resource}?${params.toString()}`;
}
