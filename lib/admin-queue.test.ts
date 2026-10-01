import { describe, expect, it } from "vitest";
import {
  EMPTY_ADMIN_QUEUE,
  adminQueueLabel,
  adminQueueTotal,
  hasAdminQueue,
  withAdminQueueName,
} from "./admin-queue";

describe("adminQueueTotal", () => {
  it("sums both kinds", () => {
    expect(adminQueueTotal({ accessRequests: 2, feedbackNeedingReview: 3 })).toBe(5);
    expect(adminQueueTotal(EMPTY_ADMIN_QUEUE)).toBe(0);
  });
});

describe("hasAdminQueue", () => {
  it("is true only for an Admin with something waiting", () => {
    expect(hasAdminQueue(true, { accessRequests: 1, feedbackNeedingReview: 0 })).toBe(true);
    expect(hasAdminQueue(true, { accessRequests: 0, feedbackNeedingReview: 1 })).toBe(true);
    expect(hasAdminQueue(true, EMPTY_ADMIN_QUEUE)).toBe(false);
    expect(hasAdminQueue(false, { accessRequests: 1, feedbackNeedingReview: 1 })).toBe(false);
  });
});

describe("adminQueueLabel", () => {
  it("names each kind, pluralised, joined with 'and'", () => {
    expect(adminQueueLabel({ accessRequests: 1, feedbackNeedingReview: 0 })).toBe("1 access request waiting");
    expect(adminQueueLabel({ accessRequests: 3, feedbackNeedingReview: 0 })).toBe("3 access requests waiting");
    expect(adminQueueLabel({ accessRequests: 0, feedbackNeedingReview: 1 })).toBe("1 feedback note waiting");
    expect(adminQueueLabel({ accessRequests: 2, feedbackNeedingReview: 2 })).toBe(
      "2 access requests and 2 feedback notes waiting",
    );
  });

  it("is empty when nothing is waiting", () => {
    expect(adminQueueLabel(EMPTY_ADMIN_QUEUE)).toBe("");
  });
});

describe("withAdminQueueName", () => {
  it("appends the total only for an Admin with something waiting", () => {
    expect(withAdminQueueName("You", true, EMPTY_ADMIN_QUEUE)).toBe("You");
    expect(withAdminQueueName("You", false, { accessRequests: 1, feedbackNeedingReview: 1 })).toBe("You");
    expect(
      withAdminQueueName("Open traveller menu", true, { accessRequests: 1, feedbackNeedingReview: 1 }),
    ).toBe("Open traveller menu, 2 waiting in Admin");
  });
});
