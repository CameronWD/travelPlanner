import { describe, expect, it } from "vitest";
import { buildStillToBook, type StillToBookSource } from "./still-to-book";

const src = (o: Partial<StillToBookSource> & Pick<StillToBookSource, "id" | "kind">): StillToBookSource => ({
  label: o.id, bookingState: "TO_BOOK", bookBy: null, date: null, stopId: null, ...o,
});

describe("buildStillToBook (Home, spec R2)", () => {
  it("lists only To book things, by book-by date then the thing's own date, undated last", () => {
    const rows = buildStillToBook(
      [
        src({ id: "tour", kind: "ITEM", date: "2027-06-02", stopId: "porto" }),
        src({ id: "leg", kind: "TRANSPORT", bookBy: "2027-05-01", date: "2027-06-04", stopId: "porto" }),
        src({ id: "stay", kind: "ACCOMMODATION", bookBy: "2027-05-01", date: "2027-06-01", stopId: "porto" }),
        src({ id: "done", kind: "TRANSPORT", bookingState: "BOOKED", date: "2027-06-01" }),
        src({ id: "walk", kind: "ITEM", bookingState: "NONE", date: "2027-06-01" }),
        src({ id: "someday", kind: "ITEM" }),
      ],
      "/trips/xmas",
    );
    expect(rows.map((r) => r.id)).toEqual(["stay", "leg", "tour", "someday"]);
  });

  it("says when to book it by and when it happens, and links to its thing", () => {
    const [leg, stay, tour, someday] = buildStillToBook(
      [
        src({ id: "leg", kind: "TRANSPORT", label: "Train · Strasbourg → Frankfurt", bookBy: "2027-05-01", date: "2027-06-04", stopId: "stras" }),
        src({ id: "stay", kind: "ACCOMMODATION", label: "Casa", bookBy: "2027-05-02", date: "2027-06-01", stopId: "porto" }),
        src({ id: "tour", kind: "ITEM", label: "Lodge tour", bookBy: "2027-05-03", date: "2027-06-02", stopId: "porto" }),
        src({ id: "someday", kind: "ITEM", label: "Fado night", bookBy: "2027-05-04", stopId: "porto" }),
      ],
      "/trips/xmas",
    );
    expect(leg).toMatchObject({ title: "Train · Strasbourg → Frankfurt", subtitle: "Book by Sat 1 May · Leaves Fri 4 Jun", href: "/trips/xmas/day/2027-06-04" });
    expect(stay).toMatchObject({ subtitle: "Book by Sun 2 May · Check-in Tue 1 Jun", href: "/trips/xmas/plan?stop=porto" });
    expect(tour).toMatchObject({ subtitle: "Book by Mon 3 May · Wed 2 Jun", href: "/trips/xmas/day/2027-06-02" });
    expect(someday).toMatchObject({ subtitle: "Book by Tue 4 May", href: "/trips/xmas/plan?stop=porto" });
  });

  it("an undated thing with no Stop and no book-by date still links to the Plan", () => {
    expect(buildStillToBook([src({ id: "x", kind: "TRANSPORT" })], "/trips/xmas")[0]).toMatchObject({ subtitle: "No date yet", href: "/trips/xmas/plan" });
  });
});
