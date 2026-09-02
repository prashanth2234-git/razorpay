import { RecoveryActionType } from "@prisma/client";

export interface RecoveryExecutionRequest {
  recoveryActionId: string;
  paymentId: string;
  providerPaymentId?: string | null;
  amount: number; // in paise
  actionType: RecoveryActionType;
  recoveryProbability: number;
  customerName?: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
}

export interface RecoveryExecutionResult {
  success: boolean;
  recoveredAmount: number; // in paise
  providerReference: string;
  message: string;
  isSimulated: boolean;
}

export interface RecoveryProvider {
  name: string;
  execute(request: RecoveryExecutionRequest): Promise<RecoveryExecutionResult>;
}

/**
 * Mock development recovery provider that simulates realistic recovery executions.
 */
export class MockRecoveryProvider implements RecoveryProvider {
  name = "MockRecoveryProvider";

  async execute(request: RecoveryExecutionRequest): Promise<RecoveryExecutionResult> {
    const isHighProbability = request.recoveryProbability >= 0.70;
    const isModerateProbability = request.recoveryProbability >= 0.45;

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 300));

    if (request.actionType === RecoveryActionType.RETRY_PAYMENT) {
      if (isHighProbability || (isModerateProbability && Math.random() < 0.8)) {
        return {
          success: true,
          recoveredAmount: request.amount,
          providerReference: `mock_capt_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
          message: "Payment captured successfully via automated gateway retry route.",
          isSimulated: true,
        };
      } else {
        return {
          success: false,
          recoveredAmount: 0,
          providerReference: `mock_decl_${Date.now()}`,
          message: "Secondary retry was declined by issuing bank.",
          isSimulated: true,
        };
      }
    }

    if (request.actionType === RecoveryActionType.SEND_REMINDER) {
      if (isModerateProbability) {
        return {
          success: true,
          recoveredAmount: request.amount,
          providerReference: `mock_sms_link_${Date.now()}`,
          message: "Customer received smart recovery link and completed payment authorization.",
          isSimulated: true,
        };
      } else {
        return {
          success: false,
          recoveredAmount: 0,
          providerReference: `mock_sms_exp_${Date.now()}`,
          message: "Recovery link was dispatched but expired without customer completion.",
          isSimulated: true,
        };
      }
    }

    if (request.actionType === RecoveryActionType.REQUEST_PAYMENT_METHOD_UPDATE) {
      return {
        success: true,
        recoveredAmount: request.amount,
        providerReference: `mock_alt_pay_${Date.now()}`,
        message: "Customer provided updated UPI VPA and successfully paid.",
        isSimulated: true,
      };
    }

    // Default / Escalated
    return {
      success: false,
      recoveredAmount: 0,
      providerReference: `mock_esc_${Date.now()}`,
      message: "Escalated for human operator review.",
      isSimulated: true,
    };
  }
}

/**
 * Factory returning active recovery provider (Mock for dev, Razorpay for live).
 */
export function getRecoveryProvider(): RecoveryProvider {
  return new MockRecoveryProvider();
}
