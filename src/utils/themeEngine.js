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

export const applyTheme = (palette, settings = {}) => {
    const root = document.documentElement;

    if (palette) {
        Object.keys(palette).forEach(key => {
            root.style.setProperty(`--brand-${key}`, palette[key]);
        });
    }

    // Áp dụng các biến tùy biến mở rộng (SaaS custom branding)
    if (settings.bgColor) root.style.setProperty('--bg-global', settings.bgColor);
    else root.style.removeProperty('--bg-global');

    if (settings.surfaceColor) root.style.setProperty('--bg-surface', settings.surfaceColor);
    else root.style.removeProperty('--bg-surface');

    if (settings.primaryTextColor) root.style.setProperty('--text-primary', settings.primaryTextColor);
    else root.style.removeProperty('--text-primary');

    if (settings.buttonBgColor) root.style.setProperty('--btn-bg', settings.buttonBgColor);
    else root.style.removeProperty('--btn-bg');

    if (settings.buttonTextColor) root.style.setProperty('--btn-text', settings.buttonTextColor);
    else root.style.removeProperty('--btn-text');

    if (settings.globalFont) root.style.setProperty('--font-global', settings.globalFont);
    else root.style.removeProperty('--font-global');

    if (settings.headingFont) root.style.setProperty('--font-heading', settings.headingFont);
    else root.style.removeProperty('--font-heading');
};

// ── PHASE 2: RADIUS PRESET SYSTEM ──
// Ba preset cho chủ quán chọn — 1 click, toàn app cập nhật ngay lập tức.

export const RADIUS_PRESETS = {
    sharp: {
        label: 'Vuông Góc',
        description: 'Phong cách sharp, nghiêm túc, chuyên nghiệp',
        icon: '▢',
        values: {
            '--radius-card': '6px',
            '--radius-btn': '4px',
            '--radius-modal': '8px',
            '--radius-input': '4px',
            '--radius-badge': '4px',
            '--radius-chip': '4px',
        }
    },
    rounded: {
        label: 'Mềm Mại',
        description: 'Thiết kế premium, touch-friendly — mặc định',
        icon: '◻',
        values: {
            '--radius-card': '16px',
            '--radius-btn': '10px',
            '--radius-modal': '20px',
            '--radius-input': '10px',
            '--radius-badge': '8px',
            '--radius-chip': '8px',
        }
    },
    pill: {
        label: 'Bo Cực Tròn',
        description: 'Phong cách hiện đại, trẻ trung, năng động',
        icon: '◯',
        values: {
            '--radius-card': '24px',
            '--radius-btn': '999px',
            '--radius-modal': '28px',
            '--radius-input': '999px',
            '--radius-badge': '999px',
            '--radius-chip': '999px',
        }
    }
};

export const applyRadiusPreset = (presetName) => {
    const preset = RADIUS_PRESETS[presetName];
    if (!preset) return;
    const root = document.documentElement;
    Object.entries(preset.values).forEach(([key, value]) => {
        root.style.setProperty(key, value);
    });
};

// ── PHASE 2: SPACING PRESET SYSTEM ──
export const SPACING_PRESETS = {
    compact: {
        label: 'Thu Gọn',
        description: 'Mật độ hiển thị cao, ít khoảng trống — phù hợp thu ngân thao tác nhanh',
        icon: '◭',
        values: {
            '--spacing-section': '20px',
            '--spacing-card-p': '16px',
            '--spacing-card-header': '12px 16px',
            '--spacing-card-body': '16px',
            '--spacing-card-footer': '12px 16px',
            '--spacing-modal-p': '20px',
            '--spacing-modal-body': '16px 20px',
            '--spacing-btn': '10px 14px',
            '--spacing-input-py': '8px',
        }
    },
    normal: {
        label: 'Tiêu Chuẩn',
        description: 'Tài nguyên phân bổ vừa phải, dễ nhìn, dễ tương tác — mặc định',
        icon: '■',
        values: {
            '--spacing-section': '32px',
            '--spacing-card-p': '24px',
            '--spacing-card-header': '16px 20px',
            '--spacing-card-body': '20px',
            '--spacing-card-footer': '16px 20px',
            '--spacing-modal-p': '28px',
            '--spacing-modal-body': '24px 28px',
            '--spacing-btn': '12px 16px',
            '--spacing-input-py': '12px',
        }
    },
    spacious: {
        label: 'Rộng Rãi',
        description: 'Ưu tiên cảm giác cao cấp (Premium), khoảng không lớn — phù hợp màn to, Kiosk',
        icon: '□',
        values: {
            '--spacing-section': '48px',
            '--spacing-card-p': '32px',
            '--spacing-card-header': '24px 28px',
            '--spacing-card-body': '28px',
            '--spacing-card-footer': '20px 24px',
            '--spacing-modal-p': '40px',
            '--spacing-modal-body': '32px 40px',
            '--spacing-btn': '16px 20px',
            '--spacing-input-py': '14px',
        }
    }
};

export const applySpacingPreset = (presetName) => {
    const preset = SPACING_PRESETS[presetName];
    if (!preset) return;
    const root = document.documentElement;
    Object.entries(preset.values).forEach(([key, value]) => {
        root.style.setProperty(key, value);
    });
};


