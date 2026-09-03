import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { markNotificationRead } from "@/server/notifications/notification-service";

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json(
        { error: "Notification ID is required" },
        { status: 400 }
      );
    }

    const updated = await markNotificationRead(id, user.merchantId);
    if (!updated) {
      return NextResponse.json(
        { error: "Notification not found or access denied" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, notification: updated });
  } catch (error) {
    console.error("POST /api/notifications/:id/read error:", error);
    return NextResponse.json(
      { error: "Failed to mark notification as read" },
      { status: 500 }
    );
  }
}
