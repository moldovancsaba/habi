const FORBIDDEN_DATABASE_NAME_CHARS = /[\\/. "$*<>:|?]/;

export function readAtlasConfig(env) {
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
