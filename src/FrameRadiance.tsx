const DIANA_FRAME_OUTLINE =
  "M 817 115 L 803 115 L 678 155 L 665 156 L 557 125 L 532 116 L 529 113 L 527 106 L 541 65 L 540 55 L 532 49 L 518 50 L 459 64 L 394 77 L 384 80 L 375 85 L 353 106 L 325 180 L 319 186 L 209 221 L 163 234 L 158 237 L 140 255 L 129 269 L 126 280 L 112 367 L 109 373 L 88 395 L 86 400 L 72 503 L 74 513 L 83 522 L 108 540 L 114 548 L 111 594 L 106 603 L 42 679 L 38 685 L 36 692 L 39 714 L 54 785 L 55 799 L 46 842 L 33 893 L 32 905 L 64 1020 L 64 1029 L 62 1037 L 43 1080 L 43 1093 L 64 1165 L 73 1173 L 107 1195 L 114 1205 L 113 1214 L 97 1275 L 96 1288 L 98 1295 L 116 1312 L 166 1351 L 220 1352 L 240 1342 L 250 1339 L 272 1339 L 275 1340 L 278 1344 L 277 1355 L 274 1359 L 233 1360 L 228 1362 L 217 1371 L 211 1379 L 199 1447 L 198 1460 L 200 1467 L 230 1496 L 235 1499 L 808 1499 L 819 1491 L 840 1471 L 848 1414 L 849 1390 L 826 1365 L 819 1362 L 737 1360 L 733 1353 L 734 1342 L 739 1339 L 855 1341 L 866 1335 L 923 1293 L 926 1287 L 937 1240 L 937 1231 L 931 1220 L 933 1212 L 939 1203 L 974 1181 L 982 1172 L 998 1115 L 997 1103 L 985 1079 L 985 1076 L 997 1044 L 997 1034 L 992 1017 L 992 1008 L 1009 942 L 1008 930 L 988 895 L 977 881 L 887 851 L 884 846 L 884 835 L 887 830 L 934 807 L 940 802 L 952 770 L 977 758 L 983 752 L 1003 700 L 1003 689 L 975 628 L 975 620 L 1009 516 L 1008 501 L 983 452 L 983 445 L 990 412 L 992 395 L 990 387 L 987 382 L 958 348 L 951 344 L 889 322 L 876 316 L 874 308 L 878 287 L 877 270 L 869 264 L 838 254 L 834 248 L 848 149 L 846 143 L 821 117 Z";

const DIANA_STAR_VISIBLE_OUTLINE =
  "M 204 504 L 166 560 L 154 501 L 109 489 L 156 457 L 155 394 L 193 440 L 250 409 L 229 461";

const DIANA_STAR_CENTER_FLARE =
  "M 180 455 L 185 468 L 199 473 L 185 478 L 180 492 L 175 479 L 161 473 L 175 468 Z";

export function FrameRadiance() {
  return (
    <svg
      className="frame-radiance"
      viewBox="0 0 1024 1536"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <path
          id="diana-frame-outline"
          pathLength="5184.6"
          d={DIANA_FRAME_OUTLINE}
        />
        <mask
          id="diana-frame-outside"
          x="-180"
          y="-180"
          width="1384"
          height="1896"
          maskUnits="userSpaceOnUse"
        >
          <rect x="-180" y="-180" width="1384" height="1896" fill="#fff" />
          <use
            href="#diana-frame-outline"
            fill="#000"
            stroke="#000"
            strokeWidth="2"
          />
        </mask>
        <linearGradient
          id="diana-frame-top-fade-gradient"
          x1="0"
          y1="0"
          x2="0"
          y2="96"
          gradientUnits="userSpaceOnUse"
          spreadMethod="pad"
        >
          <stop offset="0" stopColor="#000" />
          <stop offset="1" stopColor="#fff" />
        </linearGradient>
        <mask
          id="diana-frame-top-fade"
          x="-180"
          y="-180"
          width="1384"
          height="1896"
          maskUnits="userSpaceOnUse"
        >
          <rect
            x="-180"
            y="-180"
            width="1384"
            height="1896"
            fill="url(#diana-frame-top-fade-gradient)"
          />
        </mask>
        <filter
          id="diana-outer-glow-ambient"
          x="-220"
          y="-220"
          width="1464"
          height="1976"
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
        >
          <feGaussianBlur stdDeviation="36" />
        </filter>
        <filter
          id="diana-outer-glow-far"
          x="-180"
          y="-180"
          width="1384"
          height="1896"
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
        >
          <feGaussianBlur stdDeviation="25" />
        </filter>
        <filter
          id="diana-outer-glow-near"
          x="-100"
          y="-100"
          width="1224"
          height="1736"
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
        >
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <filter
          id="diana-star-glow-aura"
          x="60"
          y="330"
          width="260"
          height="300"
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
        >
          <feGaussianBlur stdDeviation="15" />
        </filter>
        <filter
          id="diana-star-glow-halo"
          x="80"
          y="360"
          width="220"
          height="240"
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
        >
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <filter
          id="diana-star-glow-flare"
          x="140"
          y="430"
          width="80"
          height="90"
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
        >
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      <g mask="url(#diana-frame-top-fade)">
        <g
          className="frame-radiance__outer-glow"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          mask="url(#diana-frame-outside)"
        >
          <g className="frame-radiance__outer-pulse">
            <use
              className="frame-radiance__outer-ambient"
              href="#diana-frame-outline"
            />
            <use
              className="frame-radiance__outer-far"
              href="#diana-frame-outline"
            />
          </g>
          <use
            className="frame-radiance__outer-near"
            href="#diana-frame-outline"
          />
        </g>
      </g>

      <g className="frame-radiance__star-glow" fill="none">
        <g className="frame-radiance__star-aura-pulse">
          <path
            className="frame-radiance__star-aura"
            d={DIANA_STAR_VISIBLE_OUTLINE}
          />
        </g>
        <path
          className="frame-radiance__star-halo"
          d={DIANA_STAR_VISIBLE_OUTLINE}
        />
        <g className="frame-radiance__star-flare-pulse">
          <path
            className="frame-radiance__star-flare"
            d={DIANA_STAR_CENTER_FLARE}
          />
        </g>
      </g>
    </svg>
  );
}
