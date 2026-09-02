import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { getAuditLogs } from "@/server/services/auditService";
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
    const eventType = searchParams.get("eventType") as AuditEventType | undefined;
    const actorType = searchParams.get("actorType") as ActorType | undefined;
    const paymentId = searchParams.get("paymentId") || undefined;

    const data = await getAuditLogs(user.merchantId, {
      page,
      pageSize,
      eventType,
      actorType,
      paymentId,
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
