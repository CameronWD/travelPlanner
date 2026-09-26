export const people = [
  { initials: 'CW', name: 'Cameron', tone: 'teal', you: true },
  { initials: 'JM', name: 'Jess', tone: 'sun' },
  { initials: 'AL', name: 'Alex', tone: 'lilac' },
];
export const trip = {
  name: 'Japan in Autumn', dates: '12 – 24 Oct', sleeps: 26, currency: 'JPY', spent: 184000, est: 312000, nights: 12,
  home: { city: 'Sydney', flight: 'JQ 19', dep: '21:35', arr: 'HND 06:15' },
  chapters: [{ name: 'Kanto', tone: 'teal', dates: 'Oct 13 – 18' }, { name: 'Kansai', tone: 'lilac', dates: 'Oct 18 – 24' }],
  stops: [
    { id: 'tokyo', name: 'Tokyo', chapter: 'Kanto', from: 'Oct 13', to: 'Oct 17', nights: 4, stay: 'Nohga Hotel Ueno', stayCost: 96000, paid: true, todos: ['Tsukiji breakfast', 'teamLab Planets', 'Shimokitazawa'], out: { label: 'Romancecar', time: 'Shinjuku 09:00 → Hakone-Yumoto 10:25', cost: 2470 } },
    { id: 'hakone', name: 'Hakone', chapter: 'Kanto', from: 'Oct 17', to: 'Oct 18', nights: 1, stay: null, todos: ['Open-Air Museum', 'Onsen'], out: { label: 'Shinkansen Hikari', time: 'Odawara 11:12 → Kyoto 13:20', cost: 13080 } },
    { id: 'kyoto', name: 'Kyoto', chapter: 'Kansai', from: 'Oct 18', to: 'Oct 22', nights: 4, stay: 'Machiya near Gion', stayCost: 88000, paid: true, todos: ['Fushimi Inari', 'Nishiki market', 'Arashiyama', 'Gion walk', 'Pontocho dinner'], out: null },
    { id: 'osaka', name: 'Osaka', chapter: 'Kansai', from: 'Oct 22', to: 'Oct 24', nights: 2, stay: 'Hostel Namba', stayCost: 24000, paid: false, todos: ['Dotonbori', 'Kuromon market'], out: { label: 'Fly home · JQ 20', time: 'KIX 20:10 → SYD', cost: 0 } },
  ],
  todo: [
    { tile: 'Zz', tone: 'lilac', title: 'Hakone needs a bed', sub: '1 night · Oct 17', stop: 'hakone' },
    { tile: '→', tone: 'sun', title: 'Kyoto → Osaka, how?', sub: 'Oct 21 · no transport yet', stop: 'kyoto' },
  ],
  costs: [
    { cat: 'Beds', tone: 'lilac', spent: 184000, est: 208000, note: 'Osaka unpaid' },
    { cat: 'Trains', tone: 'sun', spent: 0, est: 28000, note: '2 legs to book' },
    { cat: 'Food', tone: 'teal', spent: 0, est: 46000, note: '¥3.8k a day' },
    { cat: 'Fun', tone: 'coral', spent: 0, est: 30000, note: 'museums, onsen' },
    { cat: 'Flights', tone: 'white', spent: 0, est: 0, note: 'paid with points ✓' },
  ],
  activity: [
    { who: 'JM', text: 'added Kawaii Monster Cafe to the wishlist', when: '2h' },
    { who: 'CW', text: 'booked Machiya near Gion · ¥88,000', when: 'yesterday' },
    { who: 'AL', text: 'moved Arashiyama to Oct 20', when: 'Mon' },
    { who: 'JM', text: 'forked "Slow Kyoto"', when: 'Sun' },
  ],
};
export const trips = [
  { name: 'Japan in Autumn', status: 'NEXT UP · 26 SLEEPS', sub: 'Oct 12 – 24 · 4 stops · 2 to sort', tone: 'coral', big: true },
  { name: 'NZ South Island', status: 'PLANNING', sub: 'Dec 26 · 6 stops', tone: 'teal' },
  { name: 'Europe by rail', status: 'IDEA', sub: 'Summer 27 · no dates', tone: 'lilac' },
  { name: 'Tassie road trip', status: 'DONE', sub: 'Mar 2026 · 12 journal entries', tone: 'white' },
];
export const wishlist = [
  { title: 'Naoshima art island', who: 'CW', tone: 'teal', where: 'Kansai?', votes: 3 },
  { title: 'Kaiseki dinner', who: 'AL', tone: 'lilac', where: 'Kyoto', votes: 2 },
  { title: 'Nara deer park', who: 'JM', tone: 'sun', where: 'day trip', votes: 2 },
  { title: 'Fuji sunrise', who: 'CW', tone: 'teal', where: 'Hakone', votes: 1 },
  { title: 'Kawaii Monster Cafe', who: 'JM', tone: 'sun', where: 'Tokyo', votes: 1 },
  { title: 'Tsukiji fish auction', who: 'AL', tone: 'lilac', where: 'Tokyo · in plan ✓', votes: 3, planned: true },
];
// October: 12 = fly, 13–17 Tokyo, 17 Hakone, 18–22 Kyoto, 22–24 Osaka, 24 fly home
export const october = Array.from({ length: 35 }, (_, i) => {
  const d = i - 2 + 1; // grid starts Mon Sep 29
  if (d < 1 || d > 31) return { d: null };
  const c = d === 12 || d === 24 ? { tone: 'ink', label: d === 12 ? 'FLY SYD' : 'FLY HOME' }
    : d >= 13 && d <= 16 ? { tone: 'teal', label: d === 13 ? 'TOKYO' : '' }
    : d === 17 ? { tone: 'coral', label: 'HAKONE · NO BED' }
    : d >= 18 && d <= 21 ? { tone: 'lilac', label: d === 18 ? 'KYOTO ×6' : d === 21 ? '→ OSAKA ?' : '' }
    : d === 22 || d === 23 ? { tone: 'sun', label: d === 22 ? 'OSAKA' : '' } : { tone: null, label: '' };
  return { d, ...c };
});
export const dayPlan = { date: 'Sat 18 Oct', packed: true, items: [['11:12', 'Shinkansen Odawara → Kyoto'], ['14:00', 'Check in · Machiya near Gion'], ['15:00', 'Nishiki market'], ['17:30', 'Gion walk'], ['19:30', 'Pontocho dinner'], ['21:00', 'Yasaka shrine at night']] };
export const yen = n => '¥' + (n >= 1000 ? Math.round(n / 1000) + 'k' : n);
export const yenFull = n => '¥' + n.toLocaleString();
