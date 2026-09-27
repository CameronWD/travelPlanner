import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { daylightGeometry, daylightLabel, formatDayLength, DaylightBar } from "@/components/weather/daylight-bar";

const day = { sunrise: "08:12", sunset: "16:33", dayLengthMin: 501, polarDay: false, polarNight: false };

describe("daylight bar", () => {
  it("places the segment at sunrise/24h with width (sunset−sunrise)/24h", () => {
    const g = daylightGeometry(day);
    expect(g.leftPct).toBeCloseTo((8 * 60 + 12) / 1440 * 100, 3);
    expect(g.widthPct).toBeCloseTo(501 / 1440 * 100, 3);
  });
  it("polar day is a full bar, polar night an empty one (review focus 5)", () => {
    expect(daylightGeometry({ ...day, sunrise: null, sunset: null, dayLengthMin: 1440, polarDay: true })).toEqual({ leftPct: 0, widthPct: 100 });
    expect(daylightGeometry({ ...day, sunrise: null, sunset: null, dayLengthMin: 0, polarNight: true })).toEqual({ leftPct: 0, widthPct: 0 });
    expect(daylightLabel({ ...day, sunrise: null, sunset: null, dayLengthMin: 1440, polarDay: true })).toBe("Daylight all day");
    expect(daylightLabel({ ...day, sunrise: null, sunset: null, dayLengthMin: 0, polarNight: true })).toBe("Polar night");
  });
  it("labels", () => {
    expect(formatDayLength(501)).toBe("8h 21m");
    expect(daylightLabel(day)).toBe("Daylight 08:12 to 16:33, 8 hours 21 minutes");
  });
  it("renders role=img with the label and the sunrise/sunset captions", () => {
    render(<DaylightBar daylight={day} size="regular" segmentClass="bg-wx-sunny" trackClass="bg-card" />);
    expect(screen.getByRole("img", { name: "Daylight 08:12 to 16:33, 8 hours 21 minutes" })).toBeInTheDocument();
    expect(screen.getByText("↑ 08:12")).toBeInTheDocument();
    expect(screen.getByText("16:33 ↓")).toBeInTheDocument();
    expect(screen.getByText("8h 21m daylight")).toBeInTheDocument();
  });
  it("compact shortens the middle caption", () => {
    render(<DaylightBar daylight={day} size="compact" segmentClass="bg-wx-sunny" trackClass="bg-card" />);
    expect(screen.getByText("8h 21m")).toBeInTheDocument();
    expect(screen.queryByText("8h 21m daylight")).toBeNull();
  });
});
