import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import {
  PrismaClient,
  UserRole,
  PaymentStatus,
  PaymentMethod,
  FailureCategory,
  RecoveryActionType,
  RecoveryStatus,
  RiskLevel,
  ActorType,
  AuditEventType,
  NotificationType,
} from "@prisma/client";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/razorrecover?schema=public";

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Seeded deterministic pseudo-random number generator (Mulberry32)
function createRng(seed: number) {
  let s = seed;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = createRng(424242);

function randomChoice<T>(items: T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number, decimals = 2): number {
  const str = (rng() * (max - min) + min).toFixed(decimals);
  return parseFloat(str);
}

const FIRST_NAMES = [
  "Aarav", "Aditi", "Amit", "Ananya", "Anil", "Arjun", "Bhavna", "Chetan",
  "Deepak", "Divya", "Gaurav", "Harish", "Ishaan", "Kavita", "Kiran",
  "Manish", "Meera", "Mohan", "Neha", "Nikhil", "Pooja", "Pranav", "Priya",
  "Rahul", "Rajesh", "Ramesh", "Ritu", "Rohan", "Sachin", "Sameer", "Sanjay",
  "Shilpa", "Sneha", "Suresh", "Tanvi", "Tarun", "Varun", "Vikas", "Vikram", "Yash"
];

const LAST_NAMES = [
  "Agarwal", "Bose", "Chauhan", "Deshmukh", "Gupta", "Iyer", "Jain", "Kapoor",
  "Kumar", "Mehta", "Nair", "Patel", "Pillai", "Prasad", "Rao", "Reddy",
  "Roy", "Sharma", "Singh", "Srinivasan", "Verma", "Venkatesh"
];

const EMAIL_DOMAINS = [
  "gmail.com", "outlook.com", "yahoo.co.in", "kaveritextiles.com", "trentretail.in",
  "fabricworld.in", "suratweaves.com", "indotex.in", "fashionhub.co.in", "cottonmills.in"
];

const PAYMENT_AMOUNTS = [
  49900, 99900, 149900, 249900, 399900, 499900, 749900, 999900,
  1499900, 1999900, 2499900, 3499900, 4999900, 7500000, 9850000, 12500000
];

const DESCRIPTIONS = [
  "Wholesale Cotton Yarn - 50kg Batch",
  "Mulberry Silk Fabric Sample Yardage",
  "Handloom Linen Fabric Roll (Navy)",
  "Organic Cotton Shirting Fabric (White)",
  "Boutique Mercerized Cotton Bolt",
  "Polyester Viscose Blend Fabric Spool",
  "Denim Twill 12oz Fabric Roll",
  "Jacquard Brocade Banarasi Border 25m",
  "Raw Tussar Silk Unprocessed 10m",
  "Khadi Cotton Handspun Fabric Bundle",
  "Loom Spare Shuttle & Reeds Assembly",
  "Eco Dye Organic Indigo Pigment 5kg"
];

export async function main() {
  console.log("🌱 Starting deterministic demo database seed for RazorRecover...");

  // 1. Clean existing records for this demo merchant to ensure idempotency
  const merchantId = "merch_kaveri_demo_01";
  
  console.log("🧹 Cleaning previous demo records...");
  await prisma.notification.deleteMany({ where: { merchantId } });
  await prisma.auditLog.deleteMany({ where: { merchantId } });
  await prisma.recoveryAttempt.deleteMany({ where: { recoveryAction: { payment: { merchantId } } } });
  await prisma.recoveryAction.deleteMany({ where: { payment: { merchantId } } });
  await prisma.aiAnalysis.deleteMany({ where: { payment: { merchantId } } });
  await prisma.paymentFailure.deleteMany({ where: { payment: { merchantId } } });
  await prisma.paymentAttempt.deleteMany({ where: { payment: { merchantId } } });
  await prisma.payment.deleteMany({ where: { merchantId } });
  await prisma.customer.deleteMany({ where: { merchantId } });
  await prisma.user.deleteMany({ where: { merchantId } });
  await prisma.merchant.deleteMany({ where: { id: merchantId } });

  // 2. Create Merchant
  console.log("🏢 Creating Merchant...");
  const merchant = await prisma.merchant.create({
    data: {
      id: merchantId,
      businessName: "Kaveri Textiles Pvt. Ltd.",
      email: "finance@kaveritextiles.com",
      currency: "INR",
      timezone: "Asia/Kolkata",
      autoRecoveryEnabled: true,
      confidenceThreshold: 0.85,
      maxRetryAttempts: 3,
      config: {
        autoRetryTransient: true,
        smartSnoozeHours: 4,
        allowWhatsAppNotification: true,
        allowEmailReminder: true,
      },
    },
  });

  // 3. Create Users
  console.log("👥 Creating 4 Merchant Users...");
  const adminPasswordHash = bcrypt.hashSync("admin123", 10);
  const operatorPasswordHash = bcrypt.hashSync("operator123", 10);
  const viewerPasswordHash = bcrypt.hashSync("viewer123", 10);

  const users = await Promise.all([
    prisma.user.create({
      data: {
        id: "usr_admin_01",
        merchantId: merchant.id,
        name: "Farhan Merchant",
        email: "farhan@kaveritextiles.com",
        role: UserRole.ADMIN,
        passwordHash: adminPasswordHash,
      },
    }),
    prisma.user.create({
      data: {
        id: "usr_lead_02",
        merchantId: merchant.id,
        name: "Priyanka Sharma",
        email: "priyanka@kaveritextiles.com",
        role: UserRole.OPERATOR,
        passwordHash: operatorPasswordHash,
      },
    }),
    prisma.user.create({
      data: {
        id: "usr_agent_03",
        merchantId: merchant.id,
        name: "Vikram Adiga",
        email: "vikram@kaveritextiles.com",
        role: UserRole.OPERATOR,
        passwordHash: operatorPasswordHash,
      },
    }),
    prisma.user.create({
      data: {
        id: "usr_analyst_04",
        merchantId: merchant.id,
        name: "Sunita Rao",
        email: "sunita@kaveritextiles.com",
        role: UserRole.VIEWER,
        passwordHash: viewerPasswordHash,
      },
    }),
  ]);

  // 4. Create 520 Customers
  console.log("👤 Creating 520 realistic Customers...");
  const customerCreateData = [];
  for (let i = 1; i <= 520; i++) {
    const fn = randomChoice(FIRST_NAMES);
    const ln = randomChoice(LAST_NAMES);
    const domain = randomChoice(EMAIL_DOMAINS);
    const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@${domain}`;
    const phone = `+91 98${randomInt(10000000, 99999999)}`;
    const paddedId = String(i).padStart(4, "0");

    customerCreateData.push({
      id: `cust_${paddedId}`,
      merchantId: merchant.id,
      name: `${fn} ${ln}`,
      email,
      phone,
      lifetimeValue: 0,
      transactionCount: 0,
      successfulPaymentCount: 0,
      failedPaymentCount: 0,
      createdAt: new Date(Date.now() - randomInt(15, 180) * 86400000),
    });
  }

  await prisma.customer.createMany({
    data: customerCreateData,
  });

  const allCustomers = await prisma.customer.findMany({
    where: { merchantId: merchant.id },
  });

  // 5. Generate 1,200 Payments with temporal distribution across 90 days
  console.log("💳 Creating 1,200 Payments with attempts, failures, AI diagnoses & recovery workflows...");
  
  const now = Date.now();
  const customerStats: Record<string, { ltv: number; count: number; success: number; failed: number }> = {};

  allCustomers.forEach((c) => {
    customerStats[c.id] = { ltv: 0, count: 0, success: 0, failed: 0 };
  });

  const paymentsToInsert: Array<{
    id: string;
    merchantId: string;
    customerId: string;
    providerPaymentId: string;
    amount: number;
    currency: string;
    method: PaymentMethod;
    status: PaymentStatus;
    failureCategory?: FailureCategory;
    description: string;
    createdAt: Date;
    updatedAt: Date;
  }> = [];
  const paymentAttemptsToInsert: Array<{
    id: string;
    paymentId: string;
    attemptNumber: number;
    status: PaymentStatus;
    providerReference: string;
    providerResponseCode: string;
    providerResponseMessage: string;
    failureReason?: string;
    attemptedAt: Date;
  }> = [];
  const paymentFailuresToInsert: Array<{
    id: string;
    paymentId: string;
    attemptId?: string;
    category: FailureCategory;
    providerCode: string;
    providerDescription: string;
    isTransient: boolean;
    occurredAt: Date;
  }> = [];
  const aiAnalysesToInsert: Array<{
    id: string;
    paymentId: string;
    diagnosis: string;
    confidence: number;
    recoveryProbability: number;
    recommendedAction: RecoveryActionType;
    reasoning: string;
    riskLevel: RiskLevel;
    modelProvider: string;
    modelName: string;
    rawMetadata: object;
    createdAt: Date;
  }> = [];
  const recoveryActionsToInsert: Array<{
    id: string;
    paymentId: string;
    aiAnalysisId?: string;
    actionType: RecoveryActionType;
    status: RecoveryStatus;
    expectedRecoveryAmount: number;
    approvedById: string | null;
    approvedAt: Date | null;
    executedAt: Date | null;
    config: object;
    createdAt: Date;
    updatedAt: Date;
  }> = [];
  const recoveryAttemptsToInsert: Array<{
    id: string;
    recoveryActionId: string;
    attemptNumber: number;
    status: RecoveryStatus;
    result: string;
    recoveredAmount: number;
    attemptedAt: Date;
  }> = [];
  const auditLogsToInsert: Array<{
    id: string;
    merchantId: string;
    paymentId?: string;
    recoveryActionId?: string;
    actorType: ActorType;
    userId?: string;
    eventType: AuditEventType;
    description: string;
    metadata: object;
    createdAt: Date;
  }> = [];
  const notificationsToInsert: Array<{
    id: string;
    merchantId: string;
    customerId?: string;
    type: NotificationType;
    title: string;
    message: string;
    read: boolean;
    createdAt: Date;
  }> = [];

  for (let i = 1; i <= 1200; i++) {
    const customer = randomChoice(allCustomers);
    const daysAgo = randomFloat(0.1, 90, 2);
    const paymentDate = new Date(now - daysAgo * 86400000);
    const amount = randomChoice(PAYMENT_AMOUNTS);
    const description = randomChoice(DESCRIPTIONS);
    const paymentId = `pay_${String(i).padStart(5, "0")}`;
    const providerPaymentId = `pay_rzp_${randomInt(100000, 999999)}_${String(i).padStart(4, "0")}`;

    // Payment Method Distribution: UPI (55%), Card (25%), Netbanking (12%), Wallet (5%), EMI (3%)
    const methodRand = rng();
    let method: PaymentMethod = PaymentMethod.UPI;
    if (methodRand < 0.55) method = PaymentMethod.UPI;
    else if (methodRand < 0.80) method = PaymentMethod.CARD;
    else if (methodRand < 0.92) method = PaymentMethod.NETBANKING;
    else if (methodRand < 0.97) method = PaymentMethod.WALLET;
    else method = PaymentMethod.EMI;

    // ~72% overall initial success, ~28% initial failures
    const isSuccess = rng() < 0.72;

    if (isSuccess) {
      // Successful Payment
      customerStats[customer.id].count += 1;
      customerStats[customer.id].success += 1;
      customerStats[customer.id].ltv += amount;

      paymentsToInsert.push({
        id: paymentId,
        merchantId: merchant.id,
        customerId: customer.id,
        providerPaymentId,
        amount,
        currency: "INR",
        method,
        status: PaymentStatus.SUCCESS,
        description,
        createdAt: paymentDate,
        updatedAt: paymentDate,
      });

      paymentAttemptsToInsert.push({
        id: `att_${paymentId}_1`,
        paymentId,
        attemptNumber: 1,
        status: PaymentStatus.SUCCESS,
        providerReference: `txn_${randomInt(1000000, 9999999)}`,
        providerResponseCode: "SUCCESS_200",
        providerResponseMessage: "Transaction approved by issuing bank",
        attemptedAt: paymentDate,
      });
    } else {
      // Failed Payment Flow
      customerStats[customer.id].count += 1;
      customerStats[customer.id].failed += 1;

      // Failure Category Distribution
      const failRand = rng();
      let failureCategory: FailureCategory = FailureCategory.TEMPORARY_ISSUER_FAILURE;
      let isTransient = true;
      let providerCode = "BAD_REQUEST_GATEWAY_TIMEOUT";
      let providerDesc = "Issuer bank servers took too long to respond";

      if (failRand < 0.35) {
        failureCategory = FailureCategory.TEMPORARY_ISSUER_FAILURE;
        isTransient = true;
        providerCode = "ISSUER_DOWN_503";
        providerDesc = "Bank CBS (Core Banking Server) momentarily unavailable";
      } else if (failRand < 0.60) {
        failureCategory = FailureCategory.NETWORK_TIMEOUT;
        isTransient = true;
        providerCode = "GATEWAY_TIMEOUT_504";
        providerDesc = "NPCI / Switch network latency exceeded threshold";
      } else if (failRand < 0.75) {
        failureCategory = FailureCategory.INSUFFICIENT_FUNDS;
        isTransient = false;
        providerCode = "INSUFFICIENT_FUNDS_400";
        providerDesc = "Customer account balance below order debit value";
      } else if (failRand < 0.85) {
        failureCategory = FailureCategory.AUTHENTICATION_FAILURE;
        isTransient = false;
        providerCode = "OTP_EXPIRED_OR_INVALID";
        providerDesc = "2FA verification challenge failed or timed out";
      } else if (failRand < 0.92) {
        failureCategory = FailureCategory.EXPIRED_CARD;
        isTransient = false;
        providerCode = "CARD_EXPIRED_402";
        providerDesc = "Card validity period expired";
      } else if (failRand < 0.97) {
        failureCategory = FailureCategory.CUSTOMER_CANCELLED;
        isTransient = false;
        providerCode = "USER_DISMISSED_CHECKOUT";
        providerDesc = "User closed payment sheet before completion";
      } else {
        failureCategory = FailureCategory.MANDATE_FAILURE;
        isTransient = false;
        providerCode = "E_MANDATE_EXECUTION_FAILED";
        providerDesc = "Auto-debit recurring mandate rejected by issuer";
      }

      // Initial Payment Record
      const initialStatus: PaymentStatus = PaymentStatus.FAILED;

      paymentsToInsert.push({
        id: paymentId,
        merchantId: merchant.id,
        customerId: customer.id,
        providerPaymentId,
        amount,
        currency: "INR",
        method,
        status: initialStatus,
        failureCategory,
        description,
        createdAt: paymentDate,
        updatedAt: paymentDate,
      });

      const attemptId = `att_${paymentId}_1`;
      paymentAttemptsToInsert.push({
        id: attemptId,
        paymentId,
        attemptNumber: 1,
        status: PaymentStatus.FAILED,
        providerReference: `err_${randomInt(1000000, 9999999)}`,
        providerResponseCode: providerCode,
        providerResponseMessage: providerDesc,
        failureReason: providerDesc,
        attemptedAt: paymentDate,
      });

      paymentFailuresToInsert.push({
        id: `fail_${paymentId}_1`,
        paymentId,
        attemptId,
        category: failureCategory,
        providerCode,
        providerDescription: providerDesc,
        isTransient,
        occurredAt: paymentDate,
      });

      // Audit Log for Payment Failure
      auditLogsToInsert.push({
        id: `audit_${paymentId}_fail`,
        merchantId: merchant.id,
        paymentId,
        actorType: ActorType.SYSTEM,
        eventType: AuditEventType.PAYMENT_FAILED,
        description: `Payment ${providerPaymentId} of ₹${(amount / 100).toLocaleString("en-IN")} failed: ${providerDesc}`,
        metadata: { category: failureCategory, providerCode },
        createdAt: paymentDate,
      });

      // 6. AI Diagnosis & Recovery Recommendation
      const aiDate = new Date(paymentDate.getTime() + randomInt(15, 90) * 1000);
      let confidence = 0.85;
      let recoveryProbability = 0.80;
      let recommendedAction: RecoveryActionType = RecoveryActionType.RETRY_PAYMENT;
      let riskLevel: RiskLevel = RiskLevel.LOW;
      let reasoning = "";

      if (failureCategory === FailureCategory.TEMPORARY_ISSUER_FAILURE || failureCategory === FailureCategory.NETWORK_TIMEOUT) {
        confidence = randomFloat(0.88, 0.98);
        recoveryProbability = randomFloat(0.82, 0.94);
        recommendedAction = RecoveryActionType.RETRY_PAYMENT;
        riskLevel = RiskLevel.LOW;
        reasoning = `A transient network/issuer failure on ${method} is likely recoverable. Customer has a history of ${customerStats[customer.id].success} successful payments. Recommend auto-retry after 15 minutes.`;
      } else if (failureCategory === FailureCategory.INSUFFICIENT_FUNDS) {
        confidence = randomFloat(0.80, 0.92);
        recoveryProbability = randomFloat(0.50, 0.68);
        recommendedAction = RecoveryActionType.SEND_REMINDER;
        riskLevel = RiskLevel.MEDIUM;
        reasoning = `Insufficient funds requires customer intervention. Sending a polite WhatsApp & SMS payment recovery link on next morning achieves optimal conversion.`;
      } else if (failureCategory === FailureCategory.AUTHENTICATION_FAILURE) {
        confidence = randomFloat(0.85, 0.95);
        recoveryProbability = randomFloat(0.60, 0.75);
        recommendedAction = RecoveryActionType.SEND_REMINDER;
        riskLevel = RiskLevel.LOW;
        reasoning = `2FA challenge drop-off often recovers with an instant 1-click retry payment link.`;
      } else if (failureCategory === FailureCategory.EXPIRED_CARD) {
        confidence = randomFloat(0.90, 0.98);
        recoveryProbability = randomFloat(0.40, 0.60);
        recommendedAction = RecoveryActionType.REQUEST_PAYMENT_METHOD_UPDATE;
        riskLevel = RiskLevel.HIGH;
        reasoning = `Card details invalid/expired. Request alternate payment method (UPI or Netbanking) via payment portal link.`;
      } else {
        confidence = randomFloat(0.70, 0.85);
        recoveryProbability = randomFloat(0.25, 0.45);
        recommendedAction = RecoveryActionType.ESCALATE;
        riskLevel = RiskLevel.HIGH;
        reasoning = `Non-transient cancellation or mandate issue. Human operator review recommended before taking action.`;
      }

      const aiAnalysisId = `ai_${paymentId}`;
      aiAnalysesToInsert.push({
        id: aiAnalysisId,
        paymentId,
        diagnosis: `Identified ${failureCategory} with ${isTransient ? "transient" : "permanent"} characteristics.`,
        confidence,
        recoveryProbability,
        recommendedAction,
        reasoning,
        riskLevel,
        modelProvider: "anthropic",
        modelName: "claude-3-7-sonnet",
        rawMetadata: { confidenceThreshold: 0.85, promptTokens: 412, completionTokens: 118 },
        createdAt: aiDate,
      });

      // Audit Log for AI Diagnosis
      auditLogsToInsert.push({
        id: `audit_${paymentId}_ai`,
        merchantId: merchant.id,
        paymentId,
        actorType: ActorType.AI_AGENT,
        eventType: AuditEventType.AI_DIAGNOSIS_GENERATED,
        description: `AI recommended ${recommendedAction} (Confidence: ${(confidence * 100).toFixed(0)}%, Recovery Odds: ${(recoveryProbability * 100).toFixed(0)}%)`,
        metadata: { recommendedAction, riskLevel, confidence },
        createdAt: aiDate,
      });

      // 7. Recovery Action Orchestration
      const recoveryActionId = `rec_${paymentId}`;
      const actionDate = new Date(aiDate.getTime() + randomInt(30, 300) * 1000);
      
      // Determine Recovery Outcome Distribution
      const outcomeRand = rng();
      let recStatus: RecoveryStatus = RecoveryStatus.RECOMMENDED;
      let approvedById: string | null = null;
      let approvedAt: Date | null = null;
      let executedAt: Date | null = null;

      if (outcomeRand < 0.55) {
        // Successful Recovery Flow
        recStatus = RecoveryStatus.EXECUTED;
        approvedById = users[0].id;
        approvedAt = actionDate;
        executedAt = new Date(actionDate.getTime() + randomInt(60, 1800) * 1000);

        // Update Payment to RECOVERED
        const pIndex = paymentsToInsert.findIndex((p) => p.id === paymentId);
        if (pIndex !== -1) {
          paymentsToInsert[pIndex].status = PaymentStatus.RECOVERED;
          paymentsToInsert[pIndex].updatedAt = executedAt;
        }

        // Add to customer LTV
        customerStats[customer.id].success += 1;
        customerStats[customer.id].ltv += amount;

        // Recovery Attempt
        recoveryAttemptsToInsert.push({
          id: `ratt_${recoveryActionId}_1`,
          recoveryActionId,
          attemptNumber: 1,
          status: RecoveryStatus.EXECUTED,
          result: recommendedAction === RecoveryActionType.RETRY_PAYMENT 
            ? "Automated payment retry captured via Razorpay route" 
            : "Customer completed checkout via smart recovery link",
          recoveredAmount: amount,
          attemptedAt: executedAt,
        });

        // Audit Log for Recovery Success
        auditLogsToInsert.push({
          id: `audit_${paymentId}_rec_succ`,
          merchantId: merchant.id,
          paymentId,
          recoveryActionId,
          actorType: ActorType.SYSTEM,
          eventType: AuditEventType.RECOVERY_ATTEMPT_SUCCEEDED,
          description: `Successfully recovered ₹${(amount / 100).toLocaleString("en-IN")} via ${recommendedAction}`,
          metadata: { recoveredAmount: amount },
          createdAt: executedAt,
        });

        // Notification for merchant
        if (rng() < 0.25) {
          notificationsToInsert.push({
            id: `notif_${paymentId}`,
            merchantId: merchant.id,
            customerId: customer.id,
            type: NotificationType.RECOVERY_SUCCESS,
            title: `Revenue Recovered: ₹${(amount / 100).toLocaleString("en-IN")}`,
            message: `Automated recovery succeeded for order "${description}" from ${customer.name}.`,
            read: rng() < 0.6,
            createdAt: executedAt,
          });
        }
      } else if (outcomeRand < 0.75) {
        // Pending Approval / In-Progress Recovery Flow
        recStatus = RecoveryStatus.PENDING_APPROVAL;
        const pIndex = paymentsToInsert.findIndex((p) => p.id === paymentId);
        if (pIndex !== -1) {
          paymentsToInsert[pIndex].status = PaymentStatus.RECOVERY_PENDING;
        }

        if (rng() < 0.3) {
          notificationsToInsert.push({
            id: `notif_${paymentId}`,
            merchantId: merchant.id,
            customerId: customer.id,
            type: NotificationType.APPROVAL_REQUIRED,
            title: `Action Required: ₹${(amount / 100).toLocaleString("en-IN")} Failure`,
            message: `AI recommends ${recommendedAction} for high-value customer ${customer.name}.`,
            read: false,
            createdAt: actionDate,
          });
        }
      } else if (outcomeRand < 0.90) {
        // Failed Recovery Flow
        recStatus = RecoveryStatus.FAILED;
        approvedById = users[1].id;
        approvedAt = actionDate;
        executedAt = new Date(actionDate.getTime() + randomInt(60, 3600) * 1000);

        recoveryAttemptsToInsert.push({
          id: `ratt_${recoveryActionId}_1`,
          recoveryActionId,
          attemptNumber: 1,
          status: RecoveryStatus.FAILED,
          result: "Payment retry exhausted; bank still rejected transaction",
          recoveredAmount: 0,
          attemptedAt: executedAt,
        });

        auditLogsToInsert.push({
          id: `audit_${paymentId}_rec_fail`,
          merchantId: merchant.id,
          paymentId,
          recoveryActionId,
          actorType: ActorType.SYSTEM,
          eventType: AuditEventType.RECOVERY_ATTEMPT_FAILED,
          description: `Recovery attempt failed: secondary payment attempt was declined`,
          metadata: { error: "RETRY_LIMIT_EXCEEDED" },
          createdAt: executedAt,
        });
      } else {
        // Escalated / Rejected Flow
        recStatus = RecoveryStatus.ESCALATED;
        const pIndex = paymentsToInsert.findIndex((p) => p.id === paymentId);
        if (pIndex !== -1) {
          paymentsToInsert[pIndex].status = PaymentStatus.ESCALATED;
        }

        auditLogsToInsert.push({
          id: `audit_${paymentId}_rec_esc`,
          merchantId: merchant.id,
          paymentId,
          recoveryActionId,
          actorType: ActorType.USER,
          userId: users[0].id,
          eventType: AuditEventType.MANUAL_OVERRIDE,
          description: `Escalated payment to senior account manager for VIP handling`,
          metadata: { reason: "VIP_CUSTOMER_EXEMPTION" },
          createdAt: actionDate,
        });
      }

      recoveryActionsToInsert.push({
        id: recoveryActionId,
        paymentId,
        aiAnalysisId,
        actionType: recommendedAction,
        status: recStatus,
        expectedRecoveryAmount: amount,
        approvedById,
        approvedAt,
        executedAt,
        config: { maxAttempts: 3, delaySeconds: 900 },
        createdAt: actionDate,
        updatedAt: executedAt ?? actionDate,
      });
    }
  }

  // 8. Batch Insert Payments & Associated Records
  console.log(`📥 Inserting ${paymentsToInsert.length} payments...`);
  await prisma.payment.createMany({ data: paymentsToInsert });

  console.log(`📥 Inserting ${paymentAttemptsToInsert.length} payment attempts...`);
  await prisma.paymentAttempt.createMany({ data: paymentAttemptsToInsert });

  console.log(`📥 Inserting ${paymentFailuresToInsert.length} payment failures...`);
  await prisma.paymentFailure.createMany({ data: paymentFailuresToInsert });

  console.log(`📥 Inserting ${aiAnalysesToInsert.length} AI analyses...`);
  await prisma.aiAnalysis.createMany({ data: aiAnalysesToInsert });

  console.log(`📥 Inserting ${recoveryActionsToInsert.length} recovery actions...`);
  await prisma.recoveryAction.createMany({ data: recoveryActionsToInsert });

  console.log(`📥 Inserting ${recoveryAttemptsToInsert.length} recovery attempts...`);
  await prisma.recoveryAttempt.createMany({ data: recoveryAttemptsToInsert });

  console.log(`📥 Inserting ${auditLogsToInsert.length} audit logs...`);
  await prisma.auditLog.createMany({ data: auditLogsToInsert });

  console.log(`📥 Inserting ${notificationsToInsert.length} notifications...`);
  await prisma.notification.createMany({ data: notificationsToInsert });

  // 9. Update Customer aggregates
  console.log("📊 Updating Customer aggregate metrics...");
  for (const customer of allCustomers) {
    const stats = customerStats[customer.id];
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        lifetimeValue: stats.ltv,
        transactionCount: stats.count,
        successfulPaymentCount: stats.success,
        failedPaymentCount: stats.failed,
      },
    });
  }

  // Summary counts
  const countMerchants = await prisma.merchant.count();
  const countUsers = await prisma.user.count();
  const countCustomers = await prisma.customer.count();
  const countPayments = await prisma.payment.count();
  const countAttempts = await prisma.paymentAttempt.count();
  const countFailures = await prisma.paymentFailure.count();
  const countAiAnalyses = await prisma.aiAnalysis.count();
  const countRecoveryActions = await prisma.recoveryAction.count();
  const countRecoveryAttempts = await prisma.recoveryAttempt.count();
  const countAuditLogs = await prisma.auditLog.count();
  const countNotifications = await prisma.notification.count();

  console.log("\n✅ Database seed completed successfully!");
  console.log("==========================================");
  console.log(`🏢 Merchants:         ${countMerchants}`);
  console.log(`👥 Users:             ${countUsers}`);
  console.log(`👤 Customers:         ${countCustomers}`);
  console.log(`💳 Payments:          ${countPayments}`);
  console.log(`🔄 Payment Attempts:  ${countAttempts}`);
  console.log(`❌ Payment Failures:  ${countFailures}`);
  console.log(`🤖 AI Analyses:       ${countAiAnalyses}`);
  console.log(`⚡ Recovery Actions:  ${countRecoveryActions}`);
  console.log(`🎯 Recovery Attempts: ${countRecoveryAttempts}`);
  console.log(`📜 Audit Logs:        ${countAuditLogs}`);
  console.log(`🔔 Notifications:     ${countNotifications}`);
  console.log("==========================================\n");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed with error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
