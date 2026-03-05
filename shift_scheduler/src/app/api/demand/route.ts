import { NextResponse } from "next/server";
import { parseDemandCsv, parseRoster } from "@/lib/ingestion";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const demandFile = formData.get("demand") as File | null;
    const rosterFile = formData.get("roster") as File | null;

    const response: Record<string, unknown> = {};

    if (demandFile) {
      const csvText = await demandFile.text();
      response.demand = parseDemandCsv(csvText);
    }

    if (rosterFile) {
      const jsonText = await rosterFile.text();
      response.roster = parseRoster(jsonText);
    }

    if (!demandFile && !rosterFile) {
      return NextResponse.json(
        { error: "No files provided. Include 'demand' (CSV) and/or 'roster' (JSON) in form data." },
        { status: 400 },
      );
    }

    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
