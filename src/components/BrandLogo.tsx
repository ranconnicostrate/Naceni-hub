import React from 'react';

export const BrandLogo: React.FC<{
  dark?: boolean;
  compact?: boolean;
}> = ({ dark = false, compact = false }) => {
  return (
    <div className="flex items-center gap-2.5 select-none whitespace-nowrap shrink-0">
      <svg
        width="34"
        height="34"
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        {/* Outer Roof Chevron */}
        <path
          d="M6 19L20 7L34 19"
          stroke="#F97316"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Inner Building Frame */}
        <path
          d="M11 18V33H29V18"
          stroke={dark ? '#FFFFFF' : '#0B1F3A'}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Center Wrench / Pillar Detail */}
        <path
          d="M20 15V29M16 23H24"
          stroke="#F97316"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
      </svg>
      <div className="flex flex-col leading-none">
        <span
          className={`font-display text-lg font-bold tracking-tight ${
            dark ? 'text-white' : 'text-[#0B1F3A]'
          }`}
        >
          Naceni&apos;s <span className="text-[#F97316]">Business</span>
        </span>
        {!compact && (
          <span
            className={`text-[10px] font-medium tracking-wide ${
              dark ? 'text-slate-300' : 'text-slate-500'
            }`}
          >
            Build Better, Together
          </span>
        )}
      </div>
    </div>
  );
};
