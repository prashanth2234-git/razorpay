import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  verifyRazorpayWebhookSignature,
} from "@/server/razorpay/webhook";
import {
  extractRazorpayPaymentEvent,
} from "@/server/razorpay/normalize";
import {
  ActorType,
  AuditEventType,
  FailureCategory,
  PaymentStatus,
  Prisma,
} from "@prisma/client";
import { createAuditLog } from "@/server/services/auditService";

/**
 * Razorpay Webhook Ingestion Route
 *
 * SAFETY & SECURITY INVARIANTS:
 * 1. Verifies HMAC-SHA256 signature using timingSafeEqual before reading payload contents.
 * 2. Enforces idempotency using `x-razorpay-event-id`.
 * 3. Never trusts merchantId from request body; strictly binds to verified system merchant.
 * 4. Normalizes failure details into Prisma data models (Payment, PaymentAttempt, PaymentFailure, AuditLog).
 * 5. DOES NOT execute recovery actions directly — downstream workflow handles recovery policy/approvals.
 */
export async function POST(request: Request) {
  // 1. Read raw body as text for HMAC-SHA256 signature verification
  const rawBody = await request.text();

  // 2. Extract essential webhook headers
  const signature =
    request.headers.get("x-razorpay-signature") ||
    request.headers.get("X-Razorpay-Signature");
  const eventId =
    request.headers.get("x-razorpay-event-id") ||
    request.headers.get("X-Razorpay-Event-Id");

  if (!signature || signature.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing X-Razorpay-Signature header" },
      { status: 400 }
    );
  }

  if (!eventId || eventId.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing x-razorpay-event-id header" },
      { status: 400 }
    );
  }

  // 3. Verify cryptographic webhook signature
  const isSignatureValid = verifyRazorpayWebhookSignature(rawBody, signature);
  if (!isSignatureValid) {
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 400 }
    );
  }

  // 4. Safely parse JSON after signature verification
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "Malformed JSON payload" },
      { status: 400 }
    );
  }

  const normalizedEvent = extractRazorpayPaymentEvent(parsedBody);
  if (!normalizedEvent) {
    return NextResponse.json(
      { error: "Invalid webhook payload structure" },
      { status: 400 }
    );
  }

  // 5. Enforce Idempotency via Razorpay Event ID
  // Check if an AuditLog record already exists for this eventId
  const existingAudit = await db.auditLog.findFirst({
    where: {
      metadata: {
        path: ["eventId"],
        equals: eventId.trim(),
      },
    },
  });

  if (existingAudit) {
    return NextResponse.json(
      {
        status: "ok",
        message: "Duplicate event already processed",
        eventId: eventId.trim(),
        duplicate: true,
      },
      { status: 200 }
    );
  }

  // 6. Filter by event type: Currently only payment.failed triggers recovery pipeline ingestion
  if (normalizedEvent.event !== "payment.failed") {
    return NextResponse.json(
      {
        status: "ignored",
        message: `Event '${normalizedEvent.event}' acknowledged but ignored for recovery pipeline`,
        eventId: eventId.trim(),
      },
      { status: 200 }
    );
  }

  const paymentData = normalizedEvent.payment;
  if (!paymentData) {
    return NextResponse.json(
      { error: "Missing payment entity in payment.failed payload" },
      { status: 400 }
    );
  }

  // 7. Resolve Merchant: Do not trust merchant ID from payload
  const merchant = await db.merchant.findFirst();
  if (!merchant) {
    return NextResponse.json(
      { error: "Merchant record not found in system" },
      { status: 500 }
    );
  }

  try {
    // 8. Resolve or Create Customer record
    let customer = null;
    if (paymentData.customerEmail || paymentData.customerContact) {
      customer = await db.customer.findFirst({
        where: {
          merchantId: merchant.id,
          OR: [
            ...(paymentData.customerEmail
              ? [{ email: paymentData.customerEmail }]
              : []),
            ...(paymentData.customerContact
              ? [{ phone: paymentData.customerContact }]
              : []),
          ],
        },
      });
    }

    if (!customer) {
      customer = await db.customer.create({
        data: {
          merchantId: merchant.id,
          name: paymentData.customerName || "Razorpay Customer",
          email:
            paymentData.customerEmail ||
            `${paymentData.id}@customer.razorpay.com`,
          phone: paymentData.customerContact,
          failedPaymentCount: 1,
          transactionCount: 1,
        },
      });
    } else {
      await db.customer.update({
        where: { id: customer.id },
        data: {
          failedPaymentCount: { increment: 1 },
          transactionCount: { increment: 1 },
        },
      });
    }

    // 9. Ingest or Update Payment Record
    let paymentRecord = await db.payment.findUnique({
      where: { providerPaymentId: paymentData.id },
    });

    if (paymentRecord) {
      paymentRecord = await db.payment.update({
        where: { id: paymentRecord.id },
        data: {
          status: PaymentStatus.FAILED,
          failureCategory: paymentData.failureCategory,
          updatedAt: new Date(),
        },
      });
    } else {
      paymentRecord = await db.payment.create({
        data: {
          merchantId: merchant.id,
          customerId: customer.id,
          providerPaymentId: paymentData.id,
          amount: paymentData.amount,
          currency: paymentData.currency,
          method: paymentData.method,
          status: PaymentStatus.FAILED,
          failureCategory: paymentData.failureCategory,
          description:
            paymentData.description || "Razorpay Webhook Ingested Payment",
          metadata: {
            razorpayAccountId: normalizedEvent.accountId,
            webhookEventId: eventId.trim(),
          } as Prisma.InputJsonValue,
        },
      });
    }

    // 10. Record Payment Attempt
    const existingAttemptsCount = await db.paymentAttempt.count({
      where: { paymentId: paymentRecord.id },
    });

    const attempt = await db.paymentAttempt.create({
      data: {
        paymentId: paymentRecord.id,
        attemptNumber: existingAttemptsCount + 1,
        status: PaymentStatus.FAILED,
        providerReference: paymentData.id,
        providerResponseCode: paymentData.errorCode,
        providerResponseMessage:
          paymentData.errorDescription || paymentData.errorReason,
        failureReason:
          paymentData.errorDescription ||
          paymentData.errorReason ||
          "Payment failed at payment gateway",
      },
    });

    // 11. Record Payment Failure
    await db.paymentFailure.create({
      data: {
        paymentId: paymentRecord.id,
        attemptId: attempt.id,
        category: paymentData.failureCategory,
        providerCode: paymentData.errorCode,
        providerDescription: paymentData.errorDescription,
        isTransient:
          paymentData.failureCategory ===
            FailureCategory.TEMPORARY_ISSUER_FAILURE ||
          paymentData.failureCategory === FailureCategory.NETWORK_TIMEOUT,
      },
    });

    // 12. Create Immutable Audit Log Entry
    await createAuditLog({
      merchantId: merchant.id,
      paymentId: paymentRecord.id,
      actorType: ActorType.WEBHOOK,
      eventType: AuditEventType.PAYMENT_FAILED,
      description: `Ingested Razorpay failure for ${paymentData.id} via webhook (Event: ${eventId.trim()})`,
      metadata: {
        eventId: eventId.trim(),
        razorpayPaymentId: paymentData.id,
        failureCategory: paymentData.failureCategory,
        errorCode: paymentData.errorCode,
        errorDescription: paymentData.errorDescription,
        amount: paymentData.amount,
        currency: paymentData.currency,
        paymentMethod: paymentData.method,
      } as Prisma.InputJsonValue,
    });

    // 13. Fast 200 response to acknowledge receipt to Razorpay
    return NextResponse.json(
      {
        status: "success",
        message: "Payment failure webhook processed successfully",
        eventId: eventId.trim(),
        paymentId: paymentRecord.id,
        providerPaymentId: paymentData.id,
        failureCategory: paymentData.failureCategory,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json(
      {
        error: "Internal server error processing webhook",
      },
      { status: 500 }
    );
  }
}
