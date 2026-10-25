import { validateRuntimeStartup } from "./lib/runtime-config.mjs";

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    validateRuntimeStartup(process.env);
  }
}
