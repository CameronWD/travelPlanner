import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const fieldProps = vi.hoisted(() => ({ last: null as Record<string, unknown> | null }));
vi.mock("@/components/trip/settings/cover-image-field", () => ({
  CoverImageField: (props: Record<string, unknown>) => {
    fieldProps.last = props;
    return null;
  },
}));

import { CoverUploaderDialog } from "./cover-uploader-dialog";

describe("CoverUploaderDialog", () => {
  it("forwards the stored aspect to the cover field", async () => {
    render(<CoverUploaderDialog tripId="t1" hasCover aspect={1.5} trigger={<button>Change</button>} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Change" }));
    expect(fieldProps.last?.aspect).toBe(1.5);
  });
});
