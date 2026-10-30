import { describe, it, expect } from "vitest";
import {
  PLATES,
  PLATE_INTRO,
  plateOfDay,
  renderPlate,
  platesFor,
  nextPlate,
} from "../src/content_plates";
import { BREATHING, renderBreathing } from "../src/content_breathing";

const BANNED = /лечит|заживл|снимает воспален|протокол|ккал|белка|грамм|диагноз|терап/i;
const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;

describe("PLATES", () => {
  it("≥ 14 тарелок, id уникальны", () => {
    expect(PLATES.length).toBeGreaterThanOrEqual(14);
    expect(new Set(PLATES.map((p) => p.id)).size).toBe(PLATES.length);
  });

  it("каждый приём пищи ≥ 3 тарелок", () => {
    for (const m of MEALS) expect(platesFor(m).length).toBeGreaterThanOrEqual(3);
  });

  it("поля в рамках: 4–7 ингредиентов (перекус ≥ 3), how ≤ 200", () => {
    for (const p of PLATES) {
      expect(p.items.length).toBeGreaterThanOrEqual(p.meal === "snack" ? 3 : 4);
      expect(p.items.length).toBeLessThanOrEqual(7);
      expect(p.how.length).toBeLessThanOrEqual(200);
    }
  });

  it("plateOfDay детерминирована и покрывает ≥ 10 тарелок за 60 дней", () => {
    const seen = new Set<string>();
    const start = Date.UTC(2026, 0, 1);
    for (let i = 0; i < 60; i++) {
      const iso = new Date(start + i * 86400000).toISOString().slice(0, 10);
      const a = plateOfDay(iso);
      expect(a).not.toBeNull();
      expect(plateOfDay(iso)).toBe(a);
      seen.add(a!.id);
    }
    expect(seen.size).toBeGreaterThanOrEqual(10);
  });

  it("renderPlate не пропускает сырой < из контента", () => {
    const evil = {
      id: "x",
      meal: "lunch" as const,
      title: "A <b>&</b>",
      items: ["1 < 2", "a & b"],
      how: "<script>",
    };
    const out = renderPlate(evil);
    expect(out).toContain("A &lt;b&gt;&amp;&lt;/b&gt;");
    expect(out).toContain("1 &lt; 2");
    expect(out).not.toContain("<script>");
    // реальный контент: все < — только наши теги
    for (const p of PLATES) {
      const html = renderPlate(p);
      const stripped = html.replace(/<\/?(b|i)>/g, "");
      expect(stripped).not.toMatch(/[<>]/);
    }
  });

  it("нет запрещённых слов в тарелках, интро и дыхании", () => {
    const texts: string[] = [PLATE_INTRO];
    for (const p of PLATES) texts.push(p.title, ...p.items, p.how);
    for (const t of BREATHING) texts.push(t.title, t.pattern, t.guide);
    for (const s of texts) expect(s).not.toMatch(BANNED);
  });

  it("PLATE_INTRO заканчивается дисклеймером", () => {
    expect(PLATE_INTRO.endsWith("Это не медицинская рекомендация — ориентир для спокойного питания.")).toBe(true);
  });

  it("nextPlate идёт по кругу внутри приёма пищи", () => {
    for (const m of MEALS) {
      const list = platesFor(m);
      expect(nextPlate(m, list[0].id).id).toBe(list[1].id);
      expect(nextPlate(m, list[list.length - 1].id).id).toBe(list[0].id);
      expect(nextPlate(m, "нет-такого").id).toBe(list[0].id);
    }
  });
});

describe("BREATHING", () => {
  it("5 техник, id уникальны, гид и схема непусты", () => {
    expect(BREATHING).toHaveLength(5);
    expect(new Set(BREATHING.map((t) => t.id)).size).toBe(5);
    for (const t of BREATHING) {
      expect(t.pattern.length).toBeGreaterThan(0);
      expect(renderBreathing(t)).toContain(t.title);
      expect(t.guide).toMatch(/Если закружилась голова/);
    }
  });

  it("callback_data укладывается в 64 байта", () => {
    for (const t of BREATHING) expect(`br:${t.id}`.length).toBeLessThanOrEqual(64);
    for (const p of PLATES) expect(`plate:next:${p.meal}:${p.id}`.length).toBeLessThanOrEqual(64);
  });
});
