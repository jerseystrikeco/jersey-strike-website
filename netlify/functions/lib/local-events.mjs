// Big local events that jam traffic, close roads or lock down blocks around a venue (parades, marathons, tree
// lightings, NYE, UN week...). Code, not memory: dates are computed for the event's year, and the area is matched
// from the venue / route text. The quote engine turns every hit into a red flag, and Claude adds the drive buffer
// to the timeline. Claude also researches the date online (lib/claude.mjs researchLocalEvents) for anything one-off
// (concerts, games, protests, construction) that isn't on this list.
// To add a recurring event: add it to EVENTS below (same file in the hub: src/lib/engine/local-events.mjs).

const DAY = 864e5;
const NYC = /\b(manhattan|new york,? ny|nyc|new york city|brooklyn|queens|bronx|staten island|harlem|midtown|soho|tribeca|chelsea|hudson yards|financial district|fidi|lower east side|upper (east|west) side|williamsburg|dumbo|long island city|astoria|flushing|1000\d|100[1-9]\d|101\d\d|102\d\d|112\d\d|113\d\d|114\d\d|104\d\d|103\d\d)\b/i;
const MIDTOWN = /\b(midtown|rockefeller|rock center|30 rock|radio city|fifth (ave|avenue)|5th (ave|avenue)|sixth (ave|avenue)|6th (ave|avenue)|avenue of the americas|times square|bryant park|herald square|columbus circle|central park south|plaza hotel|st\.? regis|park ave|madison ave|grand central|hudson yards|10001|10016|10017|10018|10019|10020|10022|10036|10103|10104|10105|10106|10107|10110|10111|10112|10118|10119|10120|10123|10152|10153|10154|10166|10167|10168|10169|10170|10171|10172|10173|10174|10175|10176|10177|10178)\b/i;
const UWS_CPW = /\b(upper west side|central park west|columbus ave|amsterdam ave|museum of natural history|amnh|lincoln center|10023|10024|10025)\b/i;
const EAST_MIDTOWN = /\b(united nations|\bun\b|turtle bay|first (ave|avenue)|1st (ave|avenue)|second (ave|avenue)|2nd (ave|avenue)|lexington|park ave|grand central|waldorf|10017|10022|10016)\b/i;
const QUEENS_FLUSHING = /\b(flushing|corona|queens|forest hills|citi field|usta|11368|11354|11355)\b/i;
const PHILLY = /\b(philadelphia|philly|center city|rittenhouse|old city|fishtown|northern liberties|university city|manayunk|east falls|fairmount|art museum|ben(jamin)? franklin (pkwy|parkway)|kelly (dr|drive)|19[01]\d\d)\b/i;
const PHILLY_SOUTH = /\b(south philadelphia|south philly|lincoln financial|the linc|wells fargo center|citizens bank park|xfinity|stadium district|pattison|1914[58])\b/i;
const MEADOWLANDS = /\b(east rutherford|rutherford|meadowlands|metlife|secaucus|carlstadt|lyndhurst|american dream|07073|07094|07072|07071)\b/i;
const SHORE = /\b(lbi|long beach island|beach haven|ship bottom|surf city|harvey cedars|cape may|wildwood|avalon|stone harbor|sea isle|ocean city|margate|ventnor|atlantic city|point pleasant|bay head|mantoloking|seaside|lavallette|asbury park|belmar|spring lake|sea girt|manasquan|long branch|deal|monmouth beach|sandy hook|rumson)\b/i;

// [name, (year) => [start, end] UTC ms (inclusive), area regex, buffer minutes, what happens]
const nth = (y, mo, wd, n) => { const f = new Date(Date.UTC(y, mo, 1)).getUTCDay(); return Date.UTC(y, mo, 1 + ((wd - f + 7) % 7) + (n - 1) * 7); };
const last = (y, mo, wd) => { const l = new Date(Date.UTC(y, mo + 1, 0)); return Date.UTC(y, mo, l.getUTCDate() - ((l.getUTCDay() - wd + 7) % 7)); };
const thanks = (y) => nth(y, 10, 4, 4);
const one = (t) => [t, t];
export const EVENTS = [
  ['TCS New York City Marathon (first Sunday of November): bridges + avenues closed across all five boroughs (Verrazzano, Pulaski, Queensboro, Willis Ave bridges; 4th Ave Brooklyn; 1st Ave, 5th Ave, Central Park in Manhattan) from early morning to evening', (y) => one(nth(y, 10, 0, 1)), NYC, 90],
  ["Macy's Thanksgiving Day Parade: Central Park West + 6th Ave to 34th St closed from ~6am to early afternoon; balloon inflation the night before closes the streets around the Museum of Natural History (W 77th-81st)", (y) => [thanks(y) - DAY, thanks(y)], NYC, 90],
  ['Rockefeller Center Christmas Tree Lighting (usually the Wednesday after Thanksgiving): 48th-51st St between 5th and 6th Ave locked down from midday, crowd pens and NYPD closures, Midtown gridlock all evening', (y) => one(thanks(y) + 6 * DAY), MIDTOWN, 90],
  ['Midtown holiday season (Thanksgiving to early January): Rockefeller tree, 5th Ave windows, Radio City and Bryant Park crowds; pedestrian-only stretches of 5th Ave and 49th/50th St on busy nights, very slow Midtown traffic and almost no loading/parking', (y) => [thanks(y), Date.UTC(y + 1, 0, 6)], MIDTOWN, 45],
  ["New Year's Eve in Times Square: 38th-59th St between 6th and 8th Ave frozen from early afternoon, rolling closures across Midtown", (y) => one(Date.UTC(y, 11, 31)), MIDTOWN, 120],
  ["NYC St. Patrick's Day Parade: 5th Ave 44th-79th St closed ~10am-5pm, crowds across Midtown", (y) => { const d = Date.UTC(y, 2, 17); return one(new Date(d).getUTCDay() === 0 ? d - DAY : d); }, NYC, 60],
  ['NYC Pride March (last Sunday of June): 5th Ave from 25th St to the Village closed most of the day, Lower Manhattan gridlock', (y) => one(last(y, 5, 0)), NYC, 60],
  ['UN General Assembly high-level week (mid-to-late September): East Midtown frozen zones, motorcades and checkpoints around 1st/2nd Ave, 42nd-50th St; check the exact week', (y) => [Date.UTC(y, 8, 14), Date.UTC(y, 8, 30)], EAST_MIDTOWN, 60],
  ['US Open tennis (late August into September): heavy traffic on the Grand Central Pkwy / Van Wyck around Flushing Meadows', (y) => [last(y, 7, 1) - 6 * DAY, last(y, 7, 1) + 13 * DAY], QUEENS_FLUSHING, 45],
  ['Philadelphia Marathon weekend (the weekend before Thanksgiving): Ben Franklin Pkwy, Kelly Dr, MLK Dr, Center City streets and Manayunk closed Saturday (half/8K) and Sunday (full) from early morning to afternoon', (y) => [thanks(y) - 5 * DAY, thanks(y) - 4 * DAY], PHILLY, 90],
  ['6abc Dunkin Thanksgiving Day Parade (Philadelphia): JFK Blvd + Ben Franklin Pkwy closed in the morning', (y) => one(thanks(y)), PHILLY, 60],
  ['Mummers Parade (Philadelphia, New Year’s Day): Broad St + Center City closed all day', (y) => one(Date.UTC(y, 0, 1)), PHILLY, 90],
  ['Broad Street Run (Philadelphia, usually the first Sunday of May): Broad St closed north to south all morning', (y) => one(nth(y, 4, 0, 1)), PHILLY, 60],
  ['Penn Relays (Philadelphia, last Thu-Sat of April): University City traffic + Franklin Field crowds', (y) => { const sat = last(y, 3, 6); return [sat - 2 * DAY, sat]; }, PHILLY, 30],
  ['Wawa Welcome America / July 4th in Philadelphia: Ben Franklin Pkwy concert + fireworks, Center City closures all day', (y) => [Date.UTC(y, 6, 3), Date.UTC(y, 6, 4)], PHILLY, 90],
  ['Army-Navy Game (second Saturday of December; often at Lincoln Financial Field, check the host city): South Philly stadium district gridlock', (y) => one(nth(y, 11, 6, 2)), PHILLY_SOUTH, 60],
  ['MetLife Stadium / Meadowlands events (Giants + Jets games, big concerts): Route 3, NJ Turnpike western spur and Route 120 jam for hours before and after; check the stadium calendar for this date', (y) => [Date.UTC(y, 0, 1), Date.UTC(y, 11, 31)], MEADOWLANDS, 30],
  ['Jersey Shore summer weekends (Memorial Day to Labor Day): Garden State Pkwy, Route 72 / 35 / 37 and causeways back up Friday afternoon to Saturday morning, and Sunday afternoon inbound', (y) => [last(y, 4, 1) - 3 * DAY, nth(y, 8, 1, 1)], SHORE, 45, (t) => [5, 6, 0].includes(new Date(t).getUTCDay())],
];

const toUtcDay = (raw) => {
  const m = String(raw || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(Date.parse(`${raw} 12:00 UTC`));
  return isNaN(d) ? null : Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

// dates: event date plus any crew-call dates (ISO or "12/2/26"); places: venue, studio, route text.
// Returns [{ name, date, buffer }] for every event whose window and area match, checked 1 day either side.
export function localEvents(dates = [], places = []) {
  const text = places.filter(Boolean).join(' | ');
  if (!text) return [];
  const days = [...new Set(dates.map((d) => {
    const s = String(d || '');
    const us = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    return us ? Date.UTC(+(us[3].length === 2 ? `20${us[3]}` : us[3]), +us[1] - 1, +us[2]) : toUtcDay(s);
  }).filter((x) => x != null))];
  const out = new Map();
  for (const t of days) {
    const y = new Date(t).getUTCFullYear();
    for (const [name, win, area, buffer, dayFilter] of EVENTS) {
      if (!area.test(text)) continue;
      for (const yy of [y - 1, y]) { // windows that start in December and run into January
        const [a, b] = win(yy);
        if (t >= a - DAY && t <= b + DAY && (!dayFilter || dayFilter(t))) {
          const on = t >= a && t <= b;
          const key = name;
          if (!out.has(key)) out.set(key, { name, date: new Date(t).toISOString().slice(0, 10), buffer: on ? buffer : Math.round(buffer / 2), when: on ? 'same day' : 'the day before/after' });
        }
      }
    }
  }
  return [...out.values()];
}

// One line for Claude's prompt (LOCAL EVENTS section).
export function localEventsText(dates, places) {
  const hits = localEvents(dates, places);
  if (!hits.length) return 'No big recurring event on our list for this area and date (still check the research notes below).';
  return hits.map((h) => `- ${h.name} [${h.when}, ${h.date}]: add about ${h.buffer} min to every drive into or out of the affected area, plan the approach to avoid the closures, and confirm the venue's loading/access plan.`).join('\n');
}
