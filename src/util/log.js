const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

const wrap = (code) => (text) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : String(text));

export const ink = wrap('38;5;234');
export const dim = wrap('38;5;244');
export const bold = wrap('1');
export const cobalt = wrap('38;5;26');
export const crimson = wrap('38;5;161');
export const emerald = wrap('38;5;29');
export const amber = wrap('38;5;130');
export const paper = wrap('48;5;230');

export const symbols = {
  ok: useColor ? '✓' : '+',
  fail: useColor ? '✗' : 'x',
  warn: useColor ? '!' : '!',
  arrow: useColor ? '→' : '->',
  dot: useColor ? '·' : '-',
};

export function title(text) {
  console.log('');
  console.log(bold(text));
  console.log(dim('─'.repeat(Math.min(72, Math.max(24, text.length + 4)))));
}

export function info(text) {
  console.log(`${dim('·')} ${text}`);
}

export function step(text) {
  console.log(`${cobalt(symbols.arrow)} ${text}`);
}

export function ok(text) {
  console.log(`${emerald(symbols.ok)} ${text}`);
}

export function fail(text) {
  console.log(`${crimson(symbols.fail)} ${text}`);
}

export function warn(text) {
  console.log(`${amber(symbols.warn)} ${text}`);
}

export function blank() {
  console.log('');
}

export function badge(status) {
  const map = {
    PASS: emerald(' PASS '),
    FAIL: crimson(' FAIL '),
    PROVEN: emerald(' PROVEN '),
    HEALED: emerald(' HEALED '),
    LIED: crimson(' LIED '),
    DRIFTED: amber(' DRIFTED '),
    UNVERIFIABLE: dim(' UNVERIFIABLE '),
    APP_BUG: crimson(' APP_BUG '),
    DOC_DRIFT: amber(' DOC_DRIFT '),
    PLATFORM_ERROR: dim(' HARNESS '),
  };
  return map[status] || dim(` ${status} `);
}

export function count(n, singular, plural = `${singular}s`) {
  return `${n} ${n === 1 ? singular : plural}`;
}
