import { headers } from "next/headers";

export async function GET() {
  await headers();
  return Response.json(
    { ok: true, service: "habi" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
