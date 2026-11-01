import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
export async function verifySourceContent(manifest, root) {
  const errors = [],
    unavailable = [],
    sections = [],
    pendingReview = [];
  const sources = new Map();
  for (const source of manifest.sources ?? []) {
    if (sources.has(source.id)) errors.push(`Duplicate source: ${source.id}`);
    sources.set(source.id, source);
    if (!["available", "unavailable"].includes(source.availability))
      errors.push(`Invalid availability: ${source.id}`);
    if (source.availability === "unavailable") {
      unavailable.push(source.id);
      if (
        source.sha256 !== null ||
        source.sectionsEnumerated !== false ||
        !source.reason
      )
        errors.push(
          `Unavailable source cannot claim verified bytes/sections: ${source.id}`,
        );
      continue;
    }
    if (
      isAbsolute(source.path ?? "") ||
      relative(root, resolve(root, source.path ?? "")).startsWith("..")
    ) {
      errors.push(`Non-portable/outside source: ${source.id}`);
      continue;
    }
    try {
      const bytes = await readFile(resolve(root, source.path));
      if (createHash("sha256").update(bytes).digest("hex") !== source.sha256)
        errors.push(`Source digest changed: ${source.id}`);
    } catch {
      errors.push(`Source not readable: ${source.id}`);
    }
  }
  const seen = new Set();
  for (const section of manifest.sections ?? []) {
    const key = `${section.sourceId}:${section.sectionId}`;
    if (seen.has(key)) errors.push(`Duplicate section: ${key}`);
    seen.add(key);
    const source = sources.get(section.sourceId);
    if (source?.availability !== "available")
      errors.push(`Section enumeration needs original bytes: ${key}`);
    if (
      !["mapped", "excluded", "deferred", "unmapped"].includes(
        section.disposition,
      ) ||
      !section.reason ||
      !section.title ||
      !section.version
    )
      errors.push(`Incomplete section: ${key}`);
    if (
      !["unverified", "approved", "rejected"].includes(section.rightsState) ||
      !["pending", "approved", "rejected"].includes(section.reviewState)
    )
      errors.push(`Invalid review/rights: ${key}`);
    if (
      (section.reviewState === "approved" ||
        section.rightsState === "approved") &&
      !section.reviewReceipt
    )
      errors.push(`Missing approval receipt: ${key}`);
    if (section.disposition === "mapped") {
      if (
        !section.destination ||
        isAbsolute(section.destination) ||
        relative(root, resolve(root, section.destination)).startsWith("..")
      )
        errors.push(`Invalid destination: ${key}`);
      else
        try {
          await readFile(resolve(root, section.destination));
        } catch {
          errors.push(`Missing mapped destination: ${key}`);
        }
    }
    if (
      section.reviewState !== "approved" ||
      section.rightsState !== "approved"
    )
      pendingReview.push(key);
    sections.push(key);
  }
  // Inventory completeness and content approval are distinct from manifest integrity.
  return {
    sources: sources.size,
    enumeratedSections: sections.length,
    unavailableSources: unavailable,
    pendingReview,
    unmappedSections: (manifest.sections ?? [])
      .filter((s) => s.disposition === "unmapped")
      .map((s) => `${s.sourceId}:${s.sectionId}`),
    complete:
      errors.length === 0 &&
      unavailable.length === 0 &&
      !(manifest.sections ?? []).some((s) => s.disposition === "unmapped"),
    errors,
  };
}
