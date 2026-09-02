import { describe, it, expect } from "vitest";
import { formatINR, formatPercent, truncateId, cn } from "./utils";

describe("Utils sanity checks", () => {
  it("formats currency in INR correctly", () => {
    // 50000 paise = 500 rupees
    const formatted = formatINR(50000);
    expect(formatted).toContain("500");
  });

  it("formats percentages correctly", () => {
    expect(formatPercent(68.42, 1)).toBe("68.4%");
  });

  it("truncates long IDs properly", () => {
    expect(truncateId("pay_1234567890abcdef", 8)).toBe("pay_1234…");
    expect(truncateId("short_id", 14)).toBe("short_id");
  });

  it("merges tailwind classes with cn", () => {
    expect(cn("px-2", "px-4", "text-sm")).toBe("px-4 text-sm");
  });
});
