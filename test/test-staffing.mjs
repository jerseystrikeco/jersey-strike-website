// Staffing shortlist test with fake Airtable + Google data.
process.env.AIRTABLE_TOKEN = 't'; process.env.AIRTABLE_BASE_ID = 'appX'; process.env.GOOGLE_MAPS_API_KEY = 'g';
const staff = [
  ['recA', { Name: 'Ava Lead', 'SCHEDULE PRIORITY': '1 -- PART TIME CORE - (GUARANTEED HOURS WEEKLY)', 'Team Rank': 'A', Town: 'Toms River', 'Street Address': '1 Main St', 'TRUCK DRIVER': true, 'ACTIVE TEAM': 'ACTIVE', HQ: 'OCEAN COUNTY', 'Completed STRIKES': 40 }],
  ['recB', { Name: 'Ben Busy', 'SCHEDULE PRIORITY': '1 -- PART TIME CORE - (GUARANTEED HOURS WEEKLY)', 'Team Rank': 'A', Town: 'Lacey', 'ACTIVE TEAM': 'ACTIVE', HQ: 'OCEAN COUNTY' }],
  ['recC', { Name: 'Cal Gig', 'SCHEDULE PRIORITY': '3 -- GIG/ Regular', 'Team Rank': 'B', Town: 'Montclair', 'ACTIVE TEAM': 'ACTIVE', HQ: 'MONTCLAIR' }],
  ['recD', { Name: 'Dee Leave', 'SCHEDULE PRIORITY': '6 -- PART TIME CORE// NOT SCHEDULING // ON LEAVE', 'Team Rank': 'A', 'ACTIVE TEAM': 'ACTIVE' }],
  ['recE', { Name: 'Eli Inactive', 'SCHEDULE PRIORITY': '2 -- PART TIME CORE', 'Team Rank': 'A' }],
  ['recF', { Name: 'Fay Trainee', 'SCHEDULE PRIORITY': '2 -- PART TIME CORE', 'Team Rank': 'TRAINEE', Town: 'Bayville', 'ACTIVE TEAM': 'ACTIVE', HQ: 'OCEAN COUNTY' }],
];
const events = [
  ['ev1', { 'MONTH/ Date': '2026-12-11', 'Venue Date/ Address': 'SEAVIEW HOTEL', 'Staff Strike': ['recB'], 'Staff Needed For Event Strike': 2 }],
  ['ev2', { 'MONTH/ Date': '2026-12-10', 'Venue Date/ Address': 'PARK LOFT', 'Staff Set Up': ['recA'] }],
];
let calls = [];
globalThis.fetch = async (url, opts) => {
  url = String(url); calls.push(url);
  if (url.includes('tblXQnkkQ2e1hQ4Th')) return { ok: true, json: async () => ({ records: staff.map(([id, fields]) => ({ id, fields })) }) };
  if (url.includes('tblPJ8HQ9sRgQa7N7')) return { ok: true, json: async () => ({ records: events.map(([id, fields]) => ({ id, fields })) }) };
  if (url.includes('computeRouteMatrix')) { const b = JSON.parse(opts.body); return { ok: true, json: async () => b.origins.map((_, i) => ({ originIndex: i, duration: `${(i + 1) * 900}s`, distanceMeters: (i + 1) * 16000, condition: 'ROUTE_EXISTS' })) }; }
  throw new Error('unexpected ' + url);
};
const { staffCandidates } = await import('../netlify/functions/lib/staffing.mjs');
const r = await staffCandidates({ eventDate: '2026-12-11' }, { hq: { name: 'Forked River', address: '1404 Circle Dr, Forked River, NJ 08731' }, venue: 'Park Loft, Oceanport NJ' });
let fails = 0; const check = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };
const names = r.shortlist.map((p) => p.name);
check(r.available, 'staffing available');
check(!names.includes('Ben Busy') && r.booked_that_day.some((x) => x.startsWith('Ben Busy')), 'person booked that day is left off the shortlist');
check(!names.includes('Dee Leave') && !names.includes('Eli Inactive'), 'on-leave and inactive staff skipped');
check(names[0] === 'Ava Lead', 'priority 1 / rank A first');
check(r.shortlist[0].booked_day_before_or_after[0]?.startsWith('day before'), 'day-before booking noted');
check(r.shortlist[0].drive_to_hq?.minutes === 15 && r.shortlist[0].truck_driver, 'drive to HQ + truck driver skill');
check(names.indexOf('Fay Trainee') < names.indexOf('Cal Gig'), 'priority 2 before priority 3');
check(r.calendar.other_events_same_day.length === 1 && r.calendar.already_booked_that_day === 1, 'calendar counts');
console.log(fails ? `\n${fails} failed` : '\nAll staffing checks passed.');
process.exit(fails ? 1 : 0);
