/**
 * Browser-safe type definitions, enums, and utility contracts.
 *
 * CRITICAL ARCHITECTURE RULE:
 * This file contains ONLY pure TypeScript definitions and browser-safe utilities.
 * NEVER import @prisma/client, pg, node:*, or any server-only modules here.
 */

export const UserRole = {
  ADMIN: "ADMIN",
  OPERATOR: "OPERATOR",
  VIEWER: "VIEWER",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const PaymentStatus = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
  RECOVERY_PENDING: "RECOVERY_PENDING",
  RECOVERED: "RECOVERED",
  ESCALATED: "ESCALATED",
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PaymentMethod = {
  UPI: "UPI",
  CARD: "CARD",
  NETBANKING: "NETBANKING",
  WALLET: "WALLET",
  EMI: "EMI",
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const FailureCategory = {
  TEMPORARY_ISSUER_FAILURE: "TEMPORARY_ISSUER_FAILURE",
  NETWORK_TIMEOUT: "NETWORK_TIMEOUT",
  INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS",
  INVALID_PAYMENT_METHOD: "INVALID_PAYMENT_METHOD",
  EXPIRED_CARD: "EXPIRED_CARD",
  AUTHENTICATION_FAILURE: "AUTHENTICATION_FAILURE",
  CUSTOMER_CANCELLED: "CUSTOMER_CANCELLED",
  MANDATE_FAILURE: "MANDATE_FAILURE",
  UNKNOWN: "UNKNOWN",
} as const;
export type FailureCategory = (typeof FailureCategory)[keyof typeof FailureCategory];

export const RecoveryActionType = {
  RETRY_PAYMENT: "RETRY_PAYMENT",
  SEND_REMINDER: "SEND_REMINDER",
  REQUEST_PAYMENT_METHOD_UPDATE: "REQUEST_PAYMENT_METHOD_UPDATE",
  WAIT: "WAIT",
  ESCALATE: "ESCALATE",
} as const;
export type RecoveryActionType =
  (typeof RecoveryActionType)[keyof typeof RecoveryActionType];

export const RecoveryStatus = {
  RECOMMENDED: "RECOMMENDED",
  PENDING_APPROVAL: "PENDING_APPROVAL",
  APPROVED: "APPROVED",
  EXECUTING: "EXECUTING",
  EXECUTED: "EXECUTED",
  FAILED: "FAILED",
  REJECTED: "REJECTED",
  ESCALATED: "ESCALATED",
} as const;
export type RecoveryStatus = (typeof RecoveryStatus)[keyof typeof RecoveryStatus];

export const RiskLevel = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
} as const;
export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

export const ActorType = {
  AI_AGENT: "AI_AGENT",
  USER: "USER",
  SYSTEM: "SYSTEM",
  WEBHOOK: "WEBHOOK",
} as const;
export type ActorType = (typeof ActorType)[keyof typeof ActorType];

export const AuditEventType = {
  PAYMENT_FAILED: "PAYMENT_FAILED",
  AI_DIAGNOSIS_GENERATED: "AI_DIAGNOSIS_GENERATED",
  RECOVERY_ACTION_CREATED: "RECOVERY_ACTION_CREATED",
  RECOVERY_ACTION_APPROVED: "RECOVERY_ACTION_APPROVED",
  RECOVERY_ACTION_REJECTED: "RECOVERY_ACTION_REJECTED",
  RECOVERY_ATTEMPT_STARTED: "RECOVERY_ATTEMPT_STARTED",
  RECOVERY_ATTEMPT_SUCCEEDED: "RECOVERY_ATTEMPT_SUCCEEDED",
  RECOVERY_ATTEMPT_FAILED: "RECOVERY_ATTEMPT_FAILED",
  MANUAL_OVERRIDE: "MANUAL_OVERRIDE",
  SETTINGS_UPDATED: "SETTINGS_UPDATED",
} as const;
export type AuditEventType = (typeof AuditEventType)[keyof typeof AuditEventType];

export const NotificationType = {
  PAYMENT_FAILURE: "PAYMENT_FAILURE",
  RECOVERY_SUCCESS: "RECOVERY_SUCCESS",
  APPROVAL_REQUIRED: "APPROVAL_REQUIRED",
  RISK_ALERT: "RISK_ALERT",
  SYSTEM_UPDATE: "SYSTEM_UPDATE",
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export type AiPolicyStatus =
  | "AI_RECOMMENDATION_ACCEPTED"
  | "AI_RECOMMENDATION_REQUIRES_APPROVAL"
  | "AI_RECOMMENDATION_REJECTED"
  | "AI_RECOMMENDATION_ESCALATED";

export interface ClientAiPolicyDecision {
  status: AiPolicyStatus;
  aiRecommendedAction: RecoveryActionType | string;
  policyPermittedAction: RecoveryActionType | string;
  aiConfidence: number;
  aiRecoveryProbability: number;
  aiRiskLevel: RiskLevel | string;
  requiresHumanApproval: boolean;
  isPolicyOverridden: boolean;
  policyReason: string;
  policyFlags: string[];
}

// ---------------------------------------------------------------------------
// Audit Log Types
// ---------------------------------------------------------------------------

export interface AuditLogItem {
  id: string;
  merchantId: string;
  userId: string | null;
  paymentId: string | null;
  recoveryActionId: string | null;
  actorType: ActorType;
  eventType: AuditEventType;
  description: string;
  metadata: Record<string, unknown> | null;
  createdAt: string | Date;
  user?: {
    id: string;
    name: string;
    email: string;
    role: string;
  } | null;
  payment?: {
    id: string;
    providerPaymentId: string | null;
    amount: number;
    currency: string;
    status: string;
    failureCategory?: string | null;
    customer?: {
      name: string;
      email: string;
    } | null;
  } | null;
  recoveryAction?: {
    id: string;
    actionType: string;
    status: string;
    expectedRecoveryAmount?: number | null;
  } | null;
}

export interface AuditLogsResponse {
  auditLogs: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Notification Types
// ---------------------------------------------------------------------------

export interface NotificationItem {
  id: string;
  merchantId: string;
  customerId: string | null;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string | Date;
}

export interface NotificationsResponse {
  notifications: NotificationItem[];
  unreadCount: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Recovery Analytics Types
// ---------------------------------------------------------------------------

export interface RecoveryAnalyticsFilters {
  startDate?: string;
  endDate?: string;
  failureCategory?: FailureCategory;
  actionType?: RecoveryActionType;
}

export interface CategoryRecoveryMetric {
  category: FailureCategory;
  opportunities: number;
  revenueAtRisk: number; // in paise
  expectedRecoverable: number; // in paise
  recoveredRevenue: number; // in paise
  recoveryRate: number; // percentage (0 - 100)
}

export interface ActionTypeRecoveryMetric {
  actionType: RecoveryActionType;
  opportunities: number;
  executed: number;
  failed: number;
  recoveredRevenue: number; // in paise
  successRate: number; // percentage (0 - 100)
}

export interface TrendPoint {
  date: string; // YYYY-MM-DD
  revenueAtRisk: number; // in paise
  expectedRecoverable: number; // in paise
  recoveredRevenue: number; // in paise
  successfulRecoveries: number;
}

export interface AiPolicyAnalytics {
  aiRecommendationsCount: number;
  policyAcceptedCount: number;
  policyRejectedCount: number;
  approvalRequiredCount: number;
  executedActionsCount: number;
  avgConfidence: number; // 0 - 1
  avgRecoveryProbability: number; // 0 - 1
}

export interface RecoveryAnalyticsData {
  merchantId: string;
  currency: string;
  isSimulated: boolean;

  // Top KPIs (in paise)
  revenueAtRisk: number;
  expectedRecoverable: number;
  recoveredRevenue: number;
  recoveryRate: number; // percentage (0 - 100)

  // Secondary KPIs
  totalRecoveryAttempts: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  pendingApprovalCount: number;
  recoveryPipelineCount: number;
  averageRecoveredAmount: number; // in paise

  // Breakdowns & Trends
  byCategory: CategoryRecoveryMetric[];
  byActionType: ActionTypeRecoveryMetric[];
  trend: TrendPoint[];
  aiPolicy: AiPolicyAnalytics;
}

/**
 * Check whether a given role is allowed to perform operational actions (browser-safe).
 */
export function canPerformOperationalActions(role: UserRole | string): boolean {
  return role === UserRole.ADMIN || role === UserRole.OPERATOR;
}

/**
 * Check whether a given role is allowed to modify merchant settings (browser-safe).
 */
export function canManageSettings(role: UserRole | string): boolean {
  return role === UserRole.ADMIN;
}
