const makeBitWriter = () => {
  const bits = [];
  const writeBits = (value, bitCount) => {
    for (let i = bitCount - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  const writeBit = (bit) => {
    bits.push(bit ? 1 : 0);
  };
  const writeGamma = (x) => {
    if (x <= 0 || !Number.isInteger(x))
      throw new Error('Gamma code requires positive integer');
    const bin = x.toString(2);
    const len = bin.length;
    for (let i = 0; i < len - 1; i++) writeBit(0);
    writeBit(1);
    for (let i = 1; i < len; i++) writeBit(bin[i] === '1' ? 1 : 0);
  };
  const toBase64Url = () => {
    const pad = (6 - (bits.length % 6)) % 6;
    for (let i = 0; i < pad; i++) bits.push(0);
    const alphabet =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let out = '';
    for (let i = 0; i < bits.length; i += 6) {
      let v = 0;
      for (let j = 0; j < 6; j++) v = (v << 1) | bits[i + j];
      out += alphabet[v];
    }
    return out;
  };
  return { bits, writeBits, writeBit, writeGamma, toBase64Url };
};

const makeBitReader = (b64url) => {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const map = new Map();
  for (let i = 0; i < alphabet.length; i++) map.set(alphabet[i], i);
  const bits = [];
  for (let i = 0; i < b64url.length; i++) {
    const ch = b64url[i];
    if (!map.has(ch)) throw new Error('Invalid base64url char: ' + ch);
    let v = map.get(ch);
    for (let j = 5; j >= 0; j--) bits.push((v >>> j) & 1);
  }
  let idx = 0;
  const readBit = () => {
    if (idx >= bits.length) throw new Error('Unexpected end of bits');
    return bits[idx++];
  };
  const readBits = (bitCount) => {
    let v = 0;
    for (let i = 0; i < bitCount; i++) v = (v << 1) | readBit();
    return v >>> 0;
  };
  const readGamma = () => {
    let zeros = 0;
    while (true) {
      const b = readBit();
      if (b === 0) zeros++;
      else break;
    }
    let v = 1;
    for (let i = 0; i < zeros; i++) v = (v << 1) | readBit();
    return v;
  };
  return { readBit, readBits, readGamma };
};

const naiveJoin = (arr) => arr.join(',');
const sortNumeric = (a, b) => a - b;
const validateInput = (arr) => {
  if (!Array.isArray(arr)) throw new Error('Input must be an array');
  if (arr.length < 5 || arr.length > 1000)
    throw new Error('Array length must be in [5, 1000]');
  for (const x of arr)
    if (!Number.isInteger(x) || x < 1 || x > 300)
      throw new Error('Values must be integers in [1, 300]');
};

const encodePairs = (arr) => {
  const freq = new Map();
  for (const v of arr) freq.set(v, (freq.get(v) || 0) + 1);
  const pairs = Array.from(freq.entries()).sort((a, b) => a[0] - b[0]);
  const bw = makeBitWriter();
  bw.writeBits(0, 2);
  bw.writeGamma(pairs.length);
  for (const [value, count] of pairs) {
    bw.writeBits(value - 1, 9);
    bw.writeGamma(count);
  }
  return bw.toBase64Url();
};

const decodePairs = (b64) => {
  const br = makeBitReader(b64);
  const mode = br.readBits(2);
  if (mode !== 0) throw new Error('Wrong mode for pairs');
  const k = br.readGamma();
  const out = [];
  for (let i = 0; i < k; i++) {
    const value = br.readBits(9) + 1;
    const count = br.readGamma();
    for (let c = 0; c < count; c++) out.push(value);
  }
  return out;
};

const encodeDeltas = (arr) => {
  const freq = new Map();
  for (const v of arr) freq.set(v, (freq.get(v) || 0) + 1);
  const pairs = Array.from(freq.entries()).sort((a, b) => a[0] - b[0]);
  const bw = makeBitWriter();
  bw.writeBits(1, 2);
  bw.writeGamma(pairs.length);
  const [firstVal, firstCnt] = pairs[0];
  bw.writeBits(firstVal - 1, 9);
  bw.writeGamma(firstCnt);
  for (let i = 1; i < pairs.length; i++) {
    const [val, cnt] = pairs[i];
    const prevVal = pairs[i - 1][0];
    const delta = val - prevVal;
    bw.writeGamma(delta);
    bw.writeGamma(cnt);
  }
  return bw.toBase64Url();
};

const decodeDeltas = (b64) => {
  const br = makeBitReader(b64);
  const mode = br.readBits(2);
  if (mode !== 1) throw new Error('Wrong mode for deltas');
  const k = br.readGamma();
  const out = [];
  let prevVal = br.readBits(9) + 1;
  let cnt = br.readGamma();
  for (let c = 0; c < cnt; c++) out.push(prevVal);
  for (let i = 1; i < k; i++) {
    const delta = br.readGamma();
    const val = prevVal + delta;
    cnt = br.readGamma();
    for (let c = 0; c < cnt; c++) out.push(val);
    prevVal = val;
  }
  return out;
};

const encodeFixedWidth = (arr) => {
  let max = 0;
  for (const v of arr) if (v > max) max = v;
  let width, sel;
  if (max <= 9) {
    width = 4;
    sel = 0;
  } else if (max <= 99) {
    width = 7;
    sel = 1;
  } else {
    width = 9;
    sel = 2;
  }
  const bw = makeBitWriter();
  bw.writeBits(2, 2);
  bw.writeBits(sel, 2);
  bw.writeGamma(arr.length);
  for (const v of arr) bw.writeBits(v - 1, width);
  return bw.toBase64Url();
};

const decodeFixedWidth = (b64) => {
  const br = makeBitReader(b64);
  const mode = br.readBits(2);
  if (mode !== 2) throw new Error('Wrong mode for fixed');
  const sel = br.readBits(2);
  const width = sel === 0 ? 4 : sel === 1 ? 7 : 9;
  const n = br.readGamma();
  const out = [];
  for (let i = 0; i < n; i++) out.push(br.readBits(width) + 1);
  return out;
};

const serialize = (numbers) => {
  validateInput(numbers);
  const sPairs = encodePairs(numbers);
  const sDeltas = encodeDeltas(numbers);
  const sFixed = encodeFixedWidth(numbers);
  return [sPairs, sDeltas, sFixed].reduce((a, b) =>
    a.length <= b.length ? a : b
  );
};

const deserialize = (s) => {
  if (typeof s !== 'string' || s.length === 0) throw new Error('Invalid input');
  const br = makeBitReader(s);
  const modeBits = br.readBits(2);
  if (modeBits === 0) return decodePairs(s);
  if (modeBits === 1) return decodeDeltas(s);
  if (modeBits === 2) return decodeFixedWidth(s);
  throw new Error('Unknown mode');
};

const uniqueShuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};
const makeRandomArray = (n) => {
  const out = [];
  for (let i = 0; i < n; i++) out.push(1 + Math.floor(Math.random() * 300));
  return out;
};
const ratio = (origStr, compStr) =>
  (origStr.length / compStr.length).toFixed(2);

const runTestCase = (name, arr) => {
  const orig = naiveJoin(arr);
  const enc = serialize(arr);
  const dec = deserialize(enc);
  const a1 = arr.slice().sort(sortNumeric);
  const a2 = dec.slice().sort(sortNumeric);
  if (a1.length !== a2.length || a1.some((v, i) => v !== a2[i]))
    throw new Error('Mismatch after roundtrip for test: ' + name);
  return {
    name,
    origLen: orig.length,
    compLen: enc.length,
    compression: ratio(orig, enc),
    enc,
  };
};

const runAllTests = () => {
  const tests = [];
  tests.push(runTestCase('short-5-distinct', [1, 3, 7, 8, 9]));
  tests.push(runTestCase('short-5-duplicates', [5, 5, 5, 6, 6]));
  tests.push(runTestCase('random-50', makeRandomArray(50)));
  tests.push(runTestCase('random-100', makeRandomArray(100)));
  tests.push(runTestCase('random-500', makeRandomArray(500)));
  tests.push(runTestCase('random-1000', makeRandomArray(1000)));
  {
    const arr = [];
    for (let i = 1; i <= 9; i++) arr.push(i);
    while (arr.length < 5) arr.push(1);
    tests.push(runTestCase('all-1-digit', arr));
  }
  {
    const arr = [];
    for (let i = 10; i <= 99; i++) arr.push(i);
    const limited = arr.slice(0, Math.min(arr.length, 1000));
    tests.push(runTestCase('all-2-digit-subset', limited));
  }
  {
    const arr = [];
    for (let i = 100; i <= 300; i++) arr.push(i);
    tests.push(runTestCase('all-3-digit', arr));
  }
  {
    const arr = [];
    for (let v = 1; v <= 300; v++) {
      arr.push(v, v, v);
    }
    tests.push(runTestCase('triples-900', arr));
  }
  return tests;
};

if (require.main === module) {
  const results = runAllTests();
  for (const r of results) {
    console.log(
      `${r.name}: original=${r.origLen}, compressed=${r.compLen}, ratio=${r.compression}`
    );
    console.log(`compressed: ${r.enc}`);
  }
}
