const retryKeys = new Map<string, string>();
export async function productRequest(
  path: string,
  csrfToken: string,
  body?: unknown,
  method = "POST",
  key?: string,
) {
  const fingerprint = `${method}:${path}:${csrfToken}:${JSON.stringify(body)}`;
  const commandKey = key ?? retryKeys.get(fingerprint) ?? crypto.randomUUID();
  const expectedRevision =
    body && typeof body === "object" && "expectedRevision" in body
      ? body.expectedRevision
      : null;
  if (method !== "GET" && !key) {
    if (retryKeys.size >= 128)
      retryKeys.delete(retryKeys.keys().next().value ?? "");
    retryKeys.set(fingerprint, commandKey);
  }
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(method === "GET"
        ? {}
        : { "x-habi-csrf": csrfToken, "Idempotency-Key": commandKey }),
      ...(method !== "GET" &&
      typeof expectedRevision === "number" &&
      expectedRevision > 0
        ? { "If-Match": String(expectedRevision) }
        : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result =
    response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.code ?? "REQUEST_FAILED");
  retryKeys.delete(fingerprint);
  return result;
}

export function commandMessage(error: unknown) {
  return error instanceof Error && error.message === "REVISION_CONFLICT"
    ? "Ez az adat közben megváltozott. Töltsd újra a nézetet, majd ellenőrizd a legutóbbi változatot."
    : "A művelet most nem sikerült. A beírt szöveg megmaradt; próbáld újra.";
}
