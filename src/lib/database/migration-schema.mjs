export const COLLECTIONS = Object.freeze([
  "tenants",
  "actors",
  "identities",
  "sessions",
  "memberships",
  "players",
  "records",
  "checkin_sessions",
  "checkin_results",
  "assessment_attempts",
  "assessment_results",
  "uploads",
  "reports",
  "extractions",
  "threads",
  "messages",
  "processes",
  "events",
  "edges",
  "interpretations",
  "turns",
  "handoffs",
  "publications",
  "plans",
  "follow_ups",
  "jobs",
  "idempotency",
  "audit",
  "privacy_requests",
  "deletion_ledger",
  "knowledge_candidates",
  "provenance",
  "release_checks",
  "external_requests",
  "knowledge_versions",
  "knowledge_sources",
]);

export const COLLECTION_SCHEMA = Object.freeze({
  tenants: "Tenant",
  actors: "Actor",
  identities: "Identity",
  sessions: "Session",
  memberships: "Membership",
  players: "Player",
  records: "Record",
  checkin_sessions: "CheckinSession",
  checkin_results: "CheckinResult",
  assessment_attempts: "AssessmentAttempt",
  assessment_results: "AssessmentResult",
  uploads: "Upload",
  reports: "Report",
  extractions: "Extraction",
  threads: "Thread",
  messages: "Message",
  processes: "Process",
  events: "Event",
  edges: "Edge",
  interpretations: "Interpretation",
  turns: "Turn",
  handoffs: "Handoff",
  publications: "Publication",
  plans: "Plan",
  follow_ups: "FollowUp",
  jobs: "Job",
  idempotency: "Idempotency",
  audit: "Audit",
  privacy_requests: "PrivacyRequest",
  deletion_ledger: "DeletionLedger",
  knowledge_candidates: "KnowledgeCandidate",
  provenance: "Provenance",
  release_checks: "ReleaseCheck",
  external_requests: "ExternalRequest",
  knowledge_versions: "KnowledgeVersion",
  knowledge_sources: "KnowledgeSource",
});

export const INDEXES = Object.freeze({
  tenants: [
    { key: { tenantId: 1, id: 1 }, name: "tenant_id_unique", unique: true },
  ],
  actors: [{ key: { id: 1 }, name: "actor_id_unique", unique: true }],
  identities: [
    {
      key: { issuer: 1, subject: 1 },
      name: "identity_issuer_subject_unique",
      unique: true,
    },
  ],
  sessions: [
    { key: { tokenHash: 1 }, name: "session_token_hash_unique", unique: true },
    {
      key: { expiresAt: 1 },
      name: "session_expiry_ttl",
      expireAfterSeconds: 0,
    },
  ],
  memberships: [
    {
      key: { tenantId: 1, actorId: 1, playerId: 1, role: 1 },
      name: "active_membership_unique",
      unique: true,
      partialFilterExpression: { status: "active" },
    },
    {
      key: { tenantId: 1, playerId: 1, status: 1, role: 1 },
      name: "membership_player_scope",
    },
  ],
  players: [
    {
      key: { tenantId: 1, id: 1 },
      name: "player_tenant_id_unique",
      unique: true,
    },
  ],
  records: [
    {
      key: { tenantId: 1, id: 1 },
      name: "record_tenant_id_unique",
      unique: true,
    },
    {
      key: { tenantId: 1, playerId: 1, submittedAt: -1, id: -1 },
      name: "record_timeline",
    },
    {
      key: { tenantId: 1, playerId: 1, sessionId: 1, metric: 1 },
      name: "record_checkin_answer_unique",
      unique: true,
      partialFilterExpression: { kind: "checkin_answer" },
    },
  ],
  events: [
    {
      key: { tenantId: 1, playerId: 1, submittedAt: -1, id: -1 },
      name: "event_timeline",
    },
    {
      key: { tenantId: 1, processId: 1, submittedAt: 1, id: 1 },
      name: "event_process_order",
    },
  ],
  jobs: [
    { key: { tenantId: 1, id: 1 }, name: "job_tenant_id_unique", unique: true },
    {
      key: { status: 1, nextAttemptAt: 1, priority: -1, createdAt: 1 },
      name: "job_claim_order",
    },
  ],
  idempotency: [
    {
      key: { tenantId: 1, actorOrClientId: 1, method: 1, path: 1, key: 1 },
      name: "idempotency_scope_unique",
      unique: true,
    },
    {
      key: { expiresAt: 1 },
      name: "idempotency_expiry_ttl",
      expireAfterSeconds: 0,
    },
  ],
  audit: [
    { key: { tenantId: 1, occurredAt: -1, id: -1 }, name: "audit_tenant_time" },
  ],
  deletion_ledger: [
    {
      key: { tenantId: 1, subjectRef: 1 },
      name: "deletion_subject_unique",
      unique: true,
    },
  ],
});

export function indexesForCollection(name) {
  return (
    INDEXES[name] ?? [
      { key: { tenantId: 1, id: 1 }, name: "tenant_id_unique", unique: true },
    ]
  );
}
