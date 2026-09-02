import { NextResponse } from "next/server";
import { getCurrentUser, getCurrentMerchant } from "@/server/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const merchant = await getCurrentMerchant();

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      merchant: {
        id: merchant.id,
        businessName: merchant.businessName,
        email: merchant.email,
        currency: merchant.currency,
        timezone: merchant.timezone,
        autoRecoveryEnabled: merchant.autoRecoveryEnabled,
        confidenceThreshold: merchant.confidenceThreshold,
      },
    });
  } catch (error) {
    console.error("GET /api/me error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve user and merchant profile" },
      { status: 500 }
    );
  }
}
