import { describe, it, expect } from "vitest";
import { hashSecret, verifySecret, numericCode } from "../src/lib/hash.js";
import { bookingRef, receiptNo } from "../src/lib/ids.js";

describe("secret hashing", () => {
  it("verifies the right secret and rejects the wrong one", () => {
    const stored = hashSecret("4417");
    expect(verifySecret("4417", stored)).toBe(true);
    expect(verifySecret("4418", stored)).toBe(false);
  });

  it("salts, so the same code hashes differently every time", () => {
    expect(hashSecret("1234")).not.toBe(hashSecret("1234"));
  });

  it("rejects a malformed stored value instead of throwing", () => {
    expect(verifySecret("1234", "garbage")).toBe(false);
  });
});

describe("codes and refs", () => {
  it("makes zero-padded 4-digit codes", () => {
    for (let i = 0; i < 200; i++) expect(numericCode(4)).toMatch(/^\d{4}$/);
  });

  it("makes refs with no ambiguous characters", () => {
    for (let i = 0; i < 100; i++) {
      expect(bookingRef()).toMatch(/^KS-\d{2}-[A-HJ-NP-Z2-9]{6}$/);
      expect(receiptNo()).toMatch(/^RC-\d{6}-[A-HJ-NP-Z2-9]{4}$/);
    }
  });
});
