import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F2674A",
          borderRadius: "32px",
        }}
      >
        {/* Route / waypoint mark: a map pin */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Pin head */}
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "50% 50% 50% 0",
              background: "white",
              transform: "rotate(-45deg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                background: "#F2674A",
                transform: "rotate(45deg)",
              }}
            />
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
