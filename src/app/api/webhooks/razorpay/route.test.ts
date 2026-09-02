import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";
import { computeRazorpayWebhookSignature } from "@/server/razorpay/webhook";
import { db } from "@/lib/db";
import { ActorType, AuditEventType, FailureCategory, PaymentMethod, PaymentStatus } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  db: {
    auditLog: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    merchant: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    customer: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    payment: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    paymentAttempt: {
      count: vi.fn(),
      create: vi.fn(),
    },
    paymentFailure: {
      create: vi.fn(),
    },
    recoveryAction: {
      create: vi.fn(),
    },
  },
}));

describe("POST /api/webhooks/razorpay (Milestone 6 Step 7B)", () => {
  const testSecret = "sec_test_mock_webhook_secret_999";
  const originalSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  const validPaymentFailedPayload = JSON.stringify({
    entity: "event",
    account_id: "acc_rzp_mock_123",
    event: "payment.failed",
    contains: ["payment"],
    payload: {
      payment: {
        entity: {
          id: "pay_test_failed_888",
          amount: 499900,
          currency: "INR",
          status: "failed",
          method: "upi",
          description: "Organic Cotton Yarn Roll 10kg",
          email: "priya.sharma@example.com",
          contact: "+919876543210",
          notes: {
            name: "Priya Sharma",
          },
          error_code: "BAD_REQUEST_ERROR",
          error_description: "Payment failed due to insufficient funds in customer bank account",
          error_source: "issuer",
          error_step: "payment_authentication",
          error_reason: "insufficient_funds",
          created_at: 1725280000,
        },
      },
    },
    created_at: 1725280000,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RAZORPAY_WEBHOOK_SECRET = testSecret;

    // Default mock merchant
    vi.mocked(db.merchant.findFirst).mockResolvedValue({
      id: "merch_kaveri_demo_01",
      businessName: "Kaveri Textiles Pvt. Ltd.",
      email: "finance@kaveritextiles.com",
      currency: "INR",
      timezone: "Asia/Kolkata",
      autoRecoveryEnabled: true,
      confidenceThreshold: 0.8,
      maxRetryAttempts: 3,
      config: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(db.auditLog.findFirst).mockResolvedValue(null);
    vi.mocked(db.customer.findFirst).mockResolvedValue(null);
    vi.mocked(db.customer.create).mockResolvedValue({
      id: "cust_mock_001",
      merchantId: "merch_kaveri_demo_01",
      name: "Priya Sharma",
      email: "priya.sharma@example.com",
      phone: "+919876543210",
      lifetimeValue: 0,
      transactionCount: 1,
      successfulPaymentCount: 0,
      failedPaymentCount: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(db.payment.findUnique).mockResolvedValue(null);
    vi.mocked(db.payment.create).mockResolvedValue({
      id: "pay_rec_001",
      merchantId: "merch_kaveri_demo_01",
      customerId: "cust_mock_001",
      providerPaymentId: "pay_test_failed_888",
      amount: 499900,
      currency: "INR",
      method: PaymentMethod.UPI,
      status: PaymentStatus.FAILED,
      failureCategory: FailureCategory.INSUFFICIENT_FUNDS,
      description: "Organic Cotton Yarn Roll 10kg",
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(db.paymentAttempt.count).mockResolvedValue(0);
    vi.mocked(db.paymentAttempt.create).mockResolvedValue({
      id: "att_mock_001",
      paymentId: "pay_rec_001",
      attemptNumber: 1,
      status: PaymentStatus.FAILED,
      providerReference: "pay_test_failed_888",
      providerResponseCode: "BAD_REQUEST_ERROR",
      providerResponseMessage: "Payment failed due to insufficient funds in customer bank account",
      failureReason: "Payment failed due to insufficient funds in customer bank account",
      attemptedAt: new Date(),
    });

    vi.mocked(db.paymentFailure.create).mockResolvedValue({
      id: "fail_mock_001",
      paymentId: "pay_rec_001",
      attemptId: "att_mock_001",
      category: FailureCategory.INSUFFICIENT_FUNDS,
      providerCode: "BAD_REQUEST_ERROR",
      providerDescription: "Payment failed due to insufficient funds in customer bank account",
      isTransient: false,
      occurredAt: new Date(),
    });

    vi.mocked(db.auditLog.create).mockResolvedValue({
      id: "aud_mock_001",
      merchantId: "merch_kaveri_demo_01",
      userId: null,
      paymentId: "pay_rec_001",
      recoveryActionId: null,
      actorType: ActorType.WEBHOOK,
      eventType: AuditEventType.PAYMENT_FAILED,
      description: "Ingested Razorpay failure",
      metadata: {},
      createdAt: new Date(),
    });
  });

  afterEach(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = originalSecret;
  });

  it("successfully processes valid payment.failed webhook event and normalizes data", async () => {
    const signature = computeRazorpayWebhookSignature(validPaymentFailedPayload, testSecret);
    const eventId = "evt_rzp_mock_test_001";

    const request = new Request("http://localhost:3000/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "x-razorpay-signature": signature,
        "x-razorpay-event-id": eventId,
        "content-type": "application/json",
      },
      body: validPaymentFailedPayload,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("success");
    expect(body.eventId).toBe(eventId);
    expect(body.providerPaymentId).toBe("pay_test_failed_888");
    expect(body.failureCategory).toBe("INSUFFICIENT_FUNDS");

    // Verify Payment and Failure records were created
    expect(db.payment.create).toHaveBeenCalledTimes(1);
    expect(db.paymentAttempt.create).toHaveBeenCalledTimes(1);
    expect(db.paymentFailure.create).toHaveBeenCalledTimes(1);
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);

    // Verify recovery was NOT directly triggered from webhook
    expect(db.recoveryAction.create).not.toHaveBeenCalled();
  });

  it("rejects requests with missing X-Razorpay-Signature header with 400", async () => {
    const request = new Request("http://localhost:3000/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "x-razorpay-event-id": "evt_001",
      },
      body: validPaymentFailedPayload,
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toContain("Missing X-Razorpay-Signature");
    expect(db.payment.create).not.toHaveBeenCalled();
  });

  it("rejects requests with missing x-razorpay-event-id header with 400", async () => {
    const signature = computeRazorpayWebhookSignature(validPaymentFailedPayload, testSecret);
    const request = new Request("http://localhost:3000/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "x-razorpay-signature": signature,
      },
      body: validPaymentFailedPayload,
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toContain("Missing x-razorpay-event-id");
    expect(db.payment.create).not.toHaveBeenCalled();
  });

  it("rejects invalid signature with 400", async () => {
    const invalidSignature = "invalid_forged_signature_hex_1234567890abcdef";
    const request = new Request("http://localhost:3000/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "x-razorpay-signature": invalidSignature,
        "x-razorpay-event-id": "evt_001",
      },
      body: validPaymentFailedPayload,
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toBe("Invalid webhook signature");
    expect(db.payment.create).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON payload even if signature matched raw bytes", async () => {
    const malformedBody = "{ invalid_json_syntax: 123 ";
    const signature = computeRazorpayWebhookSignature(malformedBody, testSecret);

    const request = new Request("http://localhost:3000/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "x-razorpay-signature": signature,
        "x-razorpay-event-id": "evt_001",
      },
      body: malformedBody,
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toBe("Malformed JSON payload");
  });

  it("enforces idempotency and returns fast 200 when event ID was already processed", async () => {
    const signature = computeRazorpayWebhookSignature(validPaymentFailedPayload, testSecret);
    const eventId = "evt_duplicate_123";

    // Simulate existing audit log with this event ID
    vi.mocked(db.auditLog.findFirst).mockResolvedValueOnce({
      id: "aud_existing_001",
      merchantId: "merch_kaveri_demo_01",
      userId: null,
      paymentId: "pay_rec_001",
      recoveryActionId: null,
      actorType: ActorType.WEBHOOK,
      eventType: AuditEventType.PAYMENT_FAILED,
      description: "Existing log",
      metadata: { eventId },
      createdAt: new Date(),
    });

    const request = new Request("http://localhost:3000/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "x-razorpay-signature": signature,
        "x-razorpay-event-id": eventId,
      },
      body: validPaymentFailedPayload,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.duplicate).toBe(true);
    expect(body.message).toContain("Duplicate event already processed");

    // Must not recreate payment records on duplicate events
    expect(db.payment.create).not.toHaveBeenCalled();
    expect(db.paymentAttempt.create).not.toHaveBeenCalled();
  });

  it("gracefully acknowledges and ignores unsupported non-failure events", async () => {
    const orderPaidPayload = JSON.stringify({
      entity: "event",
      account_id: "acc_rzp_mock_123",
      event: "order.paid",
      contains: ["order"],
      payload: {
        order: {
          entity: {
            id: "order_mock_123",
            amount: 50000,
          },
        },
      },
    });

    const signature = computeRazorpayWebhookSignature(orderPaidPayload, testSecret);
    const eventId = "evt_order_paid_001";

    const request = new Request("http://localhost:3000/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "x-razorpay-signature": signature,
        "x-razorpay-event-id": eventId,
      },
      body: orderPaidPayload,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("ignored");
    expect(body.message).toContain("order.paid");

    expect(db.payment.create).not.toHaveBeenCalled();
  });

  it("gracefully auto-initializes default merchant and ingests payment when merchant table was empty", async () => {
    vi.mocked(db.merchant.findFirst).mockResolvedValueOnce(null);
    vi.mocked(db.merchant.create).mockResolvedValueOnce({
      id: "merch_kaveri_demo_01",
      businessName: "Kaveri Textiles Pvt. Ltd.",
      email: "finance@kaveritextiles.com",
      currency: "INR",
      timezone: "Asia/Kolkata",
      autoRecoveryEnabled: true,
      confidenceThreshold: 0.8,
      maxRetryAttempts: 3,
      config: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const signature = computeRazorpayWebhookSignature(validPaymentFailedPayload, testSecret);
    const eventId = "evt_init_merchant_001";

    const request = new Request("http://localhost:3000/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "x-razorpay-signature": signature,
        "x-razorpay-event-id": eventId,
      },
      body: validPaymentFailedPayload,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("success");
    expect(db.merchant.create).toHaveBeenCalledTimes(1);
    expect(db.payment.create).toHaveBeenCalledTimes(1);
  });
});
