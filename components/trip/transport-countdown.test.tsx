import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TransportCountdown } from "./transport-countdown";
import type { AttachmentView } from "@/lib/attachment-view";

function file(over: Partial<AttachmentView>): AttachmentView {
  return { id: "a1", filename: "f.pdf", title: null, mime: "application/pdf", size: 1, url: "/api/attachments/a1", uploadedById: "u1", createdAt: new Date(), ...over };
}

describe("TransportCountdown", () => {
  it("renders the kit 'Up next' coral Card for a future departure", () => {
    // Set departure ~2 hours from now so the component does NOT bail to null
    const futureDepAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    const { container } = render(
      <TransportCountdown
        depAt={futureDepAt}
        depTimeLabel="14:30"
        depZone="JST"
        label="Flight BA123"
      />,
    );

    // Component should render something (not null bail-out)
    expect(container.firstChild).not.toBeNull();

    // Kit shared/onthego.jsx "Up next": Card tone="coral" shadow={4} radius="xl".
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toMatch(/\bbg-coral\b/);
    expect(wrapper.className).toMatch(/\bborder-2\b/);
    expect(wrapper.className).toMatch(/\bshadow-hard-4\b/);
    expect(wrapper.className).toMatch(/\brounded-xl\b/);
    // Label, leave time and zone all still render.
    expect(container.textContent).toContain("Flight BA123");
    expect(container.textContent).toContain("14:30");
    expect(container.textContent).toContain("JST");
    expect(container.textContent).toMatch(/Next departure · in \d+h \d+m/);
  });

  it("renders null when departure has already passed", () => {
    const pastDepAt = new Date(Date.now() - 60 * 1000).toISOString();

    const { container } = render(
      <TransportCountdown depAt={pastDepAt} label="Flight BA123" />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("shows each of the departure's files as a link chip, named by title else filename", () => {
    const depAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const { getByRole, queryByRole } = render(
      <TransportCountdown
        depAt={depAt}
        depTimeLabel="14:30"
        label="Flight BA123"
        attachments={[
          file({ id: "a1", title: "Boarding pass", filename: "BA123.pdf", url: "/api/attachments/a1" }),
          file({ id: "a2", title: null, filename: "seat-map.png", url: "/api/attachments/a2", mime: "image/png" }),
        ]}
      />,
    );

    expect(getByRole("link", { name: /Boarding pass/ }).getAttribute("href")).toBe("/api/attachments/a1");
    expect(getByRole("link", { name: /seat-map\.png/ }).getAttribute("href")).toBe("/api/attachments/a2");
    expect(queryByRole("link", { name: /BA123\.pdf/ })).toBeNull();
  });

  it("a long unbroken filename wraps inside the card instead of overflowing", () => {
    const depAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const name = "BoardingPass_BA0005_12NOV_SMITHJOHNMR.pdf";
    const { getByRole, getByText } = render(
      <TransportCountdown depAt={depAt} label="Flight BA123" attachments={[file({ id: "a1", title: null, filename: name })]} />,
    );

    const link = getByRole("link", { name });
    expect(link.classList.contains("max-w-full")).toBe(true);
    expect(link.classList.contains("min-w-0")).toBe(true);
    expect(getByText(name).classList.contains("[overflow-wrap:anywhere]")).toBe(true);
  });

  it("renders no file chips when the departure has no files", () => {
    const depAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const withEmpty = render(<TransportCountdown depAt={depAt} label="Flight BA123" attachments={[]} />);
    expect(withEmpty.queryAllByRole("link")).toEqual([]);
    withEmpty.unmount();
    const without = render(<TransportCountdown depAt={depAt} label="Flight BA123" />);
    expect(without.queryAllByRole("link")).toEqual([]);
  });
});
