import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createAuditLog,
  getAuditLogs,
  sanitizeAuditMetadata,
} from "./audit-service";
import { db } from "@/lib/db";
import { ActorType, AuditEventType } from "@prisma/client";

// Mock db
vi.mock("@/lib/db", () => ({
  db: {
    auditLog: {
      create: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

type MockFn = {
  mockImplementation: (fn: (...args: unknown[]) => unknown) => void;
  mockResolvedValue: (val: unknown) => void;
  mockResolvedValueOnce: (val: unknown) => void;
};

describe("Audit Log Service (Milestone 7 Step 12A)", () => {
  const merchantId = "merch_demo_123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Secret & sensitive credential sanitization
  it("sanitizes API keys, secrets, passwords, cookies, and tokens from metadata", () => {
    const rawMetadata = {
      apiKey: "rzp_test_secret_12345",
      password: "SuperSecretPassword!",
      webhookSecret: "whsec_abcdef987654",
      authorization: "Bearer eyJhbGciOi...",
      sessionCookie: "authjs.session-token=xxx",
      safeInfo: {
        recoveryProbability: 0.85,
        confidence: 0.92,
        actionType: "RETRY_PAYMENT",
        nestedConfig: {
          privateKey: "BEGIN RSA PRIVATE KEY",
          validAmount: 150000,
        },
      },
    };

    const sanitized = sanitizeAuditMetadata(rawMetadata) as Record<string, unknown>;

    expect(sanitized.apiKey).toBe("[REDACTED]");
    expect(sanitized.password).toBe("[REDACTED]");
    expect(sanitized.webhookSecret).toBe("[REDACTED]");
    expect(sanitized.authorization).toBe("[REDACTED]");
    expect(sanitized.sessionCookie).toBe("[REDACTED]");

    const safeInfo = sanitized.safeInfo as Record<string, unknown>;
    expect(safeInfo.recoveryProbability).toBe(0.85);
    expect(safeInfo.actionType).toBe("RETRY_PAYMENT");

    const nested = safeInfo.nestedConfig as Record<string, unknown>;
    expect(nested.privateKey).toBe("[REDACTED]");
    expect(nested.validAmount).toBe(150000);
  });

  // 2. Audit log creation enforces merchant scoping
  it("enforces merchantId from verified server context on creation", async () => {
    (db.auditLog.create as unknown as MockFn).mockResolvedValue({
      id: "log_1",
      merchantId,
      actorType: ActorType.AI_AGENT,
      eventType: AuditEventType.AI_DIAGNOSIS_GENERATED,
      description: "AI diagnosis generated",
    });

    await createAuditLog({
      merchantId,
      actorType: ActorType.AI_AGENT,
      eventType: AuditEventType.AI_DIAGNOSIS_GENERATED,
      description: "AI diagnosis generated",
      metadata: { confidence: 0.9 },
    });

    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        merchantId,
        actorType: ActorType.AI_AGENT,
        eventType: AuditEventType.AI_DIAGNOSIS_GENERATED,
      }),
    });
  });

  // 3. Reject creation without merchantId
  it("throws an error if merchantId is missing", async () => {
    await expect(
      createAuditLog({
        merchantId: "",
        actorType: ActorType.SYSTEM,
        eventType: AuditEventType.PAYMENT_FAILED,
        description: "Payment failed",
      })
    ).rejects.toThrow("createAuditLog requires a verified merchantId");
  });

  // 4. Querying audit logs is strictly merchant-scoped and newest-first
  it("retrieves paginated audit logs scoped to merchantId ordered by newest first", async () => {
    (db.auditLog.count as unknown as MockFn).mockResolvedValue(42);
    (db.auditLog.findMany as unknown as MockFn).mockResolvedValue([
      {
        id: "log_1",
        merchantId,
        actorType: ActorType.AI_AGENT,
        eventType: AuditEventType.AI_DIAGNOSIS_GENERATED,
        description: "AI diagnosis generated",
        createdAt: new Date("2026-08-20T10:00:00Z"),
      },
    ]);

    const result = await getAuditLogs(merchantId, { page: 1, pageSize: 25 });

    expect(result.total).toBe(42);
    expect(result.auditLogs.length).toBe(1);
    expect(db.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ merchantId }),
        orderBy: { createdAt: "desc" },
        take: 25,
        skip: 0,
      })
    );
  });

  // 5. Querying with filters
  it("applies eventType, actorType, and search filters correctly", async () => {
    (db.auditLog.count as unknown as MockFn).mockResolvedValue(5);
    (db.auditLog.findMany as unknown as MockFn).mockResolvedValue([]);

    await getAuditLogs(merchantId, {
      eventType: AuditEventType.RECOVERY_ACTION_APPROVED,
      actorType: ActorType.USER,
      search: "pay_12345",
    });

    expect(db.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          merchantId,
          eventType: AuditEventType.RECOVERY_ACTION_APPROVED,
          actorType: ActorType.USER,
          OR: expect.arrayContaining([
            { paymentId: { contains: "pay_12345", mode: "insensitive" } },
          ]),
        }),
      })
    );
  });
});
