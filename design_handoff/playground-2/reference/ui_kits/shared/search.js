import { trip, people, wishlist, dayPlan } from './data.js';
// Client-side trip search used by both kits (in the app: a Server Action over Postgres full-text)
export function searchIndex(q) {
  const s = (q || '').trim().toLowerCase();
  if (!s) return { total: 0, groups: [] };
  const m = t => t.toLowerCase().includes(s);
  const stops = trip.stops.filter(x => m(x.name) || m(x.stay || '') || x.todos.some(m)).map(x => ({ tile: '▲', tone: x.chapter === 'Kanto' ? 'teal' : 'lilac', title: x.name, sub: `${x.from} – ${x.to} · ${x.nights} night${x.nights > 1 ? 's' : ''}${x.stay ? ' · ' + x.stay : ' · no bed'}`, go: 'stop', id: x.id }));
  const things = trip.stops.flatMap(x => x.todos.filter(m).map(t => ({ tile: '✓', tone: 'white', title: t, sub: x.name, go: 'stop', id: x.id })))
    .concat(dayPlan.items.filter(([, t]) => m(t)).map(([time, t]) => ({ tile: time.slice(0, 2), tone: 'sun', title: t, sub: dayPlan.date + ' · ' + time, go: 'days' })));
  const ideas = wishlist.filter(w => m(w.title) || m(w.where)).map(w => ({ tile: '♥', tone: 'coral', title: w.title, sub: w.where + ' · ' + w.votes + ' votes', go: 'wishlist' }));
  const ppl = people.filter(p => m(p.name)).map(p => ({ tile: p.initials, tone: p.tone, title: p.name, sub: p.you ? 'you · owner' : 'editor', go: 'shared' }));
  const costs = trip.costs.filter(c => m(c.cat) || m(c.note)).map(c => ({ tile: '¥', tone: c.tone === 'white' ? 'white' : c.tone, title: c.cat, sub: c.note, go: 'money' }));
  const groups = [['Stops', stops], ['Things to do', things], ['Ideas', ideas], ['People', ppl], ['Money', costs]].filter(([, i]) => i.length).map(([label, items]) => ({ label, items }));
  return { total: groups.reduce((n, g) => n + g.items.length, 0), groups };
}
