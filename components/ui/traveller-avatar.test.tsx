import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
