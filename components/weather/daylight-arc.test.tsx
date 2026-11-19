import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { daylightLabel, formatDayLength, DaylightArc } from "@/components/weather/daylight-arc";

const day = { sunrise: "08:12", sunset: "16:33", dayLengthMin: 501, polarDay: false, polarNight: false };
const marker = (c: HTMLElement) => c.querySelector<HTMLElement>("[data-sun-marker]");

describe("daylight labels", () => {
  it("reads the day length and the times", () => {
    expect(formatDayLength(501)).toBe("8h 21m");
    expect(daylightLabel(day)).toBe("Daylight 08:12 to 16:33, 8 hours 21 minutes");
  });
  it("names polar day and polar night", () => {
    expect(daylightLabel({ ...day, sunrise: null, sunset: null, dayLengthMin: 1440, polarDay: true })).toBe("Daylight all day");
    expect(daylightLabel({ ...day, sunrise: null, sunset: null, dayLengthMin: 0, polarNight: true })).toBe("Polar night");
  });
});

describe("DaylightArc", () => {
  it("is one labelled image with sunrise, sunset and the day length as text", () => {
    render(<DaylightArc {...day} size="regular" />);
    expect(screen.getByRole("img", { name: "Daylight 08:12 to 16:33, 8 hours 21 minutes" })).toBeInTheDocument();
    expect(screen.getByText("↑ 08:12")).toBeInTheDocument();
    expect(screen.getByText("16:33 ↓")).toBeInTheDocument();
    expect(screen.getByText("8h 21m daylight")).toBeInTheDocument();
  });
  it("puts the day length below the arc, in flow", () => {
    render(<DaylightArc {...day} size="regular" />);
    const label = screen.getByText("8h 21m daylight");
    expect(label.className).not.toMatch(/absolute/);
    expect(screen.getByRole("img").contains(label)).toBe(false);
  });
  it("compact shortens the day length", () => {
    render(<DaylightArc {...day} size="compact" />);
    expect(screen.getByText("8h 21m")).toBeInTheDocument();
    expect(screen.queryByText("8h 21m daylight")).toBeNull();
  });
  it("shows no sun without a now", () => {
    const { container } = render(<DaylightArc {...day} size="regular" />);
    expect(container.querySelector("[data-daylight-arc]")).toBeTruthy();
    expect(marker(container)).toBeNull();
  });
  it("puts the sun on the arc when now is inside the day", () => {
    const { container } = render(<DaylightArc {...day} sunrise="08:00" sunset="16:00" dayLengthMin={480} now="12:00" size="regular" />);
    expect(marker(container)!.style.left).toBe("50%");
  });
  it("shows no sun before sunrise or after sunset", () => {
    const { container } = render(<DaylightArc {...day} now="21:00" size="regular" />);
    expect(marker(container)).toBeNull();
  });
  it("polar day and polar night carry no times and no sun", () => {
    const { container, unmount } = render(<DaylightArc sunrise={null} sunset={null} dayLengthMin={1440} polarDay polarNight={false} now="12:00" size="regular" />);
    expect(screen.getByRole("img", { name: "Daylight all day" })).toBeInTheDocument();
    expect(screen.queryByText(/↑/)).toBeNull();
    expect(marker(container)).toBeNull();
    unmount();
    render(<DaylightArc sunrise={null} sunset={null} dayLengthMin={0} polarDay={false} polarNight now="12:00" size="regular" />);
    expect(screen.getByRole("img", { name: "Polar night" })).toBeInTheDocument();
  });
});
