import { describe, it, expect } from "vitest";
import {
  mapRazorpayMethod,
  mapRazorpayFailureCategory,
  extractRazorpayPaymentEvent,
} from "./normalize";
import { FailureCategory, PaymentMethod } from "@prisma/client";

describe("Razorpay Payload Normalizer (Milestone 6 Step 7B)", () => {
  describe("mapRazorpayMethod", () => {
    it("maps standard methods correctly", () => {
      expect(mapRazorpayMethod("card")).toBe(PaymentMethod.CARD);
      expect(mapRazorpayMethod("credit_card")).toBe(PaymentMethod.CARD);
      expect(mapRazorpayMethod("upi")).toBe(PaymentMethod.UPI);
      expect(mapRazorpayMethod("netbanking")).toBe(PaymentMethod.NETBANKING);
      expect(mapRazorpayMethod("wallet")).toBe(PaymentMethod.WALLET);
      expect(mapRazorpayMethod("emi")).toBe(PaymentMethod.EMI);
    });

    it("defaults unknown or null methods to UPI", () => {
      expect(mapRazorpayMethod(null)).toBe(PaymentMethod.UPI);
      expect(mapRazorpayMethod("unknown_future_method")).toBe(PaymentMethod.UPI);
    });
  });

  describe("mapRazorpayFailureCategory", () => {
    it("maps insufficient funds errors", () => {
      expect(
        mapRazorpayFailureCategory(
          "BAD_REQUEST_ERROR",
          "Customer bank declined payment due to insufficient funds",
          "insufficient_funds"
        )
      ).toBe(FailureCategory.INSUFFICIENT_FUNDS);
    });

    it("maps expired card errors", () => {
      expect(
        mapRazorpayFailureCategory(
          "BAD_REQUEST_ERROR",
          "Card has expired. Please use a valid card",
          "expired_card"
        )
      ).toBe(FailureCategory.EXPIRED_CARD);
    });

    it("maps authentication failures (OTP/3DS)", () => {
      expect(
        mapRazorpayFailureCategory(
          "GATEWAY_ERROR",
          "3D Secure OTP verification timed out by user",
          "auth_failed"
        )
      ).toBe(FailureCategory.AUTHENTICATION_FAILURE);
    });

    it("maps customer cancelled checkout drops", () => {
      expect(
        mapRazorpayFailureCategory(
          "BAD_REQUEST_ERROR",
          "Customer cancelled transaction during redirection",
          "user_cancelled"
        )
      ).toBe(FailureCategory.CUSTOMER_CANCELLED);
    });

    it("maps network timeout errors", () => {
      expect(
        mapRazorpayFailureCategory(
          "GATEWAY_TIMEOUT",
          "Request to acquiring switch timed out after 30s",
          "gateway_timeout"
        )
      ).toBe(FailureCategory.NETWORK_TIMEOUT);
    });

    it("maps temporary issuer / bank outages", () => {
      expect(
        mapRazorpayFailureCategory(
          "GATEWAY_ERROR",
          "Issuer bank switch is currently down for maintenance",
          "bank_unavailable"
        )
      ).toBe(FailureCategory.TEMPORARY_ISSUER_FAILURE);
    });

    it("maps mandate failures", () => {
      expect(
        mapRazorpayFailureCategory(
          "MANDATE_ERROR",
          "Auto-debit recurring execution declined",
          "mandate_failure"
        )
      ).toBe(FailureCategory.MANDATE_FAILURE);
    });
  });

  describe("extractRazorpayPaymentEvent", () => {
    it("extracts nested payment entity from standard Razorpay webhook structure", () => {
      const payload = {
        entity: "event",
        account_id: "acc_rzp_999",
        event: "payment.failed",
        contains: ["payment"],
        payload: {
          payment: {
            entity: {
              id: "pay_test_001",
              amount: 750000,
              currency: "INR",
              method: "card",
              status: "failed",
              description: "Raw Silk 25m",
              email: "amit.kumar@example.com",
              contact: "+919876543210",
              notes: {
                name: "Amit Kumar",
              },
              error_code: "GATEWAY_TIMEOUT",
              error_description: "Network timeout at acquiring bank",
            },
          },
        },
      };

      const result = extractRazorpayPaymentEvent(payload);
      expect(result).not.toBeNull();
      expect(result?.event).toBe("payment.failed");
      expect(result?.payment?.id).toBe("pay_test_001");
      expect(result?.payment?.amount).toBe(750000);
      expect(result?.payment?.method).toBe(PaymentMethod.CARD);
      expect(result?.payment?.failureCategory).toBe(FailureCategory.NETWORK_TIMEOUT);
      expect(result?.payment?.customerName).toBe("Amit Kumar");
    });
  });
});
