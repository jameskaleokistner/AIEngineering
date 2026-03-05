import { NextResponse } from "next/server";
import { parseDemandCsv, parseRoster } from "@/lib/ingestion";
import { generatePlan } from "@/lib/planning";
import type { PlanConfig } from "@/types";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const demandFile = formData.get("demand") as File | null;
    const rosterFile = formData.get("roster") as File | null;
    const configRaw = formData.get("config") as string | null;

    if (!demandFile || !rosterFile) {
      return NextResponse.json(
        { error: "Both 'demand' (CSV) and 'roster' (JSON) files are required." },
        { status: 400 },
      );
    }

    const demand = parseDemandCsv(await demandFile.text());
    const employees = parseRoster(await rosterFile.text());
    const config: Partial<PlanConfig> = configRaw ? JSON.parse(configRaw) : {};

    const plan = generatePlan(demand, employees, config);
    return NextResponse.json(plan);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
