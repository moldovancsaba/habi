export async function evaluateDatabaseReadiness(check) {
  try {
    await check();
    return Object.freeze({ status: 200, body: { ok: true, service: "habi" } });
  } catch {
    return Object.freeze({
      status: 503,
      body: {
        ok: false,
        service: "habi",
        error: "DEPENDENCY_UNAVAILABLE",
      },
    });
  }
}
