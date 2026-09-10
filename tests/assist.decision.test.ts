import { describe, it, expect } from "vitest";
import { detectIntent, unknownPrompt } from "../src/domain/assist.js";

describe("voice intent detection", () => {
  it("recognises 'when is my turn' in three languages", () => {
    expect(detectIntent("ਮੇਰੀ ਵਾਰੀ ਕਦੋਂ ਹੈ").intent).toBe("turn");
    expect(detectIntent("मेरी बारी कब आएगी").intent).toBe("turn");
    expect(detectIntent("how long is my wait in the queue").intent).toBe("turn");
  });
  it("recognises 'where is my money'", () => {
    expect(detectIntent("ਮੇਰੇ ਪੈਸੇ ਕਿੱਥੇ ਹਨ").intent).toBe("money");
    expect(detectIntent("मेरा भुगतान कहाँ है").intent).toBe("money");
    expect(detectIntent("has my payment been credited").intent).toBe("money");
  });
  it("recognises a rate question and the crop named", () => {
    expect(detectIntent("ਕਣਕ ਦਾ ਭਾਅ ਕੀ ਹੈ")).toMatchObject({ intent: "rate", crop: "Wheat" });
    expect(detectIntent("what is the paddy rate today")).toMatchObject({ intent: "rate", crop: "Paddy" });
    expect(detectIntent("आज मंडी का भाव").intent).toBe("rate");
  });
  it("returns unknown for something unrelated, and offers a prompt", () => {
    expect(detectIntent("hello there").intent).toBe("unknown");
    expect(unknownPrompt("hi")).toContain("भाव");
  });
  it("does not crash on empty input", () => {
    expect(detectIntent("").intent).toBe("unknown");
  });
});
