import React from 'react';

const SugarLevelIcon = ({ level, size = 24, color = 'currentColor', className = '' }) => {
  // Normalize level name to common categories
  const getLevelType = (lvl) => {
    if (!lvl) return 'normal';
    const lower = lvl.toLowerCase();
    if (lower.includes('không') || lower.includes('no') || lower.includes('0%')) return 'none';
    if (lower.includes('ít') || lower.includes('50%') || lower.includes('half') || lower.includes('30%') || lower.includes('70%')) return 'half';
    return 'normal'; // default: 'Bình thường' / '100%' / 'Full'
  };

  const type = getLevelType(level);

  // SVG paths for each sugar level
  const renderIcon = () => {
    switch (type) {
      case 'none':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            {/* Spoon outline */}
            <path d="M7 16a4 4 0 0 1-4-4v0a4 4 0 0 1 4-4h2a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3H7Z" />
            <path d="M12 11h9" />
          </svg>
        );
      case 'half':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
             {/* Cup Outline */}
             <path d="M17 5H7c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2Z" />
             {/* Sugar cubes (diamond shape for sugar) - 2 cubes */}
             <path d="M9 13l2-2 2 2-2 2z" />
             <path d="M13 15l2-2 2 2-2 2z" />
          </svg>
        );
      case 'normal':
      default:
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            {/* Cup Outline */}
             <path d="M17 5H7c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2Z" />
             {/* Sugar cubes - Many cubes */}
             <path d="M8 10l2-2 2 2-2 2z" />
             <path d="M12 10l2-2 2 2-2 2z" />
             <path d="M10 13l2-2 2 2-2 2z" />
             <path d="M14 13l2-2 2 2-2 2z" />
             <path d="M9 16l2-2 2 2-2 2z" />
             <path d="M13 16l2-2 2 2-2 2z" />
          </svg>
        );
    }
  };

  return renderIcon();
};

export default SugarLevelIcon;
