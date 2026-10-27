import test from "node:test";
import assert from "node:assert/strict";
import { createTrustedAdultMessage } from "../src/lib/workflows/trusted-adult-message.mjs";

test("prepares an exact preview from the player's own fields", () => {
  assert.equal(
    createTrustedAdultMessage({
      person: "  Edzőm ",
      topic: "  izgulok a verseny előtt ",
      ask: "segítsünk egy tervet készíteni",
    }),
    "Beszélgetésre készülök egy megbízható felnőttel\nKivel: Edzőm\nMiről szeretnék beszélni: izgulok a verseny előtt\nMilyen segítséget kérnék: segítsünk egy tervet készíteni",
  );
});

test("marks omitted fields and does not create an empty message", () => {
  assert.match(
    createTrustedAdultMessage({ person: "Szülőm", topic: "", ask: "" }),
    /Miről szeretnék beszélni: Kihagyva/,
  );
  assert.equal(
    createTrustedAdultMessage({ person: "", topic: " ", ask: "" }),
    "",
  );
});
