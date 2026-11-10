// Web research for one-off local happenings on EVERY day we're on the road for a job (Alyssa, 11/3/26): the event
// day, each crew call (multi-day installs, next-day strikes), studio days and destination travel-in / travel-back
// days. Looks for anything that snarls traffic, closes roads or kills parking/loading near the venue, the studio
// pickup, or the route: parades, races, festivals, street fairs, concerts, games, protests, motorcades, film
// shoots, other big events at the same venue, parking suspensions, bridge/tunnel/road work.
// Uses the Anthropic web search tool. Recurring events (marathons, tree lighting, NYE...) are also in
// local-events.mjs, which runs without the web.
// Same file in the hub: src/lib/engine/local-research.mjs (keep identical).

const DAY = 864e5;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const pretty = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric', year: '2-digit', timeZone: 'UTC' });

// "2027-06-12", "6/12/27", "Sat 6/12/2027" -> "2027-06-12" (or null)
export function toIso(raw) {
  const s = String(raw || '');
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return null;
}

// Every day we're on the road: [{ date: 'YYYY-MM-DD', why: 'install, strike' }], sorted.
export function researchDays(eventDate, plan = {}) {
  const days = new Map();
  const add = (d, why) => { const k = toIso(d); if (!k) return; days.set(k, [...new Set([...(days.get(k) || []), why])]); };
  add(eventDate, 'event day');
  for (const s of plan.shifts || []) add(s.date, s.kind || s.label || 'crew call');
  for (const s of plan.studio_days || []) add(s.date, 'studio day');
  if (Number(plan.travel?.hotel_nights) > 0 && days.size) {
    const all = [...days.keys()].sort();
    add(iso(Date.parse(`${all[0]}T12:00:00Z`) - DAY), 'travel in (hotel night)');
    add(iso(Date.parse(`${all[all.length - 1]}T12:00:00Z`) + DAY), 'travel back');
  }
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, why]) => ({ date, why: why.join(', ') }));
}

// Days in `days` not within a day of anything in `done` (ISO strings).
export function uncovered(days, done = []) {
  const ts = done.map((d) => Date.parse(`${d}T12:00:00Z`));
  return days.filter((d) => !ts.some((t) => Math.abs(Date.parse(`${d.date}T12:00:00Z`) - t) <= DAY));
}

// { notes, days: [ISO], error }
export async function researchLocalHappenings({ key, model, venue, studio, days = [], from = 'Montclair NJ or Forked River NJ', truck = false }) {
  if (!key || !venue || !days.length) return { notes: '', days: [], error: key ? null : 'no ANTHROPIC_API_KEY' };
  // Each crew-call day is searched as a window: the day before (and that night), the day itself, that night, and the
  // next day (Alyssa, 11/10/26), since setups, closures and crowds spill over.
  const shift = (d, n) => iso(Date.parse(`${d}T12:00:00Z`) + n * DAY);
  const list = days.slice(0, 8).map((d) => `- ${pretty(d.date)} (${d.why}): check ${pretty(shift(d.date, -1))} (day before + that night), ${pretty(d.date)} (day of + night of) and ${pretty(shift(d.date, 1))} (next day)`).join('\n');
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: model || 'claude-opus-4-5',
        max_tokens: 2000,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: Math.min(12, 4 + 2 * days.length) }],
        messages: [{ role: 'user', content: `An event crew (vans${truck ? ' and a box truck / U-Haul' : ', sometimes a box truck'}) works at ${venue}${studio ? `, with pickup/drop-off at ${studio}` : ''}, driving from ${from}. They are on the road on these days:
${list}

Search the web for anything in each of those windows (day before + that night, day of, night of, next day) that will snarl traffic, close roads, lock down blocks or make parking and loading hard near the venue, near the pickup/drop-off, or on the likely route:
- parades, marathons/races, festivals, street fairs, farmers markets, holiday events, concerts, sports games, protests, presidential/UN motorcades
- another big event at the same venue or next door (conference, gala, second wedding, game day crowds)
- film/TV shoots and street parking suspensions or "no parking" permits on the venue's block (e.g. NYC film permits)
- bridge, tunnel, highway or road work closures on the route (NJ Turnpike, Garden State Pkwy, I-287, I-95, Lincoln/Holland Tunnel, GWB, Verrazzano...)
- beach-town summer parking/loading rules, ferry or causeway closures
Answer in at most 10 short bullet lines, labeling which window each is in: "- <date> (day before / day of / night of / next day): <what>, <hours>, <where / which roads or blocks>, <what it means for us (traffic, parking, loading)>, <source site>". Only things you actually found for these days. If you find nothing, answer exactly: NONE FOUND.` }],
      }),
    });
    if (!r.ok) return { notes: '', days: [], error: `research ${r.status}: ${(await r.text()).slice(0, 160)}` };
    const msg = await r.json();
    const text = (msg.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
    const none = /NONE FOUND/i.test(text) && text.length < 40;
    return { notes: none ? `Nothing found online for ${days.map((d) => pretty(d.date)).join(', ')}.` : text.slice(0, 3000), none, days: days.map((d) => d.date), error: null };
  } catch (e) {
    return { notes: '', days: [], error: `research failed: ${e.message}` };
  }
}
