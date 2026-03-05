import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { parseDemandCsv } from "@/lib/ingestion";

export async function GET() {
  try {
    const csvPath = join(process.cwd(), "data", "demand.csv");
    const rawCsv = readFileSync(csvPath, "utf-8");
    const demand = parseDemandCsv(rawCsv);
    return NextResponse.json({ demand, rawCsv });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load preloaded demand";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
