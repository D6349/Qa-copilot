const NAMED_COLORS = new Map([
  ['transparent', [0, 0, 0, 0]],
  ['black', [0, 0, 0, 1]],
  ['silver', [192, 192, 192, 1]],
  ['gray', [128, 128, 128, 1]],
  ['grey', [128, 128, 128, 1]],
  ['white', [255, 255, 255, 1]],
  ['maroon', [128, 0, 0, 1]],
  ['red', [255, 0, 0, 1]],
  ['purple', [128, 0, 128, 1]],
  ['fuchsia', [255, 0, 255, 1]],
  ['green', [0, 128, 0, 1]],
  ['lime', [0, 255, 0, 1]],
  ['olive', [128, 128, 0, 1]],
  ['yellow', [255, 255, 0, 1]],
  ['navy', [0, 0, 128, 1]],
  ['blue', [0, 0, 255, 1]],
  ['teal', [0, 128, 128, 1]],
  ['aqua', [0, 255, 255, 1]],
  ['orange', [255, 165, 0, 1]],
  ['rebeccapurple', [102, 51, 153, 1]],
]);

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function parseAlpha(value) {
  const input = String(value).trim();
  if (input.endsWith('%')) {
    return clamp(Number.parseFloat(input) / 100, 0, 1);
  }
  return clamp(Number.parseFloat(input), 0, 1);
}

function parseRgbChannel(value) {
  const input = String(value).trim();
  if (input.endsWith('%')) {
    return clamp((Number.parseFloat(input) / 100) * 255, 0, 255);
  }
  return clamp(Number.parseFloat(input), 0, 255);
}

function normalizeHue(value) {
  const input = String(value).trim().toLowerCase();
  let degrees;
  if (input.endsWith('turn')) {
    degrees = Number.parseFloat(input) * 360;
  } else if (input.endsWith('rad')) {
    degrees = Number.parseFloat(input) * (180 / Math.PI);
  } else if (input.endsWith('grad')) {
    degrees = Number.parseFloat(input) * 0.9;
  } else {
    degrees = Number.parseFloat(input);
  }
  return ((degrees % 360) + 360) % 360;
}

function hslToRgb(hue, saturation, lightness) {
  const h = normalizeHue(hue) / 360;
  const s = clamp(Number.parseFloat(saturation) / 100, 0, 1);
  const l = clamp(Number.parseFloat(lightness) / 100, 0, 1);

  if (s === 0) {
    const channel = l * 255;
    return [channel, channel, channel];
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (offset) => {
    let t = h + offset;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  return [channel(1 / 3) * 255, channel(0) * 255, channel(-1 / 3) * 255];
}

function multiplyMatrix(matrix, vector) {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
}

function parseColorComponent(value, percentageScale) {
  const input = String(value).trim().toLowerCase();
  if (!input || input === 'none') return null;
  const match = input.match(/^([+-]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:e[+-]?\d+)?)(%)?$/i);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return null;
  return match[2] ? (number / 100) * percentageScale : number;
}

function gammaEncodeSrgb(value) {
  const sign = value < 0 ? -1 : 1;
  const absolute = Math.abs(value);
  return absolute > 0.0031308
    ? sign * (1.055 * absolute ** (1 / 2.4) - 0.055)
    : 12.92 * value;
}

function xyzD65ToSrgb(xyz) {
  const linear = multiplyMatrix([
    [12831 / 3959, -329 / 214, -1974 / 3959],
    [-851781 / 878810, 1648619 / 878810, 36519 / 878810],
    [705 / 12673, -2585 / 12673, 705 / 667],
  ], xyz);
  return linear.map((channel) => clamp(gammaEncodeSrgb(channel), 0, 1) * 255);
}

function labToSrgb(lightness, a, b) {
  const kappa = 24389 / 27;
  const epsilon = 216 / 24389;
  const f1 = (lightness + 16) / 116;
  const f0 = a / 500 + f1;
  const f2 = f1 - b / 200;
  const xyz = [
    f0 ** 3 > epsilon ? f0 ** 3 : (116 * f0 - 16) / kappa,
    lightness > kappa * epsilon ? ((lightness + 16) / 116) ** 3 : lightness / kappa,
    f2 ** 3 > epsilon ? f2 ** 3 : (116 * f2 - 16) / kappa,
  ].map((value, index) => value * [0.96422, 1, 0.82521][index]);
  const d65 = multiplyMatrix([
    [0.955473421488075, -0.02309845494876471, 0.06325924320057072],
    [-0.0283697093338637, 1.0099953980813041, 0.021041441191917323],
    [0.012314014864481998, -0.020507649298898964, 1.330365926242124],
  ], xyz);
  return xyzD65ToSrgb(d65);
}

function oklabToSrgb(lightness, a, b) {
  const nonlinearLms = multiplyMatrix([
    [1, 0.3963377773761749, 0.2158037573099136],
    [1, -0.1055613458156586, -0.0638541728258133],
    [1, -0.0894841775298119, -1.2914855480194092],
  ], [lightness, a, b]);
  const xyz = multiplyMatrix([
    [1.2268798758459243, -0.5578149944602171, 0.2813910456659647],
    [-0.0405757452148008, 1.112286803280317, -0.0717110580655164],
    [-0.0763729366746601, -0.4214933324022432, 1.5869240198367816],
  ], nonlinearLms.map((channel) => channel ** 3));
  return xyzD65ToSrgb(xyz);
}

function parseLabColor(body, colorSpace) {
  const slashParts = body.split('/').map((part) => part.trim());
  if (slashParts.length > 2) return null;
  const channels = slashParts[0].split(/\s+/).filter(Boolean);
  if (channels.length !== 3 || channels.some((channel) => channel.includes(','))) return null;
  const alpha = slashParts[1] === undefined ? 1 : parseAlpha(slashParts[1]);
  if (!Number.isFinite(alpha)) return null;

  const isOklab = colorSpace === 'oklab';
  const lightness = parseColorComponent(channels[0], isOklab ? 1 : 100);
  const a = parseColorComponent(channels[1], isOklab ? 0.4 : 125);
  const b = parseColorComponent(channels[2], isOklab ? 0.4 : 125);
  if ([lightness, a, b].some((component) => component === null || !Number.isFinite(component))) return null;

  const boundedLightness = clamp(lightness, 0, isOklab ? 1 : 100);
  const [r, g, blue] = isOklab
    ? oklabToSrgb(boundedLightness, a, b)
    : labToSrgb(boundedLightness, a, b);
  if (![r, g, blue].every(Number.isFinite)) return null;
  return { r, g, b: blue, a: alpha };
}

/**
 * Parse the CSS colors emitted most commonly by getComputedStyle. The return
 * value uses 0..255 RGB channels and a 0..1 alpha channel. Unknown colors such
 * as currentColor and device-dependent color spaces return null rather than
 * being guessed.
 */
export function parseCssColor(value) {
  if (value && typeof value === 'object') {
    const r = Number(value.r ?? value.red);
    const g = Number(value.g ?? value.green);
    const b = Number(value.b ?? value.blue);
    const a = Number(value.a ?? value.alpha ?? 1);
    if ([r, g, b, a].every(Number.isFinite)) {
      return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255), a: clamp(a, 0, 1) };
    }
    return null;
  }

  if (typeof value !== 'string') return null;
  const input = value.trim().toLowerCase();
  if (!input || input === 'currentcolor' || input === 'inherit' || input === 'initial') return null;

  const named = NAMED_COLORS.get(input);
  if (named) {
    const [r, g, b, a] = named;
    return { r, g, b, a };
  }

  const hex = input.match(/^#([\da-f]{3,8})$/i);
  if (hex) {
    const raw = hex[1];
    if (![3, 4, 6, 8].includes(raw.length)) return null;
    const expanded = raw.length <= 4
      ? [...raw].map((character) => character + character).join('')
      : raw;
    const hasAlpha = expanded.length === 8;
    return {
      r: Number.parseInt(expanded.slice(0, 2), 16),
      g: Number.parseInt(expanded.slice(2, 4), 16),
      b: Number.parseInt(expanded.slice(4, 6), 16),
      a: hasAlpha ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
    };
  }

  const rgb = input.match(/^rgba?\((.*)\)$/i);
  if (rgb) {
    const body = rgb[1].trim();
    const slashParts = body.split('/').map((part) => part.trim());
    const channels = (slashParts[0].includes(',') ? slashParts[0].split(',') : slashParts[0].split(/\s+/))
      .map((part) => part.trim())
      .filter(Boolean);
    let alpha = slashParts[1];
    if (channels.length === 4 && alpha === undefined) alpha = channels.pop();
    if (channels.length !== 3) return null;
    const values = channels.map(parseRgbChannel);
    const parsedAlpha = alpha === undefined ? 1 : parseAlpha(alpha);
    if (![...values, parsedAlpha].every(Number.isFinite)) return null;
    return { r: values[0], g: values[1], b: values[2], a: parsedAlpha };
  }

  const hsl = input.match(/^hsla?\((.*)\)$/i);
  if (hsl) {
    const body = hsl[1].trim();
    const slashParts = body.split('/').map((part) => part.trim());
    const channels = (slashParts[0].includes(',') ? slashParts[0].split(',') : slashParts[0].split(/\s+/))
      .map((part) => part.trim())
      .filter(Boolean);
    let alpha = slashParts[1];
    if (channels.length === 4 && alpha === undefined) alpha = channels.pop();
    if (channels.length !== 3 || !channels[1].endsWith('%') || !channels[2].endsWith('%')) return null;
    const [r, g, b] = hslToRgb(channels[0], channels[1], channels[2]);
    const parsedAlpha = alpha === undefined ? 1 : parseAlpha(alpha);
    if (![r, g, b, parsedAlpha].every(Number.isFinite)) return null;
    return { r, g, b, a: parsedAlpha };
  }

  const lab = input.match(/^(oklab|lab)\((.*)\)$/i);
  if (lab) return parseLabColor(lab[2].trim(), lab[1].toLowerCase());

  const srgb = input.match(/^color\(srgb\s+(.+)\)$/i);
  if (srgb) {
    const slashParts = srgb[1].split('/').map((part) => part.trim());
    const channels = slashParts[0].split(/\s+/).filter(Boolean).map(Number);
    const alpha = slashParts[1] === undefined ? 1 : parseAlpha(slashParts[1]);
    if (channels.length !== 3 || ![...channels, alpha].every(Number.isFinite)) return null;
    return {
      r: clamp(channels[0], 0, 1) * 255,
      g: clamp(channels[1], 0, 1) * 255,
      b: clamp(channels[2], 0, 1) * 255,
      a: alpha,
    };
  }

  return null;
}

export function compositeColors(foregroundValue, backgroundValue) {
  const foreground = parseCssColor(foregroundValue);
  const background = parseCssColor(backgroundValue);
  if (!foreground || !background) return null;

  const alpha = foreground.a + background.a * (1 - foreground.a);
  if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha,
    g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha,
    b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha,
    a: alpha,
  };
}

export function relativeLuminance(value) {
  const color = parseCssColor(value);
  if (!color) return null;
  const convert = (channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * convert(color.r) + 0.7152 * convert(color.g) + 0.0722 * convert(color.b);
}

export function contrastRatio(foregroundValue, backgroundValue) {
  const foreground = parseCssColor(foregroundValue);
  const background = parseCssColor(backgroundValue);
  if (!foreground || !background || background.a < 1) return null;
  const flattenedForeground = foreground.a < 1
    ? compositeColors(foreground, background)
    : foreground;
  const foregroundLuminance = relativeLuminance(flattenedForeground);
  const backgroundLuminance = relativeLuminance(background);
  if (foregroundLuminance === null || backgroundLuminance === null) return null;
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function isLargeText(fontSizeValue, fontWeightValue) {
  const fontSize = Number.parseFloat(fontSizeValue);
  const numericWeight = typeof fontWeightValue === 'string' && fontWeightValue.toLowerCase() === 'bold'
    ? 700
    : Number.parseInt(fontWeightValue, 10);
  if (!Number.isFinite(fontSize)) return false;
  return fontSize >= 24 || (fontSize >= 18.6667 && Number.isFinite(numericWeight) && numericWeight >= 700);
}

export function colorToHex(value, includeAlpha = false) {
  const color = parseCssColor(value);
  if (!color) return null;
  const channel = (number) => Math.round(clamp(number, 0, 255)).toString(16).padStart(2, '0');
  const alpha = includeAlpha ? channel(color.a * 255) : '';
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}${alpha}`;
}
