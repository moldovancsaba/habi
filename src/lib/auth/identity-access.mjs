const MEMBERSHIP_LIMIT = 100;

export async function resolveSsoIdentityAccess(
  db,
  { issuer, subject, now = new Date() },
) {
  if (
    typeof issuer !== "string" ||
    typeof subject !== "string" ||
    !issuer ||
    !subject
  ) {
    throw new Error("SSO_IDENTITY_REQUIRED");
  }
  const identity = await db
    .collection("identities")
    .findOne({ issuer, subject });
  if (!identity) return null;
  const actor = await db
    .collection("actors")
    .findOne({ id: identity.actorId, status: "active" });
  if (!actor || actor.identityId !== identity.id) return null;

  const memberships = await db
    .collection("memberships")
    .find({
      actorId: actor.id,
      status: "active",
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now.toISOString() } }],
    })
    .sort({ tenantId: 1, role: 1, playerId: 1, id: 1 })
    .limit(MEMBERSHIP_LIMIT + 1)
    .toArray();
  if (memberships.length > MEMBERSHIP_LIMIT)
    throw new Error("MEMBERSHIP_SCOPE_LIMIT_EXCEEDED");

  const activeMemberships = [];
  for (const membership of memberships) {
    if (membership.role === "coach" && membership.playerId !== null) continue;
    if (membership.role !== "coach" && typeof membership.playerId !== "string")
      continue;
    const tenant = await db.collection("tenants").findOne({
      id: membership.tenantId,
      tenantId: membership.tenantId,
      status: "active",
    });
    if (!tenant) continue;
    if (membership.playerId !== null) {
      const player = await db.collection("players").findOne({
        id: membership.playerId,
        tenantId: membership.tenantId,
      });
      if (
        !player ||
        (membership.role === "player" && player.actorId !== actor.id)
      )
        continue;
    }
    activeMemberships.push(
      Object.freeze({
        id: membership.id,
        tenantId: membership.tenantId,
        retentionPolicyId: membership.retentionPolicyId,
        role: membership.role,
        playerId: membership.playerId,
        revision: membership.revision,
      }),
    );
  }

  return Object.freeze({
    actorId: actor.id,
    actorAccessRevision: actor.accessRevision,
    actorRetentionPolicyId: actor.retentionPolicyId,
    memberships: Object.freeze(activeMemberships),
  });
}
