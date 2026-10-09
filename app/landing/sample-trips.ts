/**
 * Sample trips for the Landing's card fan (landing-shuffle-handoff/LANDING.md §4).
 * Static, illustrative copy — not real data, never fetched. The first entry is
 * what renders on the server and on first paint. Card copy must not use the
 * words "stay", "staying" or "hotel" (existing test rule).
 */
export type SampleTrip = {
  status: "Planning" | "On the road" | "Done";
  name: string;
  big: string;            // the big number on the front card
  small: [string, string]; // two short lines beside it
  place: string;          // lilac card label, e.g. "Kyoto · 4 nights"
  bed: string;            // lilac card title
  city: string;           // weather card
  temp: string;           // e.g. "21°"
  sky: "sun" | "cloud";   // lucide Sun / Cloud beside temp
  wear: string;
  leg: string;            // sun chip, e.g. "Shinkansen · 11:12" (→ rendered as ArrowRight)
  stops: [string, string, string, string];
  // desktop-only pieces
  date: string;           // already formatted, e.g. "Tue 14 Oct"
  plan: { time: string; what: string }[];
  spend: string;
  amount: string;
  owes: string;
  who: [string, string];  // initials
  note: [string, string]; // teal "fork" card, two lines
  wish: string;
  hearts: number;
};

export const SAMPLE_TRIPS: SampleTrip[] = [
  {
    status: "Planning", name: "Japan in Autumn", big: "26", small: ["sleeps", "to go"],
    place: "Kyoto · 4 nights", bed: "Machiya near Gion",
    city: "Kyoto", temp: "21°", sky: "sun", wear: "light jacket tonight",
    leg: "Shinkansen · 11:12", stops: ["Tokyo", "Hakone", "Kyoto", "Osaka"],
    date: "Tue 14 Oct",
    plan: [{ time: "09:00", what: "Fushimi Inari" }, { time: "12:30", what: "Nishiki lunch" }, { time: "19:00", what: "Pontochō" }],
    spend: "Ramen at Ichiran", amount: "¥2,400", owes: "Jess owes you ¥1,200",
    who: ["JM", "AL"], note: ["Jess made a what-if plan", "“Slow Kyoto”"], wish: "Naoshima art island", hearts: 2,
  },
  {
    status: "On the road", name: "Portugal by rail", big: "5", small: ["of 12", "days"],
    place: "Porto · 3 nights", bed: "Flat on the Ribeira",
    city: "Porto", temp: "18°", sky: "cloud", wear: "bring a layer",
    leg: "Alfa Pendular · 09:39", stops: ["Lisbon", "Sintra", "Coimbra", "Porto"],
    date: "Sat 9 May",
    plan: [{ time: "10:00", what: "Livraria Lello" }, { time: "13:00", what: "Café Santiago" }, { time: "18:30", what: "Port lodges" }],
    spend: "Pastéis de Belém", amount: "€9.60", owes: "Sam owes you €4.80",
    who: ["SK", "JM"], note: ["Sam added", "“Douro wine day”"], wish: "Surf lesson in Ericeira", hearts: 3,
  },
  {
    status: "Done", name: "Patagonia loop", big: "14", small: ["nights", "away"],
    place: "El Chaltén · 2 nights", bed: "Cabin under Fitz Roy",
    city: "El Chaltén", temp: "9°", sky: "cloud", wear: "windy all day",
    leg: "Bus · 07:30", stops: ["Punta Arenas", "Puerto Natales", "El Calafate", "El Chaltén"],
    date: "Thu 6 Mar",
    plan: [{ time: "06:30", what: "Laguna de los Tres" }, { time: "14:00", what: "Chorrillo del Salto" }, { time: "20:00", what: "Lamb asado" }],
    spend: "Glacier boat", amount: "US$95", owes: "Ana owes you US$47.50",
    who: ["AL", "JM"], note: ["Ana added", "42 photos"], wish: "Torres del Paine W trek", hearts: 4,
  },
  {
    status: "Planning", name: "Lakes weekend", big: "3", small: ["sleeps", "to go"],
    place: "Varenna · 2 nights", bed: "Villa room, lake view",
    city: "Como", temp: "24°", sky: "sun", wear: "swim before dinner",
    leg: "Ferry · 10:05", stops: ["Milan", "Como", "Bellagio", "Varenna"],
    date: "Sat 13 Jun",
    plan: [{ time: "09:30", what: "Ferry to Bellagio" }, { time: "13:00", what: "Il Gatto Nero" }, { time: "17:00", what: "Swim at the lido" }],
    spend: "Ferry tickets", amount: "€27.60", owes: "Mia owes you €13.80",
    who: ["MR", "JM"], note: ["Mia made a what-if plan", "“Lakes, slower”"], wish: "Villa del Balbianello", hearts: 2,
  },
];
