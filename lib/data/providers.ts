import { assets, snapshotMeta, type Asset } from "./catalog";

export type SnapshotResult = {
  assets: Asset[];
  asOf: string;
  fxAsOf: string;
  stale: boolean;
  provider: string;
};

export interface MarketDataProvider {
  id: string;
  getSnapshot(): Promise<SnapshotResult>;
}

export class CuratedSnapshotProvider implements MarketDataProvider {
  id = "curated-snapshot";
  async getSnapshot(): Promise<SnapshotResult> {
    return {
      assets,
      asOf: snapshotMeta.asOf,
      fxAsOf: snapshotMeta.fxAsOf,
      stale: isSnapshotStale(snapshotMeta.asOf),
      provider: snapshotMeta.source,
    };
  }
}

export function isSnapshotStale(asOf: string, maxAgeDays = 7, now = new Date()) {
  const snapshotDate = new Date(`${asOf}T00:00:00Z`);
  if (Number.isNaN(snapshotDate.getTime())) return true;
  const ageDays = (now.getTime() - snapshotDate.getTime()) / 86_400_000;
  return ageDays < -1 || ageDays > maxAgeDays;
}

export async function getLatestSnapshot(provider?: MarketDataProvider) {
  const fallback = new CuratedSnapshotProvider();
  if (!provider) return fallback.getSnapshot();
  try { return await provider.getSnapshot(); }
  catch {
    const snapshot = await fallback.getSnapshot();
    return { ...snapshot, stale: true, provider: `${snapshot.provider} · 마지막 정상 스냅샷` };
  }
}
