// Staffing suggestions for a quote draft.
// Reads the Airtable STAFF SCHEDULING table (who, rank, priority, skills, home, HQ) and the
// event calendar (who is already booked around the event date), works out each person's drive
// with Google Maps, and hands Claude a ranked shortlist to pick the crew from.
//
// Uses the same AIRTABLE_TOKEN as the inquiry form; it needs data.records:read on the base.
// Table/field names can be overridden with env vars if they're ever renamed.

const STAFF_TABLE = process.env.AIRTABLE_STAFF_TABLE || 'tblXQnkkQ2e1hQ4Th'; // STAFF SCHEDULING
const EVENTS_TABLE = process.env.AIRTABLE_EVENTS_TABLE || 'tblPJ8HQ9sRgQa7N7'; // Event Management (2026 Event View)
const F = {
  name: 'Name', priority: 'SCHEDULE PRIORITY', street: 'Street Address', town: 'Town', rank: 'Team Rank',
  truck: 'TRUCK DRIVER', florist: 'Floral Designer?', rigging: 'Rigging', wile: 'Wile Approved',
  wileFloral: 'Wile Approved FLORAL DESIGNER', active: 'ACTIVE TEAM', notes: 'NOTES', hq: 'HQ',
  setups: 'Completed SET UPS', strikes: 'Completed STRIKES',
  // events
  date: 'MONTH/ Date', venue: 'Venue Date/ Address', type: 'Set Up/ Strike', staffSetup: 'Staff Set Up', staffStrike: 'Staff Strike',
  needSetup: 'Staff Needed For Event Set Up', needStrike: 'Staff Needed For Event Strike', gitp: 'Garden in the Pines Event',
};
const DAY = 864e5;
const RANK = { A: 0, B: 1, TRAINEE: 2 };

async function airtableAll(table, params = {}) {
  const token = process.env.AIRTABLE_TOKEN, base = process.env.AIRTABLE_BASE_ID;
  if (!token || !base) throw new Error('AIRTABLE_TOKEN / AIRTABLE_BASE_ID not set');
  const out = [];
  let offset;
  do {
    const q = new URLSearchParams({ pageSize: '100', ...params, ...(offset ? { offset } : {}) });
    const r = await fetch(`https://api.airtable.com/v0/${base}/${table}?${q}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Airtable ${table} ${r.status}${r.status === 403 ? ' (the token needs data.records:read and access to this table)' : ''}`);
    const j = await r.json();
    out.push(...j.records);
    offset = j.offset;
  } while (offset && out.length < 1000);
  return out;
}

const num = (v) => (Array.isArray(v) ? v.reduce((a, x) => a + (Number(x) || 0), 0) : Number(v) || 0);
const priorityNum = (p) => Number(String(p || '').match(/^\s*(\d)/)?.[1] || 9);
export function parseDate(raw) {
  const m = String(raw || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : new Date(Date.parse(`${raw} 12:00 UTC`));
  return isNaN(d) ? null : d;
}
const iso = (t) => new Date(t).toISOString().slice(0, 10);

// Home -> HQ (what we pay for) and home -> venue, one Google route-matrix call each.
async function driveMatrix(origins, destination) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || !origins.length || !destination) return null;
  const r = await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'originIndex,duration,distanceMeters,condition' },
    body: JSON.stringify({
      origins: origins.map((a) => ({ waypoint: { address: a } })),
      destinations: [{ waypoint: { address: destination } }],
      travelMode: 'DRIVE',
    }),
  });
  if (!r.ok) throw new Error(`Google route matrix ${r.status}`);
  const rows = await r.json();
  const out = new Array(origins.length).fill(null);
  for (const x of Array.isArray(rows) ? rows : []) {
    if (x.condition && x.condition !== 'ROUTE_EXISTS') continue;
    out[x.originIndex ?? 0] = { minutes: Math.round((parseInt(x.duration, 10) || 0) / 60), miles: Math.round((x.distanceMeters || 0) / 1609.344) };
  }
  return out;
}

/**
 * Returns { available, date, shortlist: [...], calendar: {...}, notes: [] } for Claude.
 * hq: { name, address } of the HQ the job runs from (from routes), venue: venue address.
 */
export async function staffCandidates(inquiry, { hq, venue } = {}) {
  const notes = [];
  const date = parseDate(inquiry.eventDate);
  if (!date) return { available: false, notes: ['No event date: staffing not checked.'] };

  const [staffRecs, eventRecs] = await Promise.all([
    airtableAll(STAFF_TABLE),
    airtableAll(EVENTS_TABLE, {
      filterByFormula: `AND(IS_AFTER({${F.date}}, '${iso(date.getTime() - 8 * DAY)}'), IS_BEFORE({${F.date}}, '${iso(date.getTime() + 8 * DAY)}'))`,
    }).catch((e) => { notes.push(`Calendar not read: ${e.message}`); return []; }),
  ]);

  // Bookings: who's on what, by day offset from the event (-7..+7).
  const booked = new Map(); // staff record id -> [{ offset, label }]
  const sameDay = [];
  for (const e of eventRecs) {
    const d = parseDate(e.fields[F.date]);
    if (!d) continue;
    const offset = Math.round((d - date) / DAY);
    const label = `${iso(d)} ${e.fields[F.venue] || 'event'}${e.fields[F.gitp] ? ' (GITP)' : ''}`;
    if (offset === 0) sameDay.push({ label, need: num(e.fields[F.needSetup]) + num(e.fields[F.needStrike]) });
    for (const id of [...(e.fields[F.staffSetup] || []), ...(e.fields[F.staffStrike] || [])]) {
      if (!booked.has(id)) booked.set(id, []);
      booked.get(id).push({ offset, label });
    }
  }

  const staff = staffRecs
    .map((r) => ({ id: r.id, f: r.fields }))
    .filter(({ f }) => f[F.name] && f[F.active] && priorityNum(f[F.priority]) <= 5);

  const homes = staff.map(({ f }) => [f[F.street], f[F.town]].filter(Boolean).join(', '));
  let toHq = null, toVenue = null;
  try {
    const withHome = homes.map((h, i) => (h ? i : -1)).filter((i) => i >= 0);
    const [a, b] = await Promise.all([
      hq?.address ? driveMatrix(withHome.map((i) => homes[i]), hq.address) : null,
      venue ? driveMatrix(withHome.map((i) => homes[i]), venue) : null,
    ]);
    toHq = new Array(staff.length).fill(null); toVenue = new Array(staff.length).fill(null);
    withHome.forEach((i, k) => { toHq[i] = a?.[k] ?? null; toVenue[i] = b?.[k] ?? null; });
  } catch (e) {
    notes.push(`Drive times for crew not calculated: ${e.message}`);
  }

  const people = staff.map(({ id, f }, i) => {
    const b = booked.get(id) || [];
    const day = b.filter((x) => x.offset === 0);
    const near = b.filter((x) => Math.abs(x.offset) === 1);
    const week = b.filter((x) => Math.abs(x.offset) <= 6);
    const hqName = f[F.hq] || '';
    return {
      name: f[F.name],
      priority: f[F.priority] || '',
      rank: f[F.rank] || '',
      town: f[F.town] || '',
      home_hq: hqName,
      truck_driver: !!f[F.truck],
      rigging: !!f[F.rigging],
      floral_designer: !!f[F.florist],
      wile_approved: f[F.wile] || '',
      wile_floral: f[F.wileFloral] || '',
      active: f[F.active],
      experience: { setups: num(f[F.setups]), strikes: num(f[F.strikes]) },
      drive_to_hq: toHq?.[i] || null,
      drive_to_venue: toVenue?.[i] || null,
      booked_same_day: day.map((x) => x.label),
      booked_day_before_or_after: near.map((x) => `${x.offset < 0 ? 'day before' : 'day after'}: ${x.label}`),
      jobs_within_a_week: week.length,
      notes: (f[F.notes] || '').slice(0, 200),
    };
  });

  // Rough order: free that day, then priority, rank, HQ match, experience, shorter drive.
  const hqMatch = (p) => (hq?.name === 'Forked River' ? /OCEAN/i : /MONTCLAIR/i).test(p.home_hq);
  people.sort((a, b) =>
    (a.booked_same_day.length > 0) - (b.booked_same_day.length > 0)
    || priorityNum(a.priority) - priorityNum(b.priority)
    || (RANK[a.rank] ?? 3) - (RANK[b.rank] ?? 3)
    || hqMatch(b) - hqMatch(a)
    || (b.experience.setups + b.experience.strikes) - (a.experience.setups + a.experience.strikes)
    || (a.drive_to_hq?.minutes ?? 999) - (b.drive_to_hq?.minutes ?? 999));

  const free = people.filter((p) => !p.booked_same_day.length);
  const bookedToday = people.length - free.length;
  const peak = sameDay.length >= 3 || bookedToday >= Math.max(6, people.length * 0.4);
  return {
    available: true,
    date: iso(date.getTime()),
    hq: hq?.name || null,
    calendar: {
      other_events_same_day: sameDay.map((x) => x.label),
      staff_needed_for_those: sameDay.reduce((a, x) => a + x.need, 0),
      active_staff: people.length,
      already_booked_that_day: bookedToday,
      peak_day: peak,
    },
    shortlist: free.slice(0, 18),
    booked_that_day: people.filter((p) => p.booked_same_day.length).map((p) => `${p.name}: ${p.booked_same_day.join('; ')}`),
    notes,
  };
}
