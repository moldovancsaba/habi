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
  "interpretation_reviews",
  "turns",
  "handoffs",
  "publications",
  "coach_materials",
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

export const INTERNAL_COLLECTIONS = Object.freeze(["auth_transactions"]);
export const INTERNAL_RUNTIME_COLLECTIONS = Object.freeze([
  ...INTERNAL_COLLECTIONS,
  "session_sso_credentials",
  "habi_sso_owner_links",
  "habi_sso_owner_sessions",
  "habi_sso_owner_handoffs",
  "habi_role_invitations",
]);

export const COLLECTION_SCHEMA = Object.freeze({
  tenants: "Tenant",
  actors: "Actor",
  identities: "Identity",
  auth_transactions: null,
  session_sso_credentials: null,
  habi_sso_owner_links: null,
  habi_sso_owner_sessions: null,
  habi_sso_owner_handoffs: null,
  habi_role_invitations: null,
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
  interpretation_reviews: "InterpretationReview",
  turns: "Turn",
  handoffs: "Handoff",
  publications: "Publication",
  coach_materials: "CoachMaterial",
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
  auth_transactions: [
    {
      key: { stateHash: 1 },
      name: "auth_transaction_state_unique",
      unique: true,
    },
    {
      key: { browserBindingHash: 1 },
      name: "auth_transaction_browser_active_unique",
      unique: true,
      partialFilterExpression: { consumedAt: null },
    },
    {
      key: { expiresAt: 1 },
      name: "auth_transaction_expiry_ttl",
      expireAfterSeconds: 0,
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
  habi_sso_owner_links: [
    {
      key: { ownerHash: 1 },
      name: "habi_sso_owner_link_owner_unique",
      unique: true,
    },
  ],
  habi_sso_owner_sessions: [
    {
      key: { tokenHash: 1 },
      name: "habi_sso_owner_session_token_unique",
      unique: true,
    },
    {
      key: { expiresAt: 1 },
      name: "habi_sso_owner_session_expiry_ttl",
      expireAfterSeconds: 0,
    },
  ],
  habi_sso_owner_handoffs: [
    {
      key: { tokenHash: 1 },
      name: "habi_sso_owner_handoff_token_unique",
      unique: true,
    },
    {
      key: { bindingHash: 1 },
      name: "habi_sso_owner_handoff_binding_unique",
      unique: true,
      partialFilterExpression: { bindingHash: { $type: "string" } },
    },
    {
      key: { expiresAt: 1 },
      name: "habi_sso_owner_handoff_expiry_ttl",
      expireAfterSeconds: 0,
    },
  ],
  habi_role_invitations: [
    {
      key: { id: 1 },
      name: "habi_role_invitation_id_unique",
      unique: true,
    },
    {
      key: { tokenHash: 1 },
      name: "habi_role_invitation_token_unique",
      unique: true,
    },
    {
      key: { expiresAt: 1 },
      name: "habi_role_invitation_expiry_ttl",
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
  interpretation_reviews: [
    {
      key: { tenantId: 1, id: 1 },
      name: "interpretation_review_tenant_id_unique",
      unique: true,
    },
    {
      key: { tenantId: 1, "interpretationRef.id": 1, revision: -1 },
      name: "interpretation_review_history",
    },
  ],
  coach_materials: [
    {
      key: { tenantId: 1, id: 1 },
      name: "coach_material_tenant_id_unique",
      unique: true,
    },
    {
      key: { tenantId: 1, playerId: 1, materialId: 1, version: 1 },
      name: "coach_material_version_unique",
      unique: true,
    },
    {
      key: { tenantId: 1, playerId: 1, createdAt: -1, id: -1 },
      name: "coach_material_player_created",
    },
  ],
  publications: [
    {
      key: { tenantId: 1, id: 1 },
      name: "publication_tenant_id_unique",
      unique: true,
    },
    {
      key: {
        tenantId: 1,
        playerId: 1,
        "resourceRef.id": 1,
        "resourceRef.revision": 1,
      },
      name: "publication_active_resource_unique",
      unique: true,
      partialFilterExpression: { status: "active" },
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
