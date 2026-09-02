import { FailureCategory, PaymentMethod } from "@prisma/client";

/**
 * Maps Razorpay payment method strings to the Prisma PaymentMethod enum.
 */
export function mapRazorpayMethod(method?: string | null): PaymentMethod {
  if (!method) return PaymentMethod.UPI;

  const normalized = method.trim().toLowerCase();
  switch (normalized) {
    case "card":
    case "credit_card":
    case "debit_card":
      return PaymentMethod.CARD;
    case "upi":
    case "qr":
      return PaymentMethod.UPI;
    case "netbanking":
    case "nb":
      return PaymentMethod.NETBANKING;
    case "wallet":
    case "app":
      return PaymentMethod.WALLET;
    case "emi":
      return PaymentMethod.EMI;
    default:
      return PaymentMethod.UPI;
  }
}

/**
 * Maps Razorpay error codes, descriptions, and error reasons to the Prisma FailureCategory enum.
 */
export function mapRazorpayFailureCategory(
  errorCode?: string | null,
  errorDescription?: string | null,
  errorReason?: string | null
): FailureCategory {
  const combined = [errorCode, errorDescription, errorReason]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

  if (!combined) {
    return FailureCategory.UNKNOWN;
  }

  // 1. Explicit Customer Actions
  if (
    combined.includes("CANCEL") ||
    combined.includes("USER_DROPPED") ||
    combined.includes("USER_ABORTED") ||
    combined.includes("USER_CANCELLED") ||
    combined.includes("CUSTOMER_CANCELLED")
  ) {
    return FailureCategory.CUSTOMER_CANCELLED;
  }

  // 2. Insufficient Funds / Balance
  if (
    combined.includes("INSUFFICIENT") ||
    combined.includes("LOW_BALANCE") ||
    combined.includes("INSUFFICIENT_FUNDS") ||
    combined.includes("BALANCE")
  ) {
    return FailureCategory.INSUFFICIENT_FUNDS;
  }

  // 3. Expired Card
  if (
    combined.includes("EXPIRED") ||
    combined.includes("EXPIRED_CARD") ||
    combined.includes("CARD_EXPIRED")
  ) {
    return FailureCategory.EXPIRED_CARD;
  }

  // 4. Authentication / 3DS / OTP Failures
  if (
    combined.includes("AUTH") ||
    combined.includes("OTP") ||
    combined.includes("3DS") ||
    combined.includes("AUTHENTICATION_FAILED") ||
    combined.includes("PIN_INCORRECT") ||
    combined.includes("INCORRECT_PIN")
  ) {
    return FailureCategory.AUTHENTICATION_FAILURE;
  }

  // 5. Invalid Payment Method / Card / VPA
  if (
    combined.includes("INVALID_VPA") ||
    combined.includes("VPA_NOT_FOUND") ||
    combined.includes("INVALID_CARD") ||
    combined.includes("INVALID_ACCOUNT") ||
    combined.includes("CARD_NOT_SUPPORTED") ||
    combined.includes("METHOD_NOT_SUPPORTED")
  ) {
    return FailureCategory.INVALID_PAYMENT_METHOD;
  }

  // 6. Temporary Issuer / Bank Outages
  if (
    combined.includes("ISSUER") ||
    combined.includes("BANK_ERROR") ||
    combined.includes("SWITCH_DOWN") ||
    combined.includes("NPCI") ||
    combined.includes("BANK_UNAVAILABLE") ||
    combined.includes("INTERNAL_SERVER_ERROR")
  ) {
    return FailureCategory.TEMPORARY_ISSUER_FAILURE;
  }

  // 7. Network / Gateway Timeout
  if (
    combined.includes("TIMEOUT") ||
    combined.includes("TIMED_OUT") ||
    combined.includes("GATEWAY_TIMEOUT") ||
    combined.includes("SOCKET") ||
    combined.includes("NETWORK_ERROR") ||
    combined.includes("GATEWAY_ERROR")
  ) {
    return FailureCategory.NETWORK_TIMEOUT;
  }

  // 8. Mandate / Auto-debit Failures
  if (
    combined.includes("MANDATE") ||
    combined.includes("RECURRING") ||
    combined.includes("AUTO_DEBIT") ||
    combined.includes("EMANDATE")
  ) {
    return FailureCategory.MANDATE_FAILURE;
  }

  return FailureCategory.UNKNOWN;
}

export interface NormalizedRazorpayPayment {
  id: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: string;
  description: string | null;
  customerEmail: string | null;
  customerContact: string | null;
  customerName: string | null;
  errorCode: string | null;
  errorDescription: string | null;
  errorReason: string | null;
  failureCategory: FailureCategory;
  rawEntity: Record<string, unknown>;
}

export interface NormalizedRazorpayEvent {
  entity: string;
  accountId: string | null;
  event: string;
  payment: NormalizedRazorpayPayment | null;
  rawEvent: Record<string, unknown>;
}

/**
 * Parses and extracts normalized payment details from a Razorpay webhook JSON payload.
 */
export function extractRazorpayPaymentEvent(
  parsedBody: unknown
): NormalizedRazorpayEvent | null {
  if (!parsedBody || typeof parsedBody !== "object") {
    return null;
  }

  const record = parsedBody as Record<string, unknown>;
  const event = typeof record.event === "string" ? record.event : "unknown";
  const entity = typeof record.entity === "string" ? record.entity : "event";
  const accountId = typeof record.account_id === "string" ? record.account_id : null;

  const payload =
    record.payload && typeof record.payload === "object"
      ? (record.payload as Record<string, unknown>)
      : null;

  const paymentWrapper =
    payload?.payment && typeof payload.payment === "object"
      ? (payload.payment as Record<string, unknown>)
      : null;

  const paymentEntity =
    paymentWrapper?.entity && typeof paymentWrapper.entity === "object"
      ? (paymentWrapper.entity as Record<string, unknown>)
      : null;

  if (!paymentEntity || typeof paymentEntity.id !== "string") {
    return {
      entity,
      accountId,
      event,
      payment: null,
      rawEvent: record,
    };
  }

  const id = paymentEntity.id;
  const amount = typeof paymentEntity.amount === "number" ? paymentEntity.amount : 0;
  const currency = typeof paymentEntity.currency === "string" ? paymentEntity.currency : "INR";
  const status = typeof paymentEntity.status === "string" ? paymentEntity.status : "failed";
  const description =
    typeof paymentEntity.description === "string" ? paymentEntity.description : null;
  const customerEmail =
    typeof paymentEntity.email === "string" && paymentEntity.email.trim().length > 0
      ? paymentEntity.email.trim()
      : null;
  const customerContact =
    typeof paymentEntity.contact === "string" && paymentEntity.contact.trim().length > 0
      ? paymentEntity.contact.trim()
      : null;

  const notes =
    paymentEntity.notes && typeof paymentEntity.notes === "object"
      ? (paymentEntity.notes as Record<string, unknown>)
      : null;
  const customerName =
    typeof notes?.name === "string" && notes.name.trim().length > 0
      ? notes.name.trim()
      : customerEmail
      ? customerEmail.split("@")[0]
      : "Razorpay Customer";

  const errorCode =
    typeof paymentEntity.error_code === "string" ? paymentEntity.error_code : null;
  const errorDescription =
    typeof paymentEntity.error_description === "string"
      ? paymentEntity.error_description
      : null;
  const errorReason =
    typeof paymentEntity.error_reason === "string" ? paymentEntity.error_reason : null;

  const method = mapRazorpayMethod(
    typeof paymentEntity.method === "string" ? paymentEntity.method : null
  );
  const failureCategory = mapRazorpayFailureCategory(
    errorCode,
    errorDescription,
    errorReason
  );

  return {
    entity,
    accountId,
    event,
    payment: {
      id,
      amount,
      currency,
      method,
      status,
      description,
      customerEmail,
      customerContact,
      customerName,
      errorCode,
      errorDescription,
      errorReason,
      failureCategory,
      rawEntity: paymentEntity,
    },
    rawEvent: record,
  };
}
