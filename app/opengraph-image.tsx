import { ImageResponse } from "next/og"

export const alt = "Aeghin: your worship team, scheduled"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

// public/aeghin-icon.svg, inlined so the image needs no file read.
const icon = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#F77F00"/><g transform="translate(14 10.55) scale(0.72)" fill="none" stroke="#FFFFFF" stroke-width="13" stroke-linejoin="miter" stroke-linecap="butt"><polyline points="32,32 50,20 68,32"/><polyline points="23,62 50,44 77,62"/><polyline points="14,92 50,68 86,92"/></g></svg>',
)}`

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background: "#FFFFFF",
          backgroundImage: "radial-gradient(circle at 85% 15%, rgba(247, 127, 0, 0.18), rgba(247, 127, 0, 0) 55%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <img src={icon} width={88} height={88} alt="" />
          <div style={{ fontSize: 52, color: "#171717", letterSpacing: "-0.02em" }}>aeghin</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ fontSize: 76, color: "#171717", letterSpacing: "-0.03em", lineHeight: 1.05 }}>
            Your worship team, scheduled.
          </div>
          <div style={{ fontSize: 76, color: "#F77F00", letterSpacing: "-0.03em", lineHeight: 1.05 }}>
            Without the group texts.
          </div>
        </div>

        <div style={{ fontSize: 30, color: "#525252" }}>
          Volunteers, setlists, and reminders in one place · aeghin.com
        </div>
      </div>
    ),
    size,
  )
}
