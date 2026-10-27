import { HabiApiError } from "../api/error-response.mjs";
export async function listPlanParticipants({ db, principal, playerId }) {
  if (!["player", "parent", "coach"].includes(principal.role))
    throw new HabiApiError("ACCESS_DENIED");
  if (principal.role !== "coach" && principal.playerId !== playerId)
    throw new HabiApiError("NOT_FOUND");
  const player = await db
    .collection("players")
    .findOne({ tenantId: principal.tenantId, id: playerId });
  if (!player) throw new HabiApiError("NOT_FOUND");
  const memberships = await db
    .collection("memberships")
    .find({
      tenantId: principal.tenantId,
      status: "active",
      $or: [{ playerId }, { playerId: null, role: "coach" }],
    })
    .sort({ role: 1, id: 1 })
    .toArray();
  const counts = {};
  const items = [];
  for (const member of memberships) {
    if (
      !(await db
        .collection("actors")
        .findOne({ id: member.actorId, status: "active" }))
    )
      continue;
    counts[member.role] = (counts[member.role] ?? 0) + 1;
    const name =
      member.role === "player"
        ? (player.displayName ?? "Játékos")
        : member.role === "parent"
          ? `Kapcsolt szülő ${counts[member.role]}`
          : `Edző ${counts[member.role]}`;
    items.push({
      actorId: member.actorId,
      role: member.role,
      label: member.actorId === principal.actorId ? `${name} · én` : name,
    });
  }
  return { items };
}
