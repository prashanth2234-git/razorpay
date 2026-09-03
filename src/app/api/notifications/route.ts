import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { getNotifications } from "@/server/notifications/notification-service";
import { NotificationType } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);
    const unreadOnly = searchParams.get("unreadOnly") === "true";
    const rawType = searchParams.get("type");

    const type =
      rawType && (Object.values(NotificationType) as string[]).includes(rawType)
        ? (rawType as NotificationType)
        : undefined;

    const result = await getNotifications(user.merchantId, {
      page,
      pageSize,
      unreadOnly,
      type,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/notifications error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve notifications" },
      { status: 500 }
    );
  }
}
