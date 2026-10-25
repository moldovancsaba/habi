import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { createRequire } from "node:module";
import { COLLECTION_SCHEMA } from "./migration-schema.mjs";

const require = createRequire(import.meta.url);
const contract = require("../../../contracts/domain-schemas.source.json");
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(contract);

const compiled = new Map(
  Object.entries(COLLECTION_SCHEMA).map(([collection, definition]) => [
    collection,
    ajv.compile({ $ref: `${contract.$id}#/$defs/${definition}` }),
  ]),
);

function normalizeStoredDates(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeStoredDates);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "_id")
        .map(([key, nested]) => [key, normalizeStoredDates(nested)]),
    );
  }
  return value;
}

export function validateContractDocument(collection, document) {
  const validator = compiled.get(collection);
  if (!validator) throw new Error("COLLECTION_SCHEMA_UNKNOWN");
  const valid = validator(normalizeStoredDates(document));
  if (!valid) {
    const details = (validator.errors ?? [])
      .map(({ instancePath, keyword }) => `${instancePath || "/"}:${keyword}`)
      .join(",");
    throw new Error(`DOCUMENT_CONTRACT_INVALID:${details}`);
  }
  return true;
}

export function mongoValidatorForCollection(collection) {
  const definition = COLLECTION_SCHEMA[collection];
  if (!definition) throw new Error("COLLECTION_SCHEMA_UNKNOWN");
  return {
    $jsonSchema: mongoSchema(contract.$defs[definition], new Set(), collection),
  };
}

function mongoSchema(schema, seenRefs, collection, propertyName = null) {
  if (schema.$ref) {
    const refName = schema.$ref.split("/").at(-1);
    if (seenRefs.has(refName)) return { bsonType: "object" };
    const nextRefs = new Set(seenRefs).add(refName);
    return mongoSchema(
      contract.$defs[refName],
      nextRefs,
      collection,
      propertyName,
    );
  }

  const variants = schema.anyOf ?? schema.oneOf ?? null;
  const active = variants
    ? variants.filter((item) => item.type !== "null")
    : [schema];
  const resolved = active.map((item) => {
    if (!item.$ref) return item;
    const refName = item.$ref.split("/").at(-1);
    return contract.$defs[refName] ?? {};
  });
  const effective =
    resolved.find((item) => item.properties || item.type) ?? schema;
  const typeSet = new Set();
  for (const variant of resolved) {
    const types = Array.isArray(variant.type) ? variant.type : [variant.type];
    for (const type of types) {
      const bsonType = mongoType(type);
      if (bsonType)
        for (const item of Array.isArray(bsonType) ? bsonType : [bsonType])
          typeSet.add(item);
    }
  }
  if (variants?.some((item) => item.type === "null")) typeSet.add("null");
  if (
    (collection === "sessions" || collection === "idempotency") &&
    propertyName === "expiresAt"
  ) {
    typeSet.add("date");
  }

  const output = {};
  if (typeSet.size) output.bsonType = [...typeSet];
  const properties = effective.properties ?? schema.properties;
  if (properties) {
    output.properties = Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [
        key,
        mongoSchema(value, seenRefs, collection, key),
      ]),
    );
    if (Object.hasOwn(output.properties, "_id")) {
      output.properties._id = { bsonType: ["objectId", "string"] };
    } else if (
      schema.additionalProperties === false ||
      effective.additionalProperties === false
    ) {
      output.properties._id = { bsonType: ["objectId", "string"] };
    }
  }
  if (effective.required) output.required = effective.required;
  if (effective.additionalProperties === false)
    output.additionalProperties = false;
  if (schema.enum) output.enum = schema.enum;
  if (schema.const !== undefined) output.enum = [schema.const];
  for (const key of [
    "minimum",
    "maximum",
    "minLength",
    "maxLength",
    "pattern",
  ]) {
    if (schema[key] !== undefined) output[key] = schema[key];
  }
  if (schema.items)
    output.items = mongoSchema(schema.items, seenRefs, collection);
  return output;
}

function mongoType(type) {
  if (type === "string") return "string";
  if (type === "integer") return ["int", "long"];
  if (type === "number") return ["int", "long", "double", "decimal"];
  if (type === "boolean") return "bool";
  if (type === "object") return "object";
  if (type === "array") return "array";
  if (type === "null") return "null";
  return undefined;
}
