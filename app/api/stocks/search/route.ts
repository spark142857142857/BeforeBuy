import { searchKoreanStocks } from "@/lib/data/krx-master";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").slice(0, 80);
  const results = searchKoreanStocks(query, 10);
  return Response.json({ query, count: results.length, results });
}
