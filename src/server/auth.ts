import { auth } from "@/auth";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  name?: string | null;
  email?: string | null;
  role: UserRole;
  merchantId: string;
  merchantName: string;
}

export interface AuthenticatedMerchant {
  id: string;
  businessName: string;
  email: string;
  currency: string;
  timezone: string;
  autoRecoveryEnabled: boolean;
  confidenceThreshold: number;
}

/**
 * Returns the currently authenticated user session or null.
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const session = await auth();
  if (!session?.user?.id || !session.user.merchantId) {
    return null;
  }

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: (session.user.role as UserRole) || UserRole.OPERATOR,
    merchantId: session.user.merchantId,
    merchantName: session.user.merchantName || "Kaveri Textiles Pvt. Ltd.",
  };
}

/**
 * Ensures the request is authenticated. Throws an error if not.
 */
export async function requireAuth(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHORIZED: Authentication required to perform this action.");
  }
  return user;
}

/**
 * Ensures the authenticated user has at least one of the required roles.
 */
export async function requireRole(allowedRoles: UserRole[]): Promise<AuthenticatedUser> {
  const user = await requireAuth();
  if (!allowedRoles.includes(user.role)) {
    throw new Error(`FORBIDDEN: User with role ${user.role} does not have required permissions (${allowedRoles.join(", ")}).`);
  }
  return user;
}

/**
 * Returns the full Merchant record for the authenticated user.
 */
export async function getCurrentMerchant(): Promise<AuthenticatedMerchant> {
  const user = await requireAuth();

  const merchant = await db.merchant.findUnique({
    where: { id: user.merchantId },
  });

  if (!merchant) {
    throw new Error(`NOT_FOUND: Merchant with ID ${user.merchantId} was not found.`);
  }

  return {
    id: merchant.id,
    businessName: merchant.businessName,
    email: merchant.email,
    currency: merchant.currency,
    timezone: merchant.timezone,
    autoRecoveryEnabled: merchant.autoRecoveryEnabled,
    confidenceThreshold: merchant.confidenceThreshold,
  };
}

export { canPerformOperationalActions, canManageSettings, hasRequiredRole } from "./permissions";
