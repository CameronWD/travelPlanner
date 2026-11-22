import { describe, expect, it } from "vitest";
import {
  FEEDBACK_PICTURE_MIMES,
  MAX_FEEDBACK_PICTURES,
  feedbackPictureUrl,
} from "@/lib/feedback/pictures";

describe("feedback pictures", () => {
  it("allows four pictures a note", () => {
    expect(MAX_FEEDBACK_PICTURES).toBe(4);
  });

  it("accepts JPEG, PNG and WebP only", () => {
    expect([...FEEDBACK_PICTURE_MIMES]).toEqual(["image/jpeg", "image/png", "image/webp"]);
  });

  it("serves a picture from its own route", () => {
    expect(feedbackPictureUrl("abc")).toBe("/api/feedback-pictures/abc");
  });
});
