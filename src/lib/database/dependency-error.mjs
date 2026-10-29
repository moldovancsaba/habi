/**
 * The failure raised when the database cannot be reached. The public code is
 * attached so the API boundary answers 503 instead of an opaque 500, and the
 * message stays the bare code for callers that compare it.
 */
export function dependencyUnavailableError() {
  return Object.assign(new Error("DEPENDENCY_UNAVAILABLE"), {
    code: "DEPENDENCY_UNAVAILABLE",
  });
}
