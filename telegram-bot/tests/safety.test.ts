import { describe, it, expect } from "vitest";
import { EXERCISES, BLOCKS, SITUATIONS, renderBlock, renderAbsList } from "../src/content";
import {
  STAGE_BANNED,
  BAN_REASON,
  filterSafe,
  substituteFor,
  sanitizeIds,
} from "../src/safety";

describe("protocol safety (мозаикопластика, ~6 мес.)", () => {
  it("ни один BLOCKS не содержит запрещённых кодов", () => {
    for (const [name, ids] of Object.entries(BLOCKS)) {
      for (const id of ids) {
        expect(STAGE_BANNED.has(id), `BLOCKS.${name} → ${id}`).toBe(false);
      }
    }
  });

  it("ни одна ситуация (ids / pool) не содержит запрещённых кодов и существующих кодов-призраков", () => {
    for (const s of SITUATIONS) {
      for (const id of [...(s.ids ?? []), ...(s.pool ?? [])]) {
        expect(STAGE_BANNED.has(id), `${s.code} → ${id}`).toBe(false);
        expect(EXERCISES[id], `${s.code} → ${id} не существует`).toBeDefined();
      }
      expect(new Set(s.pool ?? []).size, `${s.code}: дубли в pool`).toBe((s.pool ?? []).length);
    }
    for (const [name, ids] of Object.entries(BLOCKS)) {
      for (const id of ids) expect(EXERCISES[id], `BLOCKS.${name} → ${id}`).toBeDefined();
    }
  });

  it("каждый запрещённый код есть в EXERCISES и имеет причину", () => {
    for (const code of STAGE_BANNED) {
      expect(EXERCISES[code], code).toBeDefined();
      expect(BAN_REASON[code], code).toBeTruthy();
    }
  });

  it("filterSafe убирает запрещённые", () => {
    expect(filterSafe(["ST3", "ST1"])).toEqual(["ST1"]);
    expect(filterSafe(["ST3", "F2", "S6", "ST2"])).toEqual([]);
  });

  it("substituteFor даёт существующий безопасный код", () => {
    expect(substituteFor("ST3")).toBe("ST1");
    expect(substituteFor("F2")).toBe("F1");
    expect(substituteFor("S6")).toBe("S3");
    expect(substituteFor("ST2")).toBe("R4");
    expect(substituteFor("L1")).toBeNull();
    for (const code of STAGE_BANNED) {
      const sub = substituteFor(code);
      expect(sub, `нет замены для ${code}`).not.toBeNull();
      expect(EXERCISES[sub!], `${code} → ${sub}`).toBeDefined();
      expect(STAGE_BANNED.has(sub!), `${code} → ${sub} сам запрещён`).toBe(false);
    }
  });

  it("sanitizeIds добирает заменами до 2 без дублей", () => {
    expect(sanitizeIds(["ST3", "ST2"], 2).ids).toEqual(["ST1", "R4"]);
    expect(sanitizeIds(["ST3", "ST1"], 2).ids).toEqual(["ST1"]); // замена ST1 уже есть → дубль не добавляем
    expect(sanitizeIds(["ST3", "ST1", "ST4"], 2).ids).toEqual(["ST1", "ST4"]);
    expect(sanitizeIds(["ST3", "ST1"], 2).removed).toEqual(["ST3"]);
  });

  it("renderBlock никогда не рисует запрещённое", () => {
    const txt = renderBlock(["ST3", "F2", "ST1"]);
    expect(txt).not.toContain(EXERCISES.ST3.name);
    expect(txt).not.toContain(EXERCISES.F2.name);
    expect(txt).toContain(EXERCISES.ST1.name);
  });

  it("список упражнений на пресс не содержит резинки и подъёма колена стоя", () => {
    const txt = renderAbsList();
    expect(txt).not.toMatch(/резинк/i);
    expect(txt).not.toContain(EXERCISES.AB3.name);
  });

  it("регэксп-сеть по name+how: всё подозрительное — в STAGE_BANNED", () => {
    // «носок на себя / от себя» (помпа стопой) РАЗРЕШЕНА протоколом — это не подъём
    // на носок, поэтому эту фразу вырезаем перед проверкой. Запрещён «на носок/
    // на носки» (подъём на передний отдел стопы), «пятки вверх», икры и т.п.
    // «(?<![а-яё])икр» — чтобы не ловить «микро».
    const SAFE_PHRASE = /носок на себя(\s*\/\s*от себя)?/gi;
    const SUSPICIOUS =
      /носок|носки|(?<![а-яё])икр|пятки вверх|поднял пятки|одной ноге|1 нога|баланс|перенос веса|прыж|резинк|эспандер/i;
    const offenders: string[] = [];
    for (const [code, ex] of Object.entries(EXERCISES)) {
      const text = `${ex.name} ${ex.how}`.replace(SAFE_PHRASE, "");
      if (SUSPICIOUS.test(text) && !STAGE_BANNED.has(code)) offenders.push(`${code}: ${ex.name} — ${ex.how}`);
    }
    expect(offenders).toEqual([]);
  });
});
