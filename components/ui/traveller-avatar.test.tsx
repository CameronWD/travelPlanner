import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { travellerImagePosition } from "@/lib/traveller";

// Radix mounts its <img> only after the image loads (never in jsdom), so to
// see the style TravellerAvatar hands AvatarImage, one test below renders
// AvatarImage as a plain <img>. Everything else stays real.
const { plainImage } = vi.hoisted(() => ({ plainImage: { on: false } }));
vi.mock("@/components/ui/avatar", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/components/ui/avatar")>();
  const React = await import("react");
  function AvatarImage(props: React.ComponentProps<typeof real.AvatarImage>) {
    if (!plainImage.on) return React.createElement(real.AvatarImage, props);
    return React.createElement("img", { src: props.src, alt: props.alt, style: props.style });
  }
  return { ...real, AvatarImage };
});

import { TravellerAvatar } from "./traveller-avatar";

describe("TravellerAvatar", () => {
  it("renders an img sourced from /api/avatars/:id when the traveller has an uploaded photo", async () => {
    render(
      <TravellerAvatar
        traveller={{
          id: "u1",
          name: "Cam Williams",
          image: null,
          photoKey: "users/u1/photo.png",
          photoUpdatedAt: new Date("2026-01-01T00:00:00Z"),
        }}
      />,
    );
    const img = await screen.findByRole("img");
    expect(img.getAttribute("src")).toMatch(/^\/api\/avatars\/u1/);
  });

  it("renders initials and no img when the traveller has neither a photo nor a name", () => {
    render(<TravellerAvatar traveller={{ id: "u2", name: null, image: null }} />);
    expect(screen.getByText("T")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("titles the avatar with the resolved traveller name", async () => {
    render(
      <TravellerAvatar traveller={{ id: "u3", name: "Pat", image: null, displayName: "Pattycake" }} />,
    );
    expect(screen.getByText("P")).toBeInTheDocument();
    expect(screen.getByTitle("Pattycake")).toBeInTheDocument();
  });

  it("centres a photo with no focus point exactly as before (50% 50%)", () => {
    expect(travellerImagePosition({ id: "u1", name: "Cam", image: null })).toBe("50% 50%");
    expect(
      travellerImagePosition({ id: "u1", name: "Cam", image: null, photoFocalX: null, photoFocalY: null }),
    ).toBe("50% 50%");
  });

  it("puts the chosen focus point at the circle's centre", () => {
    expect(
      travellerImagePosition({ id: "u1", name: "Cam", image: null, photoFocalX: 0.25, photoFocalY: 0.8 }),
    ).toBe("25% 80%");
  });

  it("frames the photo on the Traveller's focus point via object-position", () => {
    plainImage.on = true;
    try {
      render(
        <TravellerAvatar
          traveller={{
            id: "u1",
            name: "Cam",
            image: null,
            photoKey: "k",
            photoUpdatedAt: new Date(0),
            photoFocalX: 0.25,
            photoFocalY: 0.8,
          }}
        />,
      );
      expect((screen.getByRole("img") as HTMLImageElement).style.objectPosition).toBe("25% 80%");
    } finally {
      plainImage.on = false;
    }
  });
});
