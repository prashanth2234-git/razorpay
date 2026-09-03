import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { markAllNotificationsRead } from "@/server/notifications/notification-service";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await markAllNotificationsRead(user.merchantId);

    return NextResponse.json({ success: true, count: result.count });
  } catch (error) {
    console.error("POST /api/notifications/read-all error:", error);
    return NextResponse.json(
      { error: "Failed to mark all notifications as read" },
      { status: 500 }
    );
  }
}
