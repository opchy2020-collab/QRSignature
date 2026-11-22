// QR code encoder (ISO/IEC 18004). Turns text into a grid of dark and light modules.
//
// What it does, in order:
//   1. Turn the text into bytes (UTF-8) and pack them with a mode header.
//   2. Pick the smallest version (size) that fits.
//   3. Add Reed-Solomon error-correction codewords and interleave the blocks.
//   4. Draw the fixed patterns, place the data, try all 8 masks and keep the best.
//
// It always uses "byte mode", which can hold any text. That keeps this file small and
// predictable. The result is checked in tests by decoding it with a real QR reader.

export type Ecc = "L" | "M" | "Q" | "H";

export const ECC_LEVELS: readonly Ecc[] = ["L", "M", "Q", "H"];

export interface QrMatrix {
  /** 1 to 40. Version 1 is 21 x 21 modules, each step adds 4. */
  version: number;
  /** Width and height in modules. */
  size: number;
  /** The error-correction level that was actually used. */
  ecc: Ecc;
  /** The mask pattern (0 to 7) that was chosen. */
  mask: number;
  /** modules[y][x] is true for a dark module. */
  modules: boolean[][];
}

export class QrTooLongError extends Error {
  constructor(message = "That is too much content for one QR code.") {
    super(message);
    this.name = "QrTooLongError";
  }
}

export interface EncodeOptions {
  /** Smallest version to try (default 1). */
  minVersion?: number;
  /** Largest version to try (default 40). */
  maxVersion?: number;
  /** If true, raise the error-correction level when it fits in the same version (default false). */
  boostEcc?: boolean;
  /** Force one mask pattern (0 to 7) instead of picking the best. Used by tests. */
  forceMask?: number;
}

// ---- Tables (from the standard) --------------------------------------------------------------

/** Error-correction codewords per block, indexed [level][version]. Index 0 is unused. */
const ECC_CODEWORDS_PER_BLOCK: Record<Ecc, readonly number[]> = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};

/** Number of error-correction blocks, indexed [level][version]. Index 0 is unused. */
const NUM_ERROR_CORRECTION_BLOCKS: Record<Ecc, readonly number[]> = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

/** The two format bits that stand for each level. */
const ECC_FORMAT_BITS: Record<Ecc, number> = { L: 1, M: 0, Q: 3, H: 2 };

// ---- Sizes and capacity ----------------------------------------------------------------------

export function sizeOfVersion(version: number): number {
  return version * 4 + 17;
}

/** Number of modules that can hold data or error correction (everything but the fixed patterns). */
function numRawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

/** Number of data codewords (bytes) for a version and level, after error correction is taken out. */
export function numDataCodewords(version: number, ecc: Ecc): number {
  return (
    Math.floor(numRawDataModules(version) / 8) -
    (ECC_CODEWORDS_PER_BLOCK[ecc][version] as number) *
      (NUM_ERROR_CORRECTION_BLOCKS[ecc][version] as number)
  );
}

function charCountBits(version: number): number {
  return version <= 9 ? 8 : 16; // byte mode
}

/** How many text bytes fit in a version at a level. */
export function byteCapacity(version: number, ecc: Ecc): number {
  const bits = numDataCodewords(version, ecc) * 8 - 4 - charCountBits(version);
  return Math.max(0, Math.floor(bits / 8));
}

/** The smallest version that fits this many bytes, or null if none does. */
export function smallestVersionFor(byteLength: number, ecc: Ecc, min = 1, max = 40): number | null {
  for (let v = min; v <= max; v++) {
    if (byteCapacity(v, ecc) >= byteLength) return v;
  }
  return null;
}

// ---- Reed-Solomon over GF(256) ---------------------------------------------------------------

function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree: number): number[] {
  const result: number[] = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j] as number, root);
      if (j + 1 < result.length) result[j] = (result[j] as number) ^ (result[j + 1] as number);
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function rsRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result: number[] = divisor.map(() => 0);
  for (const byte of data) {
    const factor = byte ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] = (result[i] as number) ^ gfMultiply(coef, factor);
    });
  }
  return result;
}

// ---- Building the data bytes -----------------------------------------------------------------

function appendBits(bits: number[], value: number, length: number): void {
  for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
}

function makeDataCodewords(bytes: Uint8Array, version: number, ecc: Ecc): number[] {
  const bits: number[] = [];
  appendBits(bits, 0b0100, 4); // byte mode
  appendBits(bits, bytes.length, charCountBits(version));
  for (const b of bytes) appendBits(bits, b, 8);

  const capacityBits = numDataCodewords(version, ecc) * 8;
  appendBits(bits, 0, Math.min(4, capacityBits - bits.length)); // terminator
  appendBits(bits, 0, (8 - (bits.length % 8)) % 8); // pad to whole bytes

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] as number);
    codewords.push(byte);
  }
  for (let pad = 0xec; codewords.length < capacityBits / 8; pad ^= 0xec ^ 0x11) codewords.push(pad);
  return codewords;
}

function addEccAndInterleave(data: readonly number[], version: number, ecc: Ecc): number[] {
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecc][version] as number;
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecc][version] as number;
  const rawCodewords = Math.floor(numRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const blocks: number[][] = [];
  const divisor = rsDivisor(blockEccLen);
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
    k += dat.length;
    const eccBytes = rsRemainder(dat, divisor);
    if (i < numShortBlocks) dat.push(0); // placeholder so all blocks line up
    blocks.push(dat.concat(eccBytes));
  }

  const result: number[] = [];
  const first = blocks[0] as number[];
  for (let i = 0; i < first.length; i++) {
    blocks.forEach((block, j) => {
      // Skip the placeholder byte of the short blocks.
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i] as number);
    });
  }
  return result;
}

// ---- Drawing the grid ------------------------------------------------------------------------

function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const size = sizeOfVersion(version);
  const step =
    version === 32 ? 26 : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

function formatBits(ecc: Ecc, mask: number): number {
  const data = (ECC_FORMAT_BITS[ecc] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function versionBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

function maskApplies(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

class Grid {
  readonly size: number;
  readonly modules: boolean[][];
  private readonly reserved: boolean[][];

  constructor(readonly version: number) {
    this.size = sizeOfVersion(version);
    const blank = () =>
      Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.modules = blank();
    this.reserved = blank();
    this.drawFixedPatterns();
  }

  private setFunction(x: number, y: number, dark: boolean): void {
    this.modules[y]![x] = dark;
    this.reserved[y]![x] = true;
  }

  private drawFixedPatterns(): void {
    const { size, version } = this;
    // Timing patterns.
    for (let i = 0; i < size; i++) {
      this.setFunction(6, i, i % 2 === 0);
      this.setFunction(i, 6, i % 2 === 0);
    }
    // Finder patterns with their light separators.
    this.drawFinder(3, 3);
    this.drawFinder(size - 4, 3);
    this.drawFinder(3, size - 4);
    // Alignment patterns (skipping the three corners that hold finders).
    const pos = alignmentPositions(version);
    pos.forEach((cx, i) => {
      pos.forEach((cy, j) => {
        const onFinder =
          (i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0);
        if (!onFinder) this.drawAlignment(cx, cy);
      });
    });
    // Reserve the format and version areas (real bits are drawn later).
    this.drawFormat("L", 0, true);
    this.drawVersion();
  }

  private drawFinder(cx: number, cy: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < this.size && y >= 0 && y < this.size) {
          this.setFunction(x, y, dist !== 2 && dist !== 4);
        }
      }
    }
  }

  private drawAlignment(cx: number, cy: number): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setFunction(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  private drawVersion(): void {
    if (this.version < 7) return;
    const bits = versionBits(this.version);
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) !== 0;
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFunction(a, b, dark);
      this.setFunction(b, a, dark);
    }
  }

  drawFormat(ecc: Ecc, mask: number, reserveOnly = false): void {
    const bits = reserveOnly ? 0 : formatBits(ecc, mask);
    const bit = (i: number) => ((bits >>> i) & 1) !== 0;
    const { size } = this;
    for (let i = 0; i <= 5; i++) this.setFunction(8, i, bit(i));
    this.setFunction(8, 7, bit(6));
    this.setFunction(8, 8, bit(7));
    this.setFunction(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.setFunction(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) this.setFunction(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.setFunction(8, size - 15 + i, bit(i));
    this.setFunction(8, size - 8, true); // the one always-dark module
  }

  placeData(codewords: readonly number[]): void {
    const { size } = this;
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!this.reserved[y]![x] && i < codewords.length * 8) {
            this.modules[y]![x] = ((codewords[i >>> 3] as number) >>> (7 - (i & 7)) & 1) !== 0;
            i++;
          }
        }
      }
    }
  }

  /** Flips every data module covered by the mask. Calling it twice undoes it. */
  applyMask(mask: number): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (!this.reserved[y]![x] && maskApplies(mask, x, y)) {
          this.modules[y]![x] = !this.modules[y]![x];
        }
      }
    }
  }

  penalty(): number {
    const { size, modules } = this;
    let result = 0;

    // Rule 1: runs of five or more same-coloured modules, in rows and columns.
    for (const byRow of [true, false]) {
      for (let a = 0; a < size; a++) {
        let run = 1;
        for (let b = 1; b <= size; b++) {
          const same =
            b < size &&
            (byRow ? modules[a]![b] === modules[a]![b - 1] : modules[b]![a] === modules[b - 1]![a]);
          if (same) {
            run++;
          } else {
            if (run >= 5) result += 3 + (run - 5);
            run = 1;
          }
        }
      }
    }

    // Rule 2: 2 x 2 blocks of one colour.
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = modules[y]![x];
        if (c === modules[y]![x + 1] && c === modules[y + 1]![x] && c === modules[y + 1]![x + 1]) {
          result += 3;
        }
      }
    }

    // Rule 3: patterns that look like a finder (dark-light-dark-dark-dark-light-dark with a light gap).
    const patA = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    const patB = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    for (const byRow of [true, false]) {
      for (let a = 0; a < size; a++) {
        for (let b = 0; b + 11 <= size; b++) {
          let matchA = true;
          let matchB = true;
          for (let k = 0; k < 11 && (matchA || matchB); k++) {
            const v = (byRow ? modules[a]![b + k] : modules[b + k]![a]) ? 1 : 0;
            if (v !== patA[k]) matchA = false;
            if (v !== patB[k]) matchB = false;
          }
          if (matchA) result += 40;
          if (matchB) result += 40;
        }
      }
    }

    // Rule 4: balance of dark and light modules.
    let dark = 0;
    for (const row of modules) for (const m of row) if (m) dark++;
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += Math.max(0, k) * 10;
    return result;
  }
}

// ---- Public function -------------------------------------------------------------------------

export function encodeText(text: string, ecc: Ecc = "M", options: EncodeOptions = {}): QrMatrix {
  const minVersion = Math.max(1, options.minVersion ?? 1);
  const maxVersion = Math.min(40, options.maxVersion ?? 40);
  const bytes = new TextEncoder().encode(text);

  const version = smallestVersionFor(bytes.length, ecc, minVersion, maxVersion);
  if (version === null) throw new QrTooLongError();

  let level = ecc;
  if (options.boostEcc) {
    for (const candidate of ["M", "Q", "H"] as const) {
      if (ECC_LEVELS.indexOf(candidate) > ECC_LEVELS.indexOf(level) && byteCapacity(version, candidate) >= bytes.length) {
        level = candidate;
      }
    }
  }

  const data = makeDataCodewords(bytes, version, level);
  const all = addEccAndInterleave(data, version, level);

  const grid = new Grid(version);
  grid.placeData(all);

  let bestMask = 0;
  let bestPenalty = Infinity;
  const candidates =
    options.forceMask === undefined ? [0, 1, 2, 3, 4, 5, 6, 7] : [options.forceMask & 7];
  for (const mask of candidates) {
    grid.applyMask(mask);
    grid.drawFormat(level, mask);
    const p = grid.penalty();
    if (p < bestPenalty) {
      bestPenalty = p;
      bestMask = mask;
    }
    grid.applyMask(mask); // undo
  }
  grid.applyMask(bestMask);
  grid.drawFormat(level, bestMask);

  return { version, size: grid.size, ecc: level, mask: bestMask, modules: grid.modules };
}

/** True if the module at (x, y) belongs to one of the three big corner squares. */
export function isFinderModule(size: number, x: number, y: number): boolean {
  return (
    (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7)
  );
}

// ---- Self check (used by tests) --------------------------------------------------------------

export interface SelfCheckResult {
  /** True when every block's error-correction bytes match its data bytes. */
  eccOk: boolean;
  /** The text read back out of the grid. */
  text: string;
}

/**
 * Reads a finished grid back: undoes the mask, collects the codewords, checks every
 * block's error-correction bytes and parses the text. Tests use it to prove the encoder
 * produces a self-consistent code for every version and level.
 */
export function selfCheck(matrix: QrMatrix): SelfCheckResult {
  const { version, ecc, size } = matrix;
  const grid = new Grid(version);
  const reserved = (x: number, y: number) =>
    (grid as unknown as { reserved: boolean[][] }).reserved[y]![x] as boolean;
  const work = matrix.modules.map((row) => row.slice());
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!reserved(x, y) && maskApplies(matrix.mask, x, y)) work[y]![x] = !work[y]![x];
    }
  }

  const rawCodewords = Math.floor(numRawDataModules(version) / 8);
  const bytes: number[] = new Array(rawCodewords).fill(0);
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!reserved(x, y) && bitIndex < rawCodewords * 8) {
          if (work[y]![x]) bytes[bitIndex >>> 3] = (bytes[bitIndex >>> 3] as number) | (0x80 >>> (bitIndex & 7));
          bitIndex++;
        }
      }
    }
  }

  // Undo the interleaving.
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecc][version] as number;
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecc][version] as number;
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const blocks: number[][] = Array.from({ length: numBlocks }, () => []);
  let k = 0;
  for (let i = 0; i < shortBlockLen + 1; i++) {
    for (let j = 0; j < numBlocks; j++) {
      // Short blocks have no byte at this position (the placeholder is skipped).
      if (i === shortBlockLen - blockEccLen && j < numShortBlocks) continue;
      (blocks[j] as number[]).push(bytes[k++] as number);
    }
  }

  let eccOk = true;
  const dataBytes: number[] = [];
  const divisor = rsDivisor(blockEccLen);
  for (const block of blocks) {
    const data = block.slice(0, block.length - blockEccLen);
    const eccPart = block.slice(block.length - blockEccLen);
    const expected = rsRemainder(data, divisor);
    if (expected.some((v, i) => v !== eccPart[i])) eccOk = false;
    dataBytes.push(...data);
  }

  // Parse: 4-bit mode, character count, then bytes.
  const bits: number[] = [];
  for (const b of dataBytes) appendBits(bits, b, 8);
  const read = (from: number, n: number) => {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | (bits[from + i] as number);
    return v;
  };
  if (read(0, 4) !== 0b0100) return { eccOk, text: "" };
  const countBits = charCountBits(version);
  const count = read(4, countBits);
  const out = new Uint8Array(count);
  for (let i = 0; i < count; i++) out[i] = read(4 + countBits + i * 8, 8);
  return { eccOk, text: new TextDecoder().decode(out) };
}
