import React, { SVGAttributes } from "react";

const Arrow = ({ ...props }: SVGAttributes<HTMLOrSVGElement>) => {
  return (
    <svg
      {...props}
      width="14"
      height="8"
      viewBox="0 0 14 8"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clipPath="url(#clip0_3300_15)">
        <path
          d="M9.80564 0.516634C9.48539 0.205282 8.96054 0.214178 8.65809 0.534425C8.35563 0.854673 8.36453 1.35284 8.67588 1.66419L10.117 3.0964L1.55037 3.0964C1.10559 3.0964 0.749756 3.45224 0.749756 3.89702C0.749756 4.34181 1.10559 4.69764 1.55037 4.69764L10.0547 4.69764L8.6314 6.08538C8.31115 6.39673 8.30226 6.90379 8.61361 7.22404C8.92496 7.54429 9.43202 7.56208 9.76116 7.25073L12.8391 4.30623C13.0704 4.08383 13.0793 3.71021 12.8391 3.47892L9.80564 0.516634Z"
          fill="currentColor"
        />
      </g>
      <defs>
        <clipPath id="clip0_3300_15">
          <rect
            width="12.2761"
            height="7.20557"
            transform="translate(0.749756 0.285156)"
          />
        </clipPath>
      </defs>
    </svg>
  );
};

export default Arrow;
