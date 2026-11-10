const PATHS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  gavel: "m14 13-8.5 8.5a2.1 2.1 0 0 1-3-3L11 10M16 16l6-6M8 8l6-6M9 7l8 8M21 11l-8-8",
  shield: "M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6z M9 12l2 2 4-4",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  back: "M15 18l-6-6 6-6",
  check: "M5 12l5 5L20 7",
  circle: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  arrow: "M5 12h14M13 6l6 6-6 6",
  spam: "M4 4h16v12H5.2L4 17.2z M8 8h8M8 12h5",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  invite: "M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0z M4 21v-1a6 6 0 0 1 9-5.2 M18 14v6M15 17h6",
  words: "M4 7V5h16v2M9 19h6M12 5v14",
  caps: "M4 18 9 6l5 12M6 14h6M15 18V6h3.5a3 3 0 0 1 0 6H15h4a3 3 0 0 1 0 6z",
  at: "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  log: "M4 4h16v16H4z M8 9h8M8 13h8M8 17h5",
  mail: "M3 6h18v12H3z M3 7l9 6 9-6",
  steps: "M4 20h4v-4h4v-4h4V8h4",
  plus: "M12 5v14M5 12h14",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="icon"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
