const FORBIDDEN_DATABASE_NAME_CHARS = /[\\/. "$*<>:|?]/;

export function readAtlasConfig(env) {
  if (
    env.HG_ENVIRONMENT === "test" &&
    env.HG_LOCAL_TEST_MODE === "true" &&
    env.HG_SYNTHETIC_DATA_ONLY === "true" &&
    env.HG_MIGRATION_ALLOW_LOCAL_TEST_DB === "true"
  ) {
    const uri = env.HABI_TEST_MONGODB_URI?.trim();
    const database = env.HABI_TEST_MONGODB_DATABASE?.trim();
    if (!uri || !database?.endsWith("_test")) {
      throw new Error("LOCAL_TEST_DATABASE_REQUIRED");
    }
    const parsed = new URL(uri);
    if (
      !["mongodb:", "mongodb+srv:"].includes(parsed.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
    ) {
      throw new Error("LOCAL_TEST_DATABASE_REQUIRED");
    }
    return Object.freeze({ uri, database });
  }

  const uri = env.HG_ATLAS_URI?.trim();
  const database = env.HG_ATLAS_DATABASE?.trim();

  if (!uri || !database) {
    throw new Error("ATLAS_CONFIG_MISSING");
  }
  if (env.HG_SYNTHETIC_DATA_ONLY === "true") {
    throw new Error("ATLAS_DISABLED_FOR_SYNTHETIC_ENV");
  }
  if (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://")) {
    throw new Error("ATLAS_CONFIG_INVALID");
  }
  if (
    database.length > 63 ||
    database.trim() !== database ||
    FORBIDDEN_DATABASE_NAME_CHARS.test(database) ||
    database.includes(String.fromCharCode(0))
  ) {
    throw new Error("ATLAS_CONFIG_INVALID");
  }

  return Object.freeze({ uri, database });
}
