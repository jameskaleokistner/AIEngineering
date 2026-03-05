import { NextResponse } from "next/server";
import { ClockifyClient, clockifyUsersToEmployees } from "@/lib/integration";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    const client = new ClockifyClient();

    // If no workspaceId provided, use the first workspace
    let wsId = workspaceId;
    if (!wsId) {
      const workspaces = await client.getWorkspaces();
      if (workspaces.length === 0) {
        return NextResponse.json({ error: "No Clockify workspaces found" }, { status: 404 });
      }
      wsId = workspaces[0].id;
    }

    const users = await client.getUsers(wsId);
    const employees = clockifyUsersToEmployees(users);

    return NextResponse.json({ workspaceId: wsId, employees });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
