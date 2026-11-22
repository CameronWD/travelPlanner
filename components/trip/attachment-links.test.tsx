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

it("shows a titled file by its title", () => {
  render(<AttachmentLinks attachments={[{ ...att, title: "Boarding pass" }]} />);
  expect(screen.getByRole("link", { name: /Boarding pass/ })).toBeInTheDocument();
});

it("stacks attachments one per line with no gap between them", () => {
  render(<AttachmentLinks attachments={[att, { ...att, id: "a2", filename: "tickets.pdf", url: "/api/attachments/a2" }]} />);
  const wrapper = screen.getByRole("link", { name: /boarding\.pdf/i }).parentElement!;
  expect(wrapper.className).toMatch(/flex-col/);
  expect(wrapper.className).not.toMatch(/gap-/);
});

it("gives each link a 32-point touch height across the full line", () => {
  render(<AttachmentLinks attachments={[att, { ...att, id: "a2", filename: "tickets.pdf", url: "/api/attachments/a2" }]} />);
  for (const name of [/boarding\.pdf/i, /tickets\.pdf/i]) {
    const link = screen.getByRole("link", { name });
    expect(link.className).toMatch(/pointer-coarse:min-h-8/);
    expect(link.className).toMatch(/w-full/);
    expect(link.className).not.toMatch(/pointer-coarse:min-h-11/);
    expect(link.className).not.toMatch(/pointer-coarse:min-w-11/);
  }
});
