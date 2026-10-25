import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const schemas = require("../../../contracts/schemas.json");
const ajv = new Ajv2020({ allErrors: false, strict: false });
addFormats(ajv);
ajv.addSchema(schemas);
const validators = new Map();

export function isValidApiInput(schemaName, value) {
  let validator = validators.get(schemaName);
  if (!validator) {
    const definition = schemas.$defs[schemaName];
    if (!definition) throw new Error("API_INPUT_SCHEMA_UNKNOWN");
    validator = ajv.compile({ $ref: `${schemas.$id}#/$defs/${schemaName}` });
    validators.set(schemaName, validator);
  }
  return validator(value) === true;
}
