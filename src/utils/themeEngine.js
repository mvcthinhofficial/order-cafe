// src/utils/themeEngine.js

const hex2rgb = (hex) => {
    let r = 0, g = 0, b = 0;
    hex = hex.replace('#', '');
    if (hex.length === 3) {
      r = "0x" + hex[0] + hex[0];
      g = "0x" + hex[1] + hex[1];
      b = "0x" + hex[2] + hex[2];
    } else if (hex.length === 6) {
      r = "0x" + hex[0] + hex[1];
      g = "0x" + hex[2] + hex[3];
      b = "0x" + hex[4] + hex[5];
    }
    return [+(r), +(g), +(b)];
  };
  
const mix = (c1, c2, w1) => {
    const w2 = 1 - w1;
    return [
        Math.round(c1[0] * w1 + c2[0] * w2),
        Math.round(c1[1] * w1 + c2[1] * w2),
        Math.round(c1[2] * w1 + c2[2] * w2)
    ];
};

const toHex = (rgb) => {
    return "#" + rgb.map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
};

export const generateTheme = (baseColorHex) => {
    if (!baseColorHex || !baseColorHex.startsWith('#')) return null;
    
    const base = hex2rgb(baseColorHex);
    const white = [255, 255, 255];
    const black = [0, 0, 0];

    return {
        50: toHex(mix(base, white, 0.1)),
        100: toHex(mix(base, white, 0.2)),
        200: toHex(mix(base, white, 0.4)),
        300: toHex(mix(base, white, 0.6)),
        400: toHex(mix(base, white, 0.8)),
        500: toHex(mix(base, white, 0.95)),
        600: baseColorHex,
        700: toHex(mix(black, base, 0.2)),
        800: toHex(mix(black, base, 0.4)),
        900: toHex(mix(black, base, 0.6)),
        950: toHex(mix(black, base, 0.8)),
    };
};

export const applyTheme = (palette) => {
    if (!palette) return;
    const root = document.documentElement;
    Object.keys(palette).forEach(key => {
        root.style.setProperty(`--brand-${key}`, palette[key]);
    });
};
