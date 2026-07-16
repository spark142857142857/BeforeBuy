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
    return { assets, asOf: snapshotMeta.asOf, fxAsOf: snapshotMeta.fxAsOf, stale: false, provider: snapshotMeta.source };
  }
}

export class TossMarketAdapter implements MarketDataProvider {
  id = "toss-market";
  constructor(private endpoint = process.env.TOSS_MARKET_ENDPOINT, private apiKey = process.env.TOSS_API_KEY) {}

  async getSnapshot(): Promise<SnapshotResult> {
    if (!this.endpoint || !this.apiKey) throw new Error("Toss market adapter is not configured");
    const response = await fetch(this.endpoint, { headers: { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" } });
    if (!response.ok) throw new Error(`Toss market API failed: ${response.status}`);
    // 실제 토스 API 응답 규격을 연결하는 단일 교체 지점입니다.
    return new CuratedSnapshotProvider().getSnapshot();
  }
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
