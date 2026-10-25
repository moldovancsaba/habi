import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import contract from "../../../contracts/api-response-schemas.json" with {
  type: "json",
};
const ajv = new Ajv2020({ allErrors: false, strict: false });
addFormats(ajv);
ajv.addSchema(contract);

const validate = ajv.compile({
  $ref: `${contract.$id}#/$defs/TimelinePageReadDTO`,
});

/** Return whether a value is exactly the pinned, allow-listed API 2.2 page DTO. */
export function isTimelinePageResponse(value) {
  return validate(value) === true;
}
