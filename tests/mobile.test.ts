import { describe, it, expect } from "vitest";
import { normaliseMobile, isValidMobile, formatMobile, maskMobile, InvalidMobileError }
  from "../src/lib/mobile.js";

describe("mobile normalisation", () => {
  it("collapses every way a farmer's number gets typed into one identity", () => {
    const forms = [
      "9876543210", "09876543210", "919876543210", "+919876543210",
      "+91 98765 43210", "98765-43210", "  +91-9876543210  ", "0919876543210",
    ];
    for (const f of forms) expect(normaliseMobile(f)).toBe("+919876543210");
  });

  it("rejects numbers that are not Indian mobiles", () => {
    for (const bad of ["1234567890", "5876543210", "987654321", "98765432101", "", "abcdefghij"]) {
      expect(() => normaliseMobile(bad)).toThrow(InvalidMobileError);
      expect(isValidMobile(bad)).toBe(false);
    }
  });

  it("accepts every valid Indian mobile prefix", () => {
    for (const first of ["6", "7", "8", "9"]) {
      expect(isValidMobile(`${first}876543210`)).toBe(true);
    }
  });

  it("formats for the screen and masks for logs", () => {
    expect(formatMobile("+919876543210")).toBe("98765 43210");
    expect(maskMobile("+919876543210")).toBe("•••••43210");
  });
});
