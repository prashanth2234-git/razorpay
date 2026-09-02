import { describe, it, expect } from "vitest";
import { UserRole } from "@prisma/client";
import {
  canPerformOperationalActions,
  canManageSettings,
  hasRequiredRole,
} from "./permissions";

describe("Role Authorization & Permission Matrix", () => {
  it("allows ADMIN to perform all operational and settings actions", () => {
    expect(canPerformOperationalActions(UserRole.ADMIN)).toBe(true);
    expect(canManageSettings(UserRole.ADMIN)).toBe(true);
    expect(hasRequiredRole(UserRole.ADMIN, [UserRole.ADMIN, UserRole.OPERATOR])).toBe(true);
  });

  it("allows OPERATOR to perform operational recovery actions but not settings", () => {
    expect(canPerformOperationalActions(UserRole.OPERATOR)).toBe(true);
    expect(canManageSettings(UserRole.OPERATOR)).toBe(false);
    expect(hasRequiredRole(UserRole.OPERATOR, [UserRole.ADMIN])).toBe(false);
  });

  it("denies VIEWER from operational actions and settings modifications", () => {
    expect(canPerformOperationalActions(UserRole.VIEWER)).toBe(false);
    expect(canManageSettings(UserRole.VIEWER)).toBe(false);
    expect(hasRequiredRole(UserRole.VIEWER, [UserRole.VIEWER])).toBe(true);
  });
});
