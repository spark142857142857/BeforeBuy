import { getLatestSnapshot } from "@/lib/data/providers";

export async function GET() {
  const snapshot = await getLatestSnapshot();
  return Response.json({ asOf: snapshot.asOf, fxAsOf: snapshot.fxAsOf, stale: snapshot.stale, provider: snapshot.provider, assetCount: snapshot.assets.length });
}
