import ts from "typescript";
import { readFile, stat } from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";

export const METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
]);
export function routeFor(path) {
  const mapped =
    path.startsWith("/v1/") || path === "/v1" ? `/api${path}` : path;
  if (!mapped.startsWith("/") || mapped.includes(".."))
    throw new Error("INVALID_API_PATH");
  return `src/app${mapped.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, "[$1]")}/route.ts`;
}

// Parse export syntax without executing a route or loading its server-only imports.
export async function exportsMethod(file, method, root, seen = new Set()) {
  const absolute = resolve(file);
  if (seen.has(absolute) || relative(root, absolute).startsWith(".."))
    return false;
  seen.add(absolute);
  let text;
  try {
    text = await readFile(absolute, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  const source = ts.createSourceFile(
    absolute,
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  for (const statement of source.statements) {
    const exported = statement.modifiers?.some(
      (m) => m.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (
      exported &&
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === method &&
      statement.body
    )
      return true;
    if (
      exported &&
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        (d) => d.name.getText(source) === method && d.initializer,
      )
    )
      return true;
    if (!ts.isExportDeclaration(statement)) continue;
    const names = statement.exportClause;
    const binding =
      names && ts.isNamedExports(names)
        ? names.elements.find((e) => e.name.text === method)
        : null;
    if (!binding && names) continue;
    if (!statement.moduleSpecifier) {
      if (binding) {
        const localName = (binding.propertyName ?? binding.name).text;
        if (
          source.statements.some(
            (s) =>
              (ts.isFunctionDeclaration(s) &&
                s.name?.text === localName &&
                s.body) ||
              (ts.isVariableStatement(s) &&
                s.declarationList.declarations.some(
                  (d) => d.name.getText(source) === localName && d.initializer,
                )),
          )
        )
          return true;
      }
      continue;
    }
    const moduleName = statement.moduleSpecifier.text;
    if (!moduleName.startsWith(".")) continue; // No arbitrary package execution or guessed external method.
    const target = resolve(dirname(absolute), moduleName);
    for (const candidate of [
      target,
      `${target}.ts`,
      `${target}.mjs`,
      `${target}.js`,
      resolve(target, "index.ts"),
    ]) {
      if (
        await stat(candidate)
          .then((s) => s.isFile())
          .catch(() => false)
      ) {
        if (
          await exportsMethod(
            candidate,
            binding ? (binding.propertyName ?? binding.name).text : method,
            root,
            new Set(seen),
          )
        )
          return true;
      }
    }
  }
  return false;
}

export async function checkApiCoverage({ api, manifest, root }) {
  const errors = [];
  const operations = new Map();
  const ids = new Map();
  for (const [path, value] of Object.entries(api.paths))
    for (const [method, operation] of Object.entries(value)) {
      if (!METHODS.has(method)) continue;
      const key = `${method.toUpperCase()} ${path}`;
      if (!operation.operationId || ids.has(operation.operationId))
        errors.push(`Duplicate or absent operationId: ${key}`);
      operations.set(key, { ...operation, path, method: method.toUpperCase() });
      ids.set(operation.operationId, key);
    }
  const rows = new Map();
  for (const row of manifest.operations ?? []) {
    const key = `${row.method} ${row.path}`;
    if (rows.has(key) || !operations.has(key))
      errors.push(`Duplicate or unknown disposition: ${key}`);
    if (operations.get(key)?.operationId !== row.operationId)
      errors.push(`operationId mismatch: ${key}`);
    rows.set(key, row);
  }
  const counts = { implemented: 0, replacement: 0, pending: 0, deprecated: 0 };
  for (const [key, op] of operations) {
    const row = rows.get(key);
    if (!row) {
      errors.push(`Unclassified operation: ${key}`);
      continue;
    }
    if (
      !Object.hasOwn(counts, row.state) ||
      !row.reason?.trim() ||
      !row.ownerIssue?.match(
        /^https:\/\/github\.com\/moldovancsaba\/habi\/issues\/\d+$/,
      )
    ) {
      errors.push(`Invalid disposition metadata: ${key}`);
      continue;
    }
    counts[row.state]++;
    const available = await exportsMethod(
      resolve(root, routeFor(op.path)),
      op.method,
      root,
    );
    if (row.state === "implemented" && !available)
      errors.push(`Missing implemented handler: ${key}`);
    if (row.state === "pending" && available)
      errors.push(
        `Pending operation now has a handler; reconcile disposition: ${key}`,
      );
    if (row.state === "replacement") {
      const visited = new Set([key]);
      let current = row;
      while (current?.state === "replacement") {
        const target = current.replacement;
        if (!target || visited.has(target)) {
          errors.push(`Invalid replacement or cycle: ${key}`);
          current = null;
          break;
        }
        visited.add(target);
        current = rows.get(target);
      }
      // Replacements must terminate in a real, advertised implemented operation.
      if (
        current?.state !== "implemented" ||
        !(await exportsMethod(
          resolve(root, routeFor(current.path)),
          current.method,
          root,
        ))
      )
        errors.push(`Missing implemented replacement: ${key}`);
    }
  }
  if (manifest.apiVersion !== api.info.version)
    errors.push("Disposition API version mismatch");
  return {
    apiVersion: api.info.version,
    documentedOperations: operations.size,
    counts,
    fullyImplemented: counts.pending === 0 && errors.length === 0,
    errors,
  };
}
