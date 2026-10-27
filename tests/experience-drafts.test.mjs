import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidExperienceDraftPayload,
  readExperienceDraft,
} from "../src/lib/workflows/experience-drafts.mjs";
import { validateContractDocument } from "../src/lib/database/contract-validation.mjs";

test("daily and weekly reflection drafts accept only their versioned fields", () => {
  assert.equal(
    isValidExperienceDraftPayload("daily-reflection", "daily-reflection-v1", {
      moment: "Jó edzés volt.",
      helped: "A bemelegítés.",
    }),
    true,
  );
  assert.equal(
    isValidExperienceDraftPayload("daily-reflection", "daily-reflection-v1", {
      moment: "x".repeat(1001),
      helped: "",
    }),
    false,
  );
  assert.equal(
    isValidExperienceDraftPayload("weekly-reflection", "weekly-reflection-v1", {
      helped: "Csapatmunka",
      hard: "Időbeosztás",
      next: "Pihenőnap",
    }),
    true,
  );
  assert.equal(
    isValidExperienceDraftPayload("weekly-reflection", "weekly-reflection-v2", {
      helped: "",
      hard: "",
      next: "",
    }),
    false,
  );
});

test("monthly reflection drafts preserve progress and explicit skipped values", () => {
  const payload = {
    step: 3,
    answers: [1, "skip", "not-applicable", ...Array(13).fill(null)],
    nextFocus: "Több pihenés",
    note: "",
  };
  assert.equal(
    isValidExperienceDraftPayload(
      "monthly-reflection",
      "monthly-reflection-v1",
      payload,
    ),
    true,
  );
  assert.equal(
    isValidExperienceDraftPayload(
      "monthly-reflection",
      "monthly-reflection-v1",
      {
        ...payload,
        answers: [9, ...payload.answers.slice(1)],
      },
    ),
    false,
  );
  assert.equal(
    isValidExperienceDraftPayload(
      "monthly-reflection",
      "monthly-reflection-v1",
      {
        ...payload,
        answers: [5, ...payload.answers.slice(1)],
      },
    ),
    true,
  );
  assert.equal(
    isValidExperienceDraftPayload(
      "monthly-reflection",
      "monthly-reflection-v1",
      {
        ...payload,
        extra: "not permitted",
      },
    ),
    false,
  );
});

test("guided situation drafts persist only supported authored choices", () => {
  assert.equal(
    isValidExperienceDraftPayload(
      "guided-conversation",
      "guided-situation-v1",
      {
        situationId: "after-mistake",
        answers: [1, 2],
      },
    ),
    true,
  );
  assert.equal(
    isValidExperienceDraftPayload(
      "guided-conversation",
      "guided-situation-v2",
      {
        situationId: "too-fast",
        answers: [1],
        sourceCheckinId: "checkin-123",
      },
    ),
    true,
  );
  assert.equal(
    isValidExperienceDraftPayload(
      "guided-conversation",
      "guided-situation-v2",
      {
        situationId: "too-fast",
        answers: [1],
        sourceCheckinId: "not a valid id",
      },
    ),
    false,
  );
  for (const payload of [
    { situationId: "unknown", answers: [] },
    { situationId: "after-mistake", answers: [3] },
    { situationId: "after-mistake", answers: [0, 1, 2, 0] },
    { situationId: "after-mistake", answers: ["skip"] },
    { situationId: "after-mistake", answers: [], extra: true },
  ]) {
    assert.equal(
      isValidExperienceDraftPayload(
        "guided-conversation",
        "guided-situation-v1",
        payload,
      ),
      false,
    );
  }
});

test("guided topic drafts accept only reachable choices from an authored branch", () => {
  assert.equal(
    isValidExperienceDraftPayload(
      "guided-topic-conversation",
      "guided-chat-v2",
      {
        categoryId: "dreams",
        turns: ["emotion:first", "frequency:sometimes", "support:nobody"],
      },
    ),
    true,
  );
  assert.equal(
    isValidExperienceDraftPayload(
      "guided-topic-conversation",
      "guided-chat-v3",
      {
        categoryId: "dreams",
        opening: "Szeretnék fejlődni",
        turns: ["emotion:first"],
      },
    ),
    true,
  );
  assert.equal(
    isValidExperienceDraftPayload(
      "guided-topic-conversation",
      "guided-chat-v3",
      {
        categoryId: "dreams",
        opening: "x".repeat(1001),
        turns: [],
      },
    ),
    false,
  );
  for (const payload of [
    { categoryId: "unknown", turns: [] },
    { categoryId: "dreams", turns: ["emotion:bad-choice"] },
    { categoryId: "dreams", turns: ["frequency:sometimes"] },
    {
      categoryId: "dreams",
      turns: [
        "emotion:first",
        "frequency:sometimes",
        "support:nobody",
        "next:small",
        "emotion:first",
      ],
    },
    { categoryId: "dreams", turns: ["emotion:first"], extra: "no" },
  ]) {
    assert.equal(
      isValidExperienceDraftPayload(
        "guided-topic-conversation",
        "guided-chat-v2",
        payload,
      ),
      false,
    );
  }
});

test("draft persistence contract rejects missing ownership or unsupported fields", () => {
  const draft = {
    id: "2da44926-27ac-4eb7-a5f8-900112d2a2b7",
    tenantId: "habi",
    schemaVersion: 2,
    revision: 1,
    createdAt: "2026-10-27T10:00:00.000Z",
    updatedAt: "2026-10-27T10:00:00.000Z",
    retentionPolicyId: "habi-retention-v1-draft",
    playerId: "player-1",
    actorId: "actor-1",
    draftKey: "daily-reflection",
    contentVersion: "daily-reflection-v1",
    payload: { moment: "", helped: "" },
  };
  assert.equal(validateContractDocument("habi_experience_drafts", draft), true);
  assert.equal(
    validateContractDocument("habi_experience_drafts", {
      ...draft,
      draftKey: "guided-topic-conversation",
      contentVersion: "guided-chat-v2",
      payload: {
        categoryId: "dreams",
        turns: ["emotion:first", "frequency:sometimes"],
      },
    }),
    true,
  );
  assert.throws(
    () =>
      validateContractDocument("habi_experience_drafts", {
        ...draft,
        other: true,
      }),
    /DOCUMENT_CONTRACT_INVALID/,
  );
});

test("parents and coaches cannot read player-owned drafts", async () => {
  await assert.rejects(
    readExperienceDraft({
      db: {},
      principal: {
        role: "parent",
        playerId: "player-1",
      },
      playerId: "player-1",
      draftKey: "daily-reflection",
    }),
    { code: "ACCESS_DENIED" },
  );
});
