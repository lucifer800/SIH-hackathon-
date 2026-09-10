import { describe, it, expect } from "vitest";
import { render, TEMPLATES, MissingTemplateVarError } from "../src/i18n/templates.js";

const LANGS = ["pa", "hi", "en"] as const;

describe("message templates", () => {
  it("exists in all three languages — the deck says language is a first-class toggle", () => {
    for (const def of Object.values(TEMPLATES)) {
      for (const lang of LANGS) {
        expect(def.body[lang], `${def.id}.${lang}`).toBeTruthy();
        expect(def.category[lang], `${def.id} category ${lang}`).toBeTruthy();
      }
    }
  });

  it("declares every variable its body actually uses", () => {
    for (const def of Object.values(TEMPLATES)) {
      for (const lang of LANGS) {
        const used = [...def.body[lang].matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
        for (const v of used) {
          expect(def.vars, `${def.id}.${lang} uses {${v}}`).toContain(v);
        }
      }
    }
  });

  it("renders the deck's booking SMS", () => {
    const r = render("booking_confirmed", "hi", {
      centre: "नाभा केंद्र", date: "14 अप्रैल", window: "11:00–13:00", gateOtp: "4417",
    });
    expect(r.body).toBe("पर्ची पक्की — नाभा केंद्र, 14 अप्रैल, 11:00–13:00. गेट OTP 4417.");
    expect(r.category).toBe("बुकिंग");
  });

  it("renders the deck's queue SMS", () => {
    expect(render("queue_five_away", "hi", { ahead: 5, lane: 3 }).body)
      .toBe("आपका नंबर 5 गाड़ी बाद. कृपया लेन 3 पर पहुँचें.");
  });

  it("throws rather than sending a farmer an unrendered placeholder", () => {
    expect(() => render("booking_confirmed", "pa", { centre: "ਜਗਰਾਓਂ" }))
      .toThrow(MissingTemplateVarError);
  });

  it("never leaves an unrendered brace when vars are complete", () => {
    for (const def of Object.values(TEMPLATES)) {
      const vars = Object.fromEntries(def.vars.map((v) => [v, "X"]));
      for (const lang of LANGS) {
        expect(render(def.id, lang, vars).body).not.toMatch(/\{|\}/);
      }
    }
  });
});
