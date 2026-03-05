import { NextResponse } from "next/server";
import { ClockifyClient, publishPlan, validatePlan, clearShifts } from "@/lib/integration";
import type { Plan } from "@/types";

export async function GET() {
  try {
    const client = new ClockifyClient();
    const workspaces = await client.getWorkspaces();
    return NextResponse.json({ workspaces });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "'workspaceId' query param is required" }, { status: 400 });
    }

    const result = await clearShifts(workspaceId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { plan, workspaceId, employeeNames } = body as {
      plan: Plan;
      workspaceId: string;
      employeeNames?: Record<string, string>;
    };

    if (!plan || !workspaceId) {
      return NextResponse.json(
        { error: "'plan' and 'workspaceId' are required" },
        { status: 400 },
      );
    }

    const validation = validatePlan(plan);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Plan validation failed", details: validation.errors },
        { status: 400 },
      );
    }

    const nameMap = employeeNames ? new Map(Object.entries(employeeNames)) : undefined;
    const results = await publishPlan(plan, workspaceId, nameMap);
    const allSuccess = results.every((r) => r.success);
    return NextResponse.json({ results }, { status: allSuccess ? 200 : 207 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
