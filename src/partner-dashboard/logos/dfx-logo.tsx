import { SVGProps } from 'react';

/** DFX wordmark (from src/static/assets/logo.svg), sized for the partner header. */
export function DfxLogo(props: SVGProps<SVGSVGElement> & { title?: string }): JSX.Element {
  const { title = 'DFX', className, ...rest } = props;
  return (
    <svg
      viewBox="0 0 74 23"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={title}
      {...rest}
    >
      <title>{title}</title>
      <g clipPath="url(#dfx-partner-clip0)">
        <g clipPath="url(#dfx-partner-clip1)">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M8.32104 0H16.8097C23.0875 0 28.1773 4.94402 28.1773 11.37C28.1773 17.796 22.9684 23.0024 16.5449 23.0024H8.32104V18.3329H15.4297C19.1882 18.3329 22.2615 15.2596 22.2615 11.5012C22.2615 7.74279 19.1882 4.66948 15.4297 4.66948H8.32104V0ZM36.0221 4.27105V10.3496H45.7692V14.6207H36.0221V23H30.6991V0H48.0821V4.27105H36.0221ZM67.0734 23L61.5196 15.0143L56.0654 23H49.9528L58.4633 11.302L50.3828 0H56.4274L61.7188 7.45854L66.9107 0H72.6613L64.644 11.1052L73.2201 23H67.0759H67.0734Z"
            fill="currentColor"
          />
          <path
            d="M11.6566 17.0843C14.8581 17.0843 17.4534 14.489 17.4534 11.2875C17.4534 8.08602 14.8581 5.49072 11.6566 5.49072C8.45516 5.49072 5.85986 8.08602 5.85986 11.2875C5.85986 14.489 8.45516 17.0843 11.6566 17.0843Z"
            fill="url(#dfx-partner-grad0)"
          />
          <path
            d="M6.37741 17.8786C9.89956 17.8786 12.7548 15.0233 12.7548 11.5012C12.7548 7.97905 9.89956 5.12378 6.37741 5.12378C2.85527 5.12378 0 7.97905 0 11.5012C0 15.0233 2.85527 17.8786 6.37741 17.8786Z"
            fill="url(#dfx-partner-grad1)"
          />
        </g>
      </g>
      <defs>
        <linearGradient
          id="dfx-partner-grad0"
          x1="16.5208"
          y1="8.75059"
          x2="6.21828"
          y2="14.0638"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0.04" stopColor="#F5516C" />
          <stop offset="0.14" stopColor="#C74863" />
          <stop offset="0.31" stopColor="#853B57" />
          <stop offset="0.44" stopColor="#55324E" />
          <stop offset="0.55" stopColor="#382D49" />
          <stop offset="0.61" stopColor="#2D2B47" />
        </linearGradient>
        <linearGradient
          id="dfx-partner-grad1"
          x1="10.267"
          y1="6.86572"
          x2="2.0675"
          y2="16.6347"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0.2" stopColor="#F5516C" />
          <stop offset="1" stopColor="#6B3753" />
        </linearGradient>
        <clipPath id="dfx-partner-clip0">
          <rect width="73.6" height="23" fill="white" />
        </clipPath>
        <clipPath id="dfx-partner-clip1">
          <rect width="73.2176" height="23" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}
