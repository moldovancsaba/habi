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
const validateEvent = ajv.compile({
  $ref: `${contract.$id}#/$defs/TimelineEventReadDTO`,
});
const validateRecord = ajv.compile({
  $ref: `${contract.$id}#/$defs/RecordReadDTO`,
});

/** Return whether a value is exactly the pinned, allow-listed API 2.2 page DTO. */
export function isTimelinePageResponse(value) {
  return validate(value) === true;
}

/** Return whether a value is one event from the pinned timeline allow-list. */
export function isTimelineEventResponse(value) {
  return validateEvent(value) === true;
}

/** Return whether a value is the pinned, allow-listed record detail DTO. */
export function isRecordReadResponse(value) {
  return validateRecord(value) === true;
}
