import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: "96px",
        }}
      >
        {/* Route / waypoint mark: a circle with a pin drop shape */}
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
              width: "200px",
              height: "200px",
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
                width: "80px",
                height: "80px",
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
