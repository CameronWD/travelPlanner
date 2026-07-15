import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TransportCountdown } from "./transport-countdown";

describe("TransportCountdown", () => {
  it("renders an amber-tinted block for a future departure", () => {
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

    // Outer wrapper must contain amber classes
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toMatch(/amber/);
  });

  it("renders null when departure has already passed", () => {
    const pastDepAt = new Date(Date.now() - 60 * 1000).toISOString();

    const { container } = render(
      <TransportCountdown depAt={pastDepAt} label="Flight BA123" />,
    );

    expect(container.firstChild).toBeNull();
  });
});
