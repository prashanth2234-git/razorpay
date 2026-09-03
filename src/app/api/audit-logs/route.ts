import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { getAuditLogs } from "@/server/audit/audit-service";
import { AuditEventType, ActorType } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "25", 10);
    const rawEventType = searchParams.get("eventType");
    const rawActorType = searchParams.get("actorType");
    const paymentId = searchParams.get("paymentId") || undefined;
    const recoveryActionId = searchParams.get("recoveryActionId") || undefined;
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const search = searchParams.get("search") || undefined;

    const eventType =
      rawEventType && (Object.values(AuditEventType) as string[]).includes(rawEventType)
        ? (rawEventType as AuditEventType)
        : undefined;

    const actorType =
      rawActorType && (Object.values(ActorType) as string[]).includes(rawActorType)
        ? (rawActorType as ActorType)
        : undefined;

    const data = await getAuditLogs(user.merchantId, {
      page,
      pageSize,
      eventType,
      actorType,
      paymentId,
      recoveryActionId,
      startDate,
      endDate,
      search,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/audit-logs error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve audit logs" },
      { status: 500 }
    );
  }
}
