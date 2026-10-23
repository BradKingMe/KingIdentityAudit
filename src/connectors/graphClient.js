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
  if (url.origin !== GRAPH_ORIGIN || !url.pathname.startsWith("/v1.0/")) {
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
  let next = assertGraphUrl(path);
  let pages = 0;
  let truncated = false;
  const records = [];

  while (next && pages < maxPages && records.length < maxItems) {
    const response = await fetchImpl(next.href, {
      method: "GET",
      redirect: "error",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new GraphReadError(response.status, payload?.error?.code);
    if (!Array.isArray(payload?.value)) throw new Error("Microsoft Graph returned an unexpected collection response.");

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
