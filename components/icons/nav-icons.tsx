import type { SVGProps } from "react";

// Aeghin's own navigation icons, drawn on a 20px grid to match the logo:
// mitred corners, square ends, a 1.6 stroke, and one shape filled at 16% so the
// icon picks up a tint when its row turns orange.

export type NavIconName =
  | "events"
  | "songs"
  | "members"
  | "blockouts"
  | "keys"
  | "invitations"
  | "templates"
  | "activity"
  | "settings"
  | "organizations"
  | "switch";

interface NavIconShape {
  stroke: string;
  fill?: string;
}

const shapes: Record<NavIconName, NavIconShape> = {
  events: {
    stroke: "M3 5h14v12H3z M3 9h14 M7 2.5v4 M13 2.5v4",
    fill: "M11 11.5h3.5V15H11z",
  },
  songs: {
    stroke:
      "M8 15V4.5l9-2V13 M8 15a2.25 2.25 0 1 1-4.5 0a2.25 2.25 0 1 1 4.5 0 M17 13a2.25 2.25 0 1 1-4.5 0a2.25 2.25 0 1 1 4.5 0",
    fill: "M8 15a2.25 2.25 0 1 1-4.5 0a2.25 2.25 0 1 1 4.5 0 M17 13a2.25 2.25 0 1 1-4.5 0a2.25 2.25 0 1 1 4.5 0",
  },
  members: {
    stroke:
      "M10.5 7a3 3 0 1 1-6 0a3 3 0 1 1 6 0 M2 17c0-3.3 2.4-5.5 5.5-5.5s5.5 2.2 5.5 5.5 M16.5 6.5a2 2 0 1 1-4 0a2 2 0 1 1 4 0 M14 11.5c2.3 0 4 1.9 4 5",
    fill: "M10.5 7a3 3 0 1 1-6 0a3 3 0 1 1 6 0",
  },
  blockouts: {
    stroke: "M3 5h14v12H3z M3 9h14 M7 2.5v4 M13 2.5v4 M7.5 11.5l5 4 M12.5 11.5l-5 4",
  },
  keys: {
    stroke: "M7.5 2.5h5v9h-5z M4.5 9.5a5.5 5.5 0 0 0 11 0 M10 15v3 M7 18h6",
    fill: "M7.5 2.5h5v9h-5z",
  },
  invitations: {
    stroke: "M2.5 4.5h15v11h-15z M2.5 5l7.5 6 7.5-6",
    fill: "M2.5 5l7.5 6 7.5-6V4.5h-15z",
  },
  templates: {
    stroke: "M3 3h14v14H3z M3 8h14 M8.5 8v9",
    fill: "M3 3h14v5H3z",
  },
  activity: {
    stroke: "M2 10.5h3.5L8 4l4 12 2.5-5.5H18",
  },
  settings: {
    stroke: "M3 6h3 M10 6h7 M6 4h4v4H6z M3 14h7 M14 14h3 M10 12h4v4h-4z",
    fill: "M6 4h4v4H6z M10 12h4v4h-4z",
  },
  organizations: {
    stroke: "M3 3h6v6H3z M11 3h6v6h-6z M3 11h6v6H3z M11 11h6v6h-6z",
    fill: "M3 3h6v6H3z",
  },
  switch: {
    stroke: "M6.5 7.5L10 4.5l3.5 3 M6.5 12.5l3.5 3 3.5-3",
  },
};

interface NavIconProps extends SVGProps<SVGSVGElement> {
  name: NavIconName;
}

export function NavIcon({ name, ...props }: NavIconProps) {
  const shape = shapes[name];

  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      {shape.fill && <path d={shape.fill} fill="currentColor" fillOpacity={0.16} />}
      <path
        d={shape.stroke}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="miter"
        strokeLinecap="square"
      />
    </svg>
  );
}
