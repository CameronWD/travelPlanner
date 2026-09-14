import { render, screen } from "@testing-library/react";
import { it, expect } from "vitest";
import { AttachmentLinks } from "@/components/trip/attachment-links";

const att = { id: "a1", filename: "boarding.pdf", mime: "application/pdf", size: 1, url: "/api/attachments/a1", uploadedById: "u1", createdAt: new Date() };

it("links each attachment and renders nothing when empty", () => {
  const { container, rerender } = render(<AttachmentLinks attachments={[att]} />);
  const link = screen.getByRole("link", { name: /boarding.pdf/i });
  expect(link).toHaveAttribute("href", "/api/attachments/a1");
  rerender(<AttachmentLinks attachments={[]} />);
  expect(container).toBeEmptyDOMElement();
});

it("opens attachments in-app so the offline cache can serve them", () => {
  render(<AttachmentLinks attachments={[att]} />);
  const link = screen.getByRole("link", { name: /boarding\.pdf/i });
  expect(link).not.toHaveAttribute("target");
});
