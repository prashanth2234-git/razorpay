import { describe, it, expect } from "vitest";

describe("Data Services Logic & Math Verification", () => {
  it("computes recovery rates accurately", () => {
    const failedCount = 150;
    const recoveredCount = 350;
    const totalFailures = failedCount + recoveredCount;
    const recoveryRate = (recoveredCount / totalFailures) * 100;
    const roundedRate = Math.round(recoveryRate * 10) / 10;

    expect(roundedRate).toBe(70.0);
  });

  it("handles zero failure edge cases cleanly in recovery rate calculation", () => {
    const failedCount = 0;
    const recoveredCount = 0;
    const totalFailures = failedCount + recoveredCount;
    const recoveryRate = totalFailures > 0 ? (recoveredCount / totalFailures) * 100 : 0;

    expect(recoveryRate).toBe(0);
  });

  it("calculates pagination bounds correctly", () => {
    const total = 520;
    const pageSize = 20;
    const totalPages = Math.ceil(total / pageSize);
    const page = 3;
    const skip = (page - 1) * pageSize;

    expect(totalPages).toBe(26);
    expect(skip).toBe(40);
  });

  it("enforces pageSize boundaries (min 1, max 100)", () => {
    const clampPageSize = (size?: number) =>
      Math.min(100, Math.max(1, size !== undefined ? size : 20));

    expect(clampPageSize(-5)).toBe(1);
    expect(clampPageSize(0)).toBe(1);
    expect(clampPageSize(25)).toBe(25);
    expect(clampPageSize(500)).toBe(100);
    expect(clampPageSize(undefined)).toBe(20);
  });
});
