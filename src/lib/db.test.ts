import { describe, it, expect } from "vitest";
import {
  PaymentStatus,
  PaymentMethod,
  FailureCategory,
  RecoveryActionType,
  RecoveryStatus,
  RiskLevel,
} from "./db";

describe("Database enum exports & type validity", () => {
  it("exports PaymentStatus and PaymentMethod enums accurately", () => {
    expect(PaymentStatus.SUCCESS).toBe("SUCCESS");
    expect(PaymentStatus.FAILED).toBe("FAILED");
    expect(PaymentStatus.RECOVERED).toBe("RECOVERED");
    expect(PaymentStatus.RECOVERY_PENDING).toBe("RECOVERY_PENDING");
    expect(PaymentMethod.UPI).toBe("UPI");
    expect(PaymentMethod.CARD).toBe("CARD");
  });

  it("exports FailureCategory enums accurately", () => {
    expect(FailureCategory.TEMPORARY_ISSUER_FAILURE).toBe("TEMPORARY_ISSUER_FAILURE");
    expect(FailureCategory.NETWORK_TIMEOUT).toBe("NETWORK_TIMEOUT");
    expect(FailureCategory.INSUFFICIENT_FUNDS).toBe("INSUFFICIENT_FUNDS");
  });

  it("exports RecoveryActionType and RiskLevel enums", () => {
    expect(RecoveryActionType.RETRY_PAYMENT).toBe("RETRY_PAYMENT");
    expect(RecoveryActionType.SEND_REMINDER).toBe("SEND_REMINDER");
    expect(RecoveryStatus.PENDING_APPROVAL).toBe("PENDING_APPROVAL");
    expect(RiskLevel.LOW).toBe("LOW");
    expect(RiskLevel.HIGH).toBe("HIGH");
  });
});
