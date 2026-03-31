import React from 'react';

const IceLevelIcon = ({ level, size = 24, color = 'currentColor', className = '' }) => {
  // Normalize level name to common categories
  const getLevelType = (lvl) => {
    if (!lvl) return 'normal';
    const lower = lvl.toLowerCase();
    if (lower.includes('không') || lower.includes('no')) return 'none';
    if (lower.includes('ít') || lower.includes('50%') || lower.includes('less')) return 'half';
    return 'normal'; // default: 'Bình thường' / 'Full'
  };

  const type = getLevelType(level);

  // SVG paths for each ice level
  const renderIcon = () => {
    switch (type) {
      case 'none':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            {/* Cup Outline */}
            <path d="M17 3H7c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2Z" />
            {/* Liquid Level */}
            <path d="M5 11h14" strokeOpacity="0.5" />
            <path d="M7 21l-1-16h12l-1 16H7Z" fill={color} fillOpacity="0.1" stroke="none" />
          </svg>
        );
      case 'half':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            {/* Cup Outline */}
            <path d="M17 3H7c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2Z" />
            {/* Ice Cubes (3 cubes) */}
            <rect x="8" y="14" width="3" height="3" />
            <rect x="13" y="15" width="3" height="3" />
            <rect x="10" y="10" width="3" height="3" />
            {/* Liquid Fill */}
            <path d="M7 21l-1-16h12l-1 16H7Z" fill={color} fillOpacity="0.1" stroke="none" />
          </svg>
        );
      case 'normal':
      default:
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            {/* Cup Outline */}
            <path d="M17 3H7c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2Z" />
            {/* Ice Cubes (Many cubes) */}
            <rect x="8" y="6" width="3" height="3" />
            <rect x="13" y="7" width="3" height="3" />
            <rect x="9" y="11" width="3" height="3" />
            <rect x="13" y="12" width="3" height="3" />
            <rect x="8" y="16" width="3" height="3" />
            <rect x="13" y="16" width="3" height="3" />
            {/* Liquid Fill */}
            <path d="M7 21l-1-16h12l-1 16H7Z" fill={color} fillOpacity="0.1" stroke="none" />
          </svg>
        );
    }
  };

  return renderIcon();
};

export default IceLevelIcon;
