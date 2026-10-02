import React from "react";

/**
 * 1. SK on 로고: 상단 행복날개(주황/빨강) + 하단 SK on (빨강/주황)
 */
export function SkOnLogo({ height = 22, className = "" }) {
  return (
    <svg
      height={height}
      viewBox="0 0 110 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ verticalAlign: "middle", display: "inline-block", flexShrink: 0 }}
      aria-label="SK on 로고"
    >
      {/* 좌측 주황 날개 */}
      <path
        d="M 33 12 C 40 10 52 24 50 44 C 44 54 36 58 32 60 C 30 52 28 38 24 28 C 22 22 28 14 33 12 Z"
        fill="#f97316"
      />
      <path
        d="M 44 26 C 49 32 50 42 46 54 C 41 50 36 42 34 32 C 34 26 40 22 44 26 Z"
        fill="#ea580c"
      />

      {/* 우측 빨강 날개 */}
      <path
        d="M 77 12 C 70 10 58 24 60 44 C 66 54 74 58 78 60 C 80 52 82 38 86 28 C 88 22 82 14 77 12 Z"
        fill="#ea002c"
      />
      <path
        d="M 66 26 C 61 32 60 42 64 54 C 69 50 74 42 76 32 C 76 26 70 22 66 26 Z"
        fill="#c20024"
      />

      {/* 중앙 리본 포인트 */}
      <circle cx="55" cy="48" r="3.5" fill="#ea002c" />

      {/* SK 텍스트 (빨강) */}
      <text
        x="6"
        y="94"
        fill="#ea002c"
        fontSize="34"
        fontWeight="900"
        fontFamily="Arial, -apple-system, sans-serif"
        letterSpacing="-1"
      >
        SK
      </text>

      {/* on 텍스트 (주황) */}
      <text
        x="55"
        y="94"
        fill="#f97316"
        fontSize="34"
        fontWeight="800"
        fontFamily="Arial, -apple-system, sans-serif"
        letterSpacing="-0.5"
      >
        on
      </text>
    </svg>
  );
}

/**
 * 2. Samsung SDI 로고: 파란 타원 안에 SAMSUNG + 우측에 삼성SDI
 */
export function SamsungSdiLogo({ height = 18, className = "" }) {
  return (
    <svg
      height={height}
      viewBox="0 0 160 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ verticalAlign: "middle", display: "inline-block", flexShrink: 0 }}
      aria-label="Samsung SDI 로고"
    >
      {/* 삼성 블루 오벌 (비스듬한 타원) */}
      <g transform="translate(42, 22) rotate(-8) translate(-42, -22)">
        <ellipse cx="42" cy="22" rx="40" ry="18" fill="#0038a8" />
        <text
          x="42"
          y="27"
          fill="#ffffff"
          fontSize="11.5"
          fontWeight="900"
          fontFamily="Arial, Helvetica, sans-serif"
          letterSpacing="0.8"
          textAnchor="middle"
        >
          SAMSUNG
        </text>
      </g>

      {/* 삼성SDI 텍스트 */}
      <text
        x="92"
        y="29"
        fill="#0038a8"
        fontSize="17.5"
        fontWeight="900"
        fontFamily="'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif"
        letterSpacing="-0.5"
      >
        삼성SDI
      </text>
    </svg>
  );
}

/**
 * 3. Hyundai 로고: 사용자가 제공한 원본 이미지 그대로 현대 공식 딥네이비(#002c5f) 로고 적용
 */
export function HyundaiLogo({ height = 22, color = "#002c5f", className = "" }) {
  return (
    <svg
      height={height}
      viewBox="0 0 120 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ verticalAlign: "middle", display: "inline-block", flexShrink: 0 }}
      aria-label="Hyundai 로고 (원본 네이비)"
    >
      {/* 타원 외곽선 */}
      <ellipse cx="60" cy="28" rx="46" ry="24" stroke={color} strokeWidth="5.5" fill="none" />

      {/* 비스듬한 H 모티프 */}
      <path
        d="M 43 14 
           C 40 22 35 36 33 42 
           C 38 42 43 42 47 42 
           C 49 35 50 30 52 26 
           C 57 26 63 26 68 26 
           C 66 31 63 36 61 42 
           C 66 42 71 42 76 42 
           C 80 32 84 21 87 14 
           C 82 14 77 14 73 14 
           C 71 19 69 22 68 23 
           C 63 23 57 23 52 23 
           C 54 19 56 16 57 14 
           Z"
        fill={color}
      />

      {/* HYUNDAI 텍스트 */}
      <text
        x="60"
        y="66"
        fill={color}
        fontSize="17.5"
        fontWeight="900"
        fontFamily="'Arial Black', Arial, sans-serif"
        letterSpacing="1.2"
        textAnchor="middle"
      >
        HYUNDAI
      </text>
    </svg>
  );
}
