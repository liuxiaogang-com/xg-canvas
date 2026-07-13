interface StarIconProps {
  filled?: boolean;
  size?: number;
}

export default function StarIcon({ filled = false, size = 14 }: StarIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m12 3.2 2.7 5.47 6.04.88-4.37 4.26 1.03 6.02L12 17l-5.4 2.83 1.03-6.02-4.37-4.26 6.04-.88L12 3.2Z" />
    </svg>
  );
}
