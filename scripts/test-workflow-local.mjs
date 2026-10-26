import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { validateRuntimeConfig } from "../src/lib/runtime-config.mjs";

const config = validateRuntimeConfig(process.env);
if (!config.localTestMode)
  throw new Error("LOCAL_SYNTHETIC_TEST_MODE_REQUIRED");
const origin = config.appOrigin;
const headers = (cookie, csrf) => ({
  ...(cookie ? { Cookie: cookie } : {}),
  ...(csrf ? { "x-habi-csrf": csrf } : {}),
  Origin: origin,
});

async function jsonRequest(
  path,
  { method = "GET", cookie, csrf, body, key, ifMatch } = {},
) {
  const response = await fetch(new URL(path, origin), {
    method,
    cache: "no-store",
    headers: {
      ...headers(cookie, csrf),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
      ...(ifMatch ? { "If-Match": String(ifMatch) } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = response.status === 204 ? null : await response.json();
  return { response, payload };
}

async function binaryRequest(path, { cookie, csrf, bytes, key, digest }) {
  const response = await fetch(new URL(path, origin), {
    method: "PUT",
    cache: "no-store",
    headers: {
      ...headers(cookie, csrf),
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.length),
      "Idempotency-Key": key,
      "x-chunk-sha256": digest,
    },
    body: bytes,
  });
  const payload = response.status === 204 ? null : await response.json();
  return { response, payload };
}

async function signIn(actorId, role) {
  const { response, payload } = await jsonRequest("/api/test/session", {
    method: "POST",
    body: { actorId },
  });
  assert.equal(response.status, 201, "synthetic sign-in should work");
  assert.equal(payload.role, role);
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "test session cookie should be issued");
  const cookie = setCookie.split(";", 1)[0];
  const me = await jsonRequest("/api/v1/me", { cookie });
  assert.equal(me.response.status, 200);
  assert.equal(me.payload.activeRole, role);
  return { cookie, csrf: me.payload.csrfToken };
}

async function signOut(session) {
  const { response } = await jsonRequest("/api/test/session", {
    method: "DELETE",
    cookie: session.cookie,
  });
  assert.equal(response.status, 204);
}

const home = await fetch(origin, { cache: "no-store" });
assert.equal(home.status, 200);
assert.match(await home.text(), /Közös sportolói támogatás/);

const player = await signIn("seed-a-player-actor", "player");
const playerId = "seed-player-001";
const idempotencyPrefix = randomUUID();
const start = await jsonRequest(
  `/api/v1/players/${playerId}/checkin-sessions`,
  {
    method: "POST",
    cookie: player.cookie,
    csrf: player.csrf,
    key: `${idempotencyPrefix}-start`,
    body: { timeZone: "Europe/Budapest", instrumentVersion: "checkin-hu-1" },
  },
);
assert.equal(start.response.status, 201);
assert.equal(start.payload.status, "started");
const checkinId = start.payload.id;
const bypassSessionAnswer = await jsonRequest(
  `/api/v1/players/${playerId}/records`,
  {
    method: "POST",
    cookie: player.cookie,
    csrf: player.csrf,
    key: `${idempotencyPrefix}-checkin-bypass`,
    body: {
      kind: "checkin_answer",
      text: null,
      occurredAt: new Date().toISOString(),
      timeZone: "Europe/Budapest",
      sourceKind: "self",
      sessionId: checkinId,
      metric: "load",
      answerCode: 1,
      context: null,
    },
  },
);
assert.equal(bypassSessionAnswer.response.status, 403);

const answerRequest = {
  method: "POST",
  cookie: player.cookie,
  csrf: player.csrf,
  key: `${idempotencyPrefix}-answer`,
  body: { expectedRevision: 1, metric: "energy", answerCode: 2 },
};
const answer = await jsonRequest(
  `/api/v1/checkin-sessions/${checkinId}/answers`,
  answerRequest,
);
assert.equal(answer.response.status, 201);
const answerReplay = await jsonRequest(
  `/api/v1/checkin-sessions/${checkinId}/answers`,
  answerRequest,
);
assert.equal(answerReplay.response.status, 201);
assert.equal(answerReplay.payload.id, answer.payload.id);
assert.equal(answerReplay.payload.answerCode, 2);

const staleAnswer = await jsonRequest(
  `/api/v1/checkin-sessions/${checkinId}/answers`,
  {
    ...answerRequest,
    key: `${idempotencyPrefix}-stale`,
    body: { expectedRevision: 1, metric: "sleep", answerCode: 1 },
  },
);
assert.equal(staleAnswer.response.status, 409);
assert.equal(staleAnswer.payload.code, "REVISION_CONFLICT");

const pdf = Buffer.from(
  "%PDF-1.4\n% Habi synthetic acceptance fixture\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n%%EOF\n",
  "ascii",
);
const pdfHash = createHash("sha256").update(pdf).digest("hex");
const upload = await jsonRequest(`/api/v1/players/${playerId}/uploads`, {
  method: "POST",
  cookie: player.cookie,
  csrf: player.csrf,
  key: `${idempotencyPrefix}-report-upload`,
  body: { size: pdf.length, mime: "application/pdf", sha256: pdfHash },
});
assert.equal(upload.response.status, 201);
const chunkHash = createHash("sha256").update(pdf).digest("hex");
const chunk = await binaryRequest(
  `/api/v1/uploads/${upload.payload.id}/chunks/0`,
  {
    cookie: player.cookie,
    csrf: player.csrf,
    bytes: pdf,
    digest: chunkHash,
    key: `${idempotencyPrefix}-report-chunk`,
  },
);
assert.equal(chunk.response.status, 200);
const finalizedReport = await jsonRequest(
  `/api/v1/uploads/${upload.payload.id}/finalize`,
  {
    method: "POST",
    cookie: player.cookie,
    csrf: player.csrf,
    key: `${idempotencyPrefix}-report-finalize`,
    body: { id: upload.payload.id },
  },
);
assert.equal(finalizedReport.response.status, 201);
let uploadStatus;
const scanDeadline = Date.now() + 60_000;
do {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  uploadStatus = await jsonRequest(`/api/v1/uploads/${upload.payload.id}`, {
    cookie: player.cookie,
  });
  assert.equal(uploadStatus.response.status, 200);
} while (
  uploadStatus.payload.scanStatus === "pending" &&
  Date.now() < scanDeadline
);
assert.equal(uploadStatus.payload.scanStatus, "passed");
const reportReady = await jsonRequest(
  `/api/v1/reports/${finalizedReport.payload.id}`,
  { cookie: player.cookie },
);
assert.equal(reportReady.response.status, 200);
assert.equal(reportReady.payload.status, "ready");
const practiceFeedback = await jsonRequest(
  `/api/v1/players/${playerId}/records`,
  {
    method: "POST",
    cookie: player.cookie,
    csrf: player.csrf,
    key: `${idempotencyPrefix}-practice-feedback`,
    body: {
      kind: "diary",
      text: "Gyakorlat visszajelzés: Egy figyelmi kapaszkodó (v1). Kipróbáltam.",
      occurredAt: new Date().toISOString(),
      timeZone: "Europe/Budapest",
      sourceKind: "self",
      sessionId: null,
      metric: null,
      answerCode: null,
      context: {
        setting: "training",
        activity: "habi-practice:focus:v1",
        durationMinutes: null,
      },
    },
  },
);
assert.equal(practiceFeedback.response.status, 201);
assert.equal(practiceFeedback.payload.sharingClass, "player_direct");

const parent = await signIn("seed-a-parent-one", "parent");
const deniedWrite = await jsonRequest(
  `/api/v1/checkin-sessions/${checkinId}/answers`,
  {
    method: "POST",
    cookie: parent.cookie,
    csrf: parent.csrf,
    key: `${idempotencyPrefix}-parent-answer`,
    body: { expectedRevision: 2, metric: "sleep", answerCode: 1 },
  },
);
assert.equal(deniedWrite.response.status, 403);
const parentSession = await jsonRequest(
  `/api/v1/checkin-sessions/${checkinId}`,
  { cookie: parent.cookie },
);
assert.equal(parentSession.response.status, 200);
assert.equal(parentSession.payload.answers.length, 1);
assert.equal(parentSession.payload.answers[0].answerCode, 2);
await signOut(parent);

const incomplete = await jsonRequest(`/api/v1/checkin-sessions/${checkinId}`, {
  cookie: player.cookie,
});
assert.equal(incomplete.payload.revision, 2);
const completionRequest = {
  method: "POST",
  cookie: player.cookie,
  csrf: player.csrf,
  key: `${idempotencyPrefix}-complete`,
  body: { expectedRevision: 2 },
};
const completed = await jsonRequest(
  `/api/v1/checkin-sessions/${checkinId}/complete`,
  completionRequest,
);
assert.equal(completed.response.status, 201);
assert.deepEqual(completed.payload.answerCodes, [
  { metric: "energy", code: 2 },
]);
assert.equal(completed.payload.sessionRef.revision, 3);
const completionReplay = await jsonRequest(
  `/api/v1/checkin-sessions/${checkinId}/complete`,
  completionRequest,
);
assert.equal(completionReplay.response.status, 201);
assert.equal(completionReplay.payload.id, completed.payload.id);

const parentTwo = await signIn("seed-a-parent-two", "parent");
const parentResults = await jsonRequest(
  `/api/v1/players/${playerId}/checkin-results`,
  { cookie: parentTwo.cookie },
);
assert.equal(parentResults.response.status, 200);
assert.equal(parentResults.payload.items.length, 1);
assert.equal(parentResults.payload.items[0].id, completed.payload.id);
const parentRecords = await jsonRequest(`/api/v1/players/${playerId}/records`, {
  cookie: parentTwo.cookie,
});
assert.equal(parentRecords.response.status, 200);
assert.ok(
  parentRecords.payload.items.some(
    (item) => item.id === practiceFeedback.payload.id,
  ),
);
const questionThreadId = randomUUID();
const question = await jsonRequest(
  `/api/v1/players/${playerId}/interpretations`,
  {
    method: "POST",
    cookie: parentTwo.cookie,
    csrf: parentTwo.csrf,
    key: `${idempotencyPrefix}-question`,
    body: {
      threadId: questionThreadId,
      parentTurnId: null,
      intent: "new_question",
      question: "Mit mutat ez a napi állapotjelzés?",
      sourceRefs: [
        {
          id: completed.payload.id,
          revision: completed.payload.revision,
          span: null,
        },
      ],
    },
  },
);
assert.equal(question.response.status, 202);
let questionStatus;
const questionDeadline = Date.now() + 240_000;
do {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  questionStatus = await jsonRequest(`/api/v1/jobs/${question.payload.jobId}`, {
    cookie: parentTwo.cookie,
  });
  assert.equal(questionStatus.response.status, 200);
} while (
  ["queued", "processing"].includes(questionStatus.payload.status) &&
  Date.now() < questionDeadline
);
assert.ok(
  ["ready", "review"].includes(questionStatus.payload.status),
  `local interpretation worker did not finish: ${questionStatus.payload.status}/${questionStatus.payload.reasonCode}`,
);
const interpretation = await jsonRequest(
  `/api/v1/interpretations/${questionStatus.payload.resultRef.id}`,
  { cookie: parentTwo.cookie },
);
assert.equal(interpretation.response.status, 200);
assert.ok(
  ["no_evidence", "awaiting_review", "ready"].includes(
    interpretation.payload.answerState,
  ),
);
if (interpretation.payload.answer?.claims.length) {
  assert.ok(
    interpretation.payload.answer.claims.every(
      (claim) => claim.evidenceRefs.length > 0,
    ),
  );
}
const parentObservation = await jsonRequest(
  `/api/v1/players/${playerId}/records`,
  {
    method: "POST",
    cookie: parentTwo.cookie,
    csrf: parentTwo.csrf,
    key: `${idempotencyPrefix}-parent-observation`,
    body: {
      kind: "observation",
      text: "A synthetic parent observation.",
      occurredAt: new Date().toISOString(),
      timeZone: "Europe/Budapest",
      sourceKind: "proxy",
      sessionId: null,
      metric: null,
      answerCode: null,
      context: { setting: "home", activity: null, durationMinutes: null },
    },
  },
);
assert.equal(parentObservation.response.status, 201);
assert.equal(parentObservation.payload.recordedBy.actorId, "seed-a-parent-two");
assert.equal(parentObservation.payload.sharingClass, "parent_shared");
await signOut(parentTwo);

const coach = await signIn("seed-a-coach-one", "coach");
const coachResults = await jsonRequest(
  `/api/v1/players/${playerId}/checkin-results`,
  { cookie: coach.cookie },
);
assert.equal(coachResults.response.status, 200);
assert.equal(coachResults.payload.items[0].answerCodes[0].code, 2);
const coachUpload = await jsonRequest(
  `/api/v1/players/${playerId}/uploads`,
  {
    method: "POST",
    cookie: coach.cookie,
    csrf: coach.csrf,
    key: `${idempotencyPrefix}-coach-report-upload`,
    body: { size: pdf.length, mime: "application/pdf", sha256: pdfHash },
  },
);
assert.equal(coachUpload.response.status, 201);
const coachChunk = await binaryRequest(
  `/api/v1/uploads/${coachUpload.payload.id}/chunks/0`,
  {
    cookie: coach.cookie,
    csrf: coach.csrf,
    bytes: pdf,
    digest: chunkHash,
    key: `${idempotencyPrefix}-coach-report-chunk`,
  },
);
assert.equal(coachChunk.response.status, 200);
const coachReport = await jsonRequest(
  `/api/v1/uploads/${coachUpload.payload.id}/finalize`,
  {
    method: "POST",
    cookie: coach.cookie,
    csrf: coach.csrf,
    key: `${idempotencyPrefix}-coach-report-finalize`,
    body: { id: coachUpload.payload.id },
  },
);
assert.equal(coachReport.response.status, 201);
let coachScan;
const coachScanDeadline = Date.now() + 60_000;
do {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  coachScan = await jsonRequest(`/api/v1/uploads/${coachUpload.payload.id}`, {
    cookie: coach.cookie,
  });
  assert.equal(coachScan.response.status, 200);
} while (
  coachScan.payload.scanStatus === "pending" &&
  Date.now() < coachScanDeadline
);
assert.equal(coachScan.payload.scanStatus, "passed");
const coachReports = await jsonRequest(
  `/api/v1/players/${playerId}/reports`,
  { cookie: coach.cookie },
);
assert.equal(coachReports.response.status, 200);
const coachReadyReport = coachReports.payload.items.find(
  (item) => item.id === coachReport.payload.id,
);
assert.equal(coachReadyReport.status, "ready");
const coachUploadedExtraction = await jsonRequest(
  `/api/v1/reports/${coachReadyReport.id}/extractions`,
  {
    method: "POST",
    cookie: coach.cookie,
    csrf: coach.csrf,
    key: `${idempotencyPrefix}-coach-extraction`,
    body: {
      reportRef: { id: coachReadyReport.id, revision: coachReadyReport.revision },
      fields: [
        {
          field: "Szintetikus kérdőívmező",
          page: 1,
          unit: null,
          rawValue: "ellenőrzendő érték",
          interpretationDirection: null,
          normSource: null,
          review: {
            status: "pending",
            actorId: null,
            rationale: "Kézi rögzítés; edzői ellenőrzésre vár.",
            at: null,
          },
        },
      ],
    },
  },
);
assert.equal(coachUploadedExtraction.response.status, 201);
assert.equal(coachUploadedExtraction.payload.status, "awaiting_review");
const reviewedExtraction = await jsonRequest(
  `/api/v1/extractions/${coachUploadedExtraction.payload.id}/review`,
  {
    method: "POST",
    cookie: coach.cookie,
    csrf: coach.csrf,
    key: `${idempotencyPrefix}-coach-extraction-review`,
    body: {
      expectedRevision: coachUploadedExtraction.payload.revision,
      fields: coachUploadedExtraction.payload.fields.map((field) => ({
        field: field.field,
        page: field.page,
        decision: "approve",
        rationale: "Szintetikus helyi elfogadási ellenőrzés.",
      })),
    },
  },
);
assert.equal(reviewedExtraction.response.status, 200);
assert.equal(reviewedExtraction.payload.status, "verified");
const coachObservation = await jsonRequest(
  `/api/v1/players/${playerId}/records`,
  {
    method: "POST",
    cookie: coach.cookie,
    csrf: coach.csrf,
    key: `${idempotencyPrefix}-coach-observation`,
    body: {
      kind: "observation",
      text: "A synthetic coach observation.",
      occurredAt: new Date().toISOString(),
      timeZone: "Europe/Budapest",
      sourceKind: "observation",
      sessionId: null,
      metric: null,
      answerCode: null,
      context: {
        setting: "training",
        activity: "practice",
        durationMinutes: 60,
      },
    },
  },
);
assert.equal(coachObservation.response.status, 201);
assert.equal(coachObservation.payload.recordedBy.actorId, "seed-a-coach-one");
assert.equal(coachObservation.payload.sharingClass, "coach");
const published = await jsonRequest("/api/v1/publications", {
  method: "POST",
  cookie: coach.cookie,
  csrf: coach.csrf,
  key: `${idempotencyPrefix}-publish-coach-observation`,
  body: {
    resourceRef: {
      id: coachObservation.payload.id,
      revision: coachObservation.payload.revision,
    },
  },
});
assert.equal(published.response.status, 201);
assert.equal(published.payload.resourceRef.id, coachObservation.payload.id);
const coachMaterial = await jsonRequest(
  `/api/v1/players/${playerId}/materials`,
  {
    method: "POST",
    cookie: coach.cookie,
    csrf: coach.csrf,
    key: `${idempotencyPrefix}-coach-material`,
    body: {
      title: "Szintetikus tesztanyag",
      text: "Az edzés előtt válassz egyetlen figyelmi kapaszkodót.",
      sourceRefs: [],
      supersedesRef: null,
    },
  },
);
assert.equal(coachMaterial.response.status, 201);
const materialPublication = await jsonRequest("/api/v1/publications", {
  method: "POST",
  cookie: coach.cookie,
  csrf: coach.csrf,
  key: `${idempotencyPrefix}-material-publication`,
  body: {
    resourceRef: {
      id: coachMaterial.payload.id,
      revision: coachMaterial.payload.revision,
    },
  },
});
assert.equal(materialPublication.response.status, 201);
const plan = await jsonRequest(`/api/v1/players/${playerId}/plans`, {
  method: "POST",
  cookie: coach.cookie,
  csrf: coach.csrf,
  key: `${idempotencyPrefix}-plan`,
  body: {
    sourceRefs: [
      {
        id: completed.payload.id,
        revision: completed.payload.revision,
        span: null,
      },
    ],
    answerRef: null,
    actions: [
      {
        id: randomUUID(),
        what: "Válassz egyetlen figyelmi kapaszkodót.",
        why: "Ez segíthet a mai edzés kezdetére figyelni.",
        ownerActorId: "seed-a-parent-one",
        dueAt: new Date(Date.now() + 86_400_000).toISOString(),
        stopCondition: "Állj meg, ha kényelmetlen vagy nem illik a helyzethez.",
      },
    ],
  },
});
assert.equal(plan.response.status, 201);
await signOut(coach);

const parentForVisibility = await signIn("seed-a-parent-one", "parent");
const parentThreads = await jsonRequest(`/api/v1/players/${playerId}/threads`, {
  cookie: parentForVisibility.cookie,
});
assert.equal(parentThreads.response.status, 200);
assert.ok(
  parentThreads.payload.items.some((item) => item.id === questionThreadId),
);
const parentThreadMessages = await jsonRequest(
  `/api/v1/threads/${questionThreadId}/messages`,
  { cookie: parentForVisibility.cookie },
);
assert.equal(parentThreadMessages.response.status, 200);
assert.ok(
  parentThreadMessages.payload.items.some(
    (item) => item.text === "Mit mutat ez a napi állapotjelzés?",
  ),
);
const parentRecordPage = await jsonRequest(
  `/api/v1/players/${playerId}/records`,
  {
    cookie: parentForVisibility.cookie,
  },
);
assert.equal(parentRecordPage.response.status, 200);
assert.ok(
  parentRecordPage.payload.items.some(
    (item) => item.id === parentObservation.payload.id,
  ),
);
assert.ok(
  parentRecordPage.payload.items.some(
    (item) => item.id === coachObservation.payload.id,
  ),
);
const parentMaterials = await jsonRequest(
  `/api/v1/players/${playerId}/materials`,
  {
    cookie: parentForVisibility.cookie,
  },
);
assert.equal(parentMaterials.response.status, 200);
assert.ok(
  parentMaterials.payload.items.some(
    (item) => item.id === coachMaterial.payload.id,
  ),
);
const parentPlanAcceptance = await jsonRequest(
  `/api/v1/plans/${plan.payload.id}/acceptance`,
  {
    method: "POST",
    cookie: parentForVisibility.cookie,
    csrf: parentForVisibility.csrf,
    key: `${idempotencyPrefix}-plan-acceptance`,
    ifMatch: plan.payload.revision,
    body: { expectedRevision: plan.payload.revision, decision: "accept" },
  },
);
assert.equal(parentPlanAcceptance.response.status, 200);
assert.equal(parentPlanAcceptance.payload.status, "active");
const followUp = await jsonRequest(`/api/v1/players/${playerId}/follow-ups`, {
  method: "POST",
  cookie: parentForVisibility.cookie,
  csrf: parentForVisibility.csrf,
  key: `${idempotencyPrefix}-follow-up`,
  body: {
    planRef: {
      id: parentPlanAcceptance.payload.id,
      revision: parentPlanAcceptance.payload.revision,
    },
    actionId: parentPlanAcceptance.payload.actions[0].id,
    occurredAt: new Date().toISOString(),
    context: { setting: "home", activity: null, durationMinutes: null },
    sourceKind: "proxy",
    outcome: "unknown",
    text: "A synthetic follow-up note.",
    comparable: false,
    comparabilityReason: "A fixture does not establish comparable conditions.",
  },
});
assert.equal(followUp.response.status, 201);
const firstRecordPage = await jsonRequest(
  `/api/v1/players/${playerId}/records?limit=1`,
  { cookie: parentForVisibility.cookie },
);
assert.equal(firstRecordPage.response.status, 200);
assert.ok(firstRecordPage.payload.nextCursor);
const secondRecordPage = await jsonRequest(
  `/api/v1/players/${playerId}/records?limit=1&cursor=${encodeURIComponent(firstRecordPage.payload.nextCursor)}`,
  { cookie: parentForVisibility.cookie },
);
assert.equal(secondRecordPage.response.status, 200);
assert.notEqual(
  secondRecordPage.payload.items[0].id,
  firstRecordPage.payload.items[0].id,
);
const tamperedCursor = `${firstRecordPage.payload.nextCursor.slice(0, -1)}x`;
const invalidCursor = await jsonRequest(
  `/api/v1/players/${playerId}/records?cursor=${encodeURIComponent(tamperedCursor)}`,
  { cookie: parentForVisibility.cookie },
);
assert.equal(invalidCursor.response.status, 400);
await signOut(parentForVisibility);

const playerForVisibility = await signIn("seed-a-player-actor", "player");
const playerRecordPage = await jsonRequest(
  `/api/v1/players/${playerId}/records`,
  { cookie: playerForVisibility.cookie },
);
assert.equal(playerRecordPage.response.status, 200);
assert.ok(
  !playerRecordPage.payload.items.some(
    (item) => item.id === parentObservation.payload.id,
  ),
);
assert.ok(
  !playerRecordPage.payload.items.some(
    (item) => item.id === coachObservation.payload.id,
  ),
);
await signOut(playerForVisibility);

const otherTenant = await signIn("seed-b-player-actor", "player");
const hiddenSession = await jsonRequest(
  `/api/v1/checkin-sessions/${checkinId}`,
  { cookie: otherTenant.cookie },
);
assert.equal(hiddenSession.response.status, 404);
await signOut(otherTenant);

const extractionCoach = await signIn("seed-a-coach-one", "coach");
const extraction = await jsonRequest(
  `/api/v1/reports/${finalizedReport.payload.id}/extractions`,
  {
    method: "POST",
    cookie: extractionCoach.cookie,
    csrf: extractionCoach.csrf,
    key: `${idempotencyPrefix}-extraction`,
    body: {
      reportRef: {
        id: finalizedReport.payload.id,
        revision: reportReady.payload.revision,
      },
      fields: [
        {
          field: "synthetic-field",
          page: 1,
          unit: null,
          rawValue: "synthetic-value",
          interpretationDirection: null,
          normSource: null,
          review: {
            status: "pending",
            actorId: null,
            rationale: "Ellenőrzésre vár.",
            at: null,
          },
        },
      ],
    },
  },
);
assert.equal(extraction.response.status, 201);
const extractionReviewed = await jsonRequest(
  `/api/v1/extractions/${extraction.payload.id}/review`,
  {
    method: "POST",
    cookie: extractionCoach.cookie,
    csrf: extractionCoach.csrf,
    key: `${idempotencyPrefix}-extraction-review`,
    body: {
      expectedRevision: extraction.payload.revision,
      fields: [
        {
          field: "synthetic-field",
          page: 1,
          decision: "approve",
          rationale: "A szintetikus mintamező helyességét ellenőriztem.",
        },
      ],
    },
  },
);
assert.equal(extractionReviewed.response.status, 200);
assert.equal(extractionReviewed.payload.status, "verified");
await signOut(extractionCoach);
await signOut(player);

process.stdout.write(
  "PASS local synthetic role workflow: check-in, immutable result, versioned player practice feedback, observations, local-worker Q&A and reloadable thread history, report scan and extraction review, coach materials, plan acceptance/follow-up, visibility rules, write denial, and cross-tenant isolation.\n",
);
