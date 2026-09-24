import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TransportCountdown } from "./transport-countdown";

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
});
