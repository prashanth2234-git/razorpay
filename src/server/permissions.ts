import { UserRole } from "@prisma/client";

/**
 * Check whether a given role is allowed to perform operational actions (e.g. approve recoveries, retry payments).
 */
export function canPerformOperationalActions(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.OPERATOR;
}

/**
 * Check whether a given role is allowed to modify merchant settings or user accounts.
 */
export function canManageSettings(role: UserRole): boolean {
  return role === UserRole.ADMIN;
}

/**
 * Check whether a user role is included in allowed roles.
 */
export function hasRequiredRole(userRole: UserRole, allowedRoles: UserRole[]): boolean {
  return allowedRoles.includes(userRole);
}
