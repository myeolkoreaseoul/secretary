/**
 * API client helper that automatically includes the x-api-key header.
 * Use apiFetch as a drop-in replacement for fetch() when calling /api/ routes.
 */
export function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const apiKey = process.env.NEXT_PUBLIC_API_KEY || "";
  const headers = new Headers(init?.headers);
  if (apiKey) {
    headers.set("x-api-key", apiKey);
  }
  return fetch(input, { ...init, headers });
}
