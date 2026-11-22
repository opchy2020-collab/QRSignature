import { test } from "node:test";
import assert from "node:assert/strict";
import { byteCapacity, ECC_LEVELS, encodeText, isFinderModule, QrTooLongError, selfCheck, sizeOfVersion, smallestVersionFor } from "../src/ts/qr/encoder";

test("capacity matches the QR standard (byte mode)", () => {
  const table: Record<number, [number, number, number, number]> = { 1: [17, 14, 11, 7], 10: [271, 213, 151, 119], 40: [2953, 2331, 1663, 1273] };
  for (const [version, caps] of Object.entries(table)) {
    ECC_LEVELS.forEach((level, i) => assert.equal(byteCapacity(Number(version), level), caps[i], `v${version} ${level}`));
  }
  assert.equal(sizeOfVersion(1), 21);
  assert.equal(sizeOfVersion(40), 177);
});

test("smallest version", () => {
  assert.equal(smallestVersionFor(1, "L"), 1);
  assert.equal(smallestVersionFor(18, "L"), 2);
  assert.equal(smallestVersionFor(10000, "L"), null);
});

test("encoding gives a square matrix with the three finder patterns", () => {
  const m = encodeText("https://example.com", "M");
  assert.equal(m.modules.length, m.size);
  assert.equal(m.size, sizeOfVersion(m.version));
  for (const row of m.modules) assert.equal(row.length, m.size);
  // Top-left finder: a dark 7x7 ring with a dark 3x3 centre.
  for (let i = 0; i < 7; i++) {
    assert.equal(m.modules[0]![i], true);
    assert.equal(m.modules[6]![i], true);
    assert.equal(m.modules[i]![0], true);
    assert.equal(m.modules[i]![6], true);
  }
  assert.equal(m.modules[3]![3], true);
  assert.equal(m.modules[1]![1], false);
  assert.equal(isFinderModule(m.size, 0, 0), true);
  assert.equal(isFinderModule(m.size, 10, 10), false);
});

test("self-check: every level and many lengths decode back to the same text", () => {
  const samples = ["a", "https://example.com", "WIFI:T:WPA;S:Cafe;P:12345678;;", "Hello ✓ 你好 😀", "x".repeat(200), "https://example.com/" + "q".repeat(700)];
  for (const text of samples) {
    for (const level of ECC_LEVELS) {
      let m;
      try {
        m = encodeText(text, level);
      } catch (error) {
        assert.ok(error instanceof QrTooLongError);
        continue;
      }
      const r = selfCheck(m);
      assert.equal(r.eccOk, true, `${level} ${text.slice(0, 20)}`);
      assert.equal(r.text, text, `${level} ${text.slice(0, 20)}`);
    }
  }
});

test("forcing each mask still decodes (all 8 masks are correct)", () => {
  for (let mask = 0; mask < 8; mask++) {
    const m = encodeText("https://example.com/menu", "Q", { forceMask: mask });
    assert.equal(m.mask, mask);
    assert.equal(selfCheck(m).text, "https://example.com/menu", `mask ${mask}`);
  }
});

test("too much data is reported, not hidden", () => {
  assert.throws(() => encodeText("x".repeat(3000), "L"), QrTooLongError);
  assert.throws(() => encodeText("x".repeat(1300), "H"), QrTooLongError);
  assert.doesNotThrow(() => encodeText("x".repeat(2953), "L"));
});

test("boostEcc raises the level only when it costs no extra size", () => {
  const plain = encodeText("hi", "L");
  const boosted = encodeText("hi", "L", { boostEcc: true });
  assert.equal(boosted.version, plain.version);
  assert.notEqual(boosted.ecc, "L");
  const full = encodeText("x".repeat(2953), "L", { boostEcc: true });
  assert.equal(full.ecc, "L");
});

test("the same text always gives the same code", () => {
  const a = encodeText("https://example.com", "M");
  const b = encodeText("https://example.com", "M");
  assert.deepEqual(a.modules, b.modules);
});
