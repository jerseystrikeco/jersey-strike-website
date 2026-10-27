import { toMinutes } from './pricing.mjs';
// Asks Claude to plan the job: timeline per shift, zones, team, vehicles, equipment,
// logistics, red flags, missing info and similar past jobs. Claude does NOT do the
// pricing math; pricing.mjs does that from this plan.
import { FORMULA, PAST_JOBS } from './knowledge.generated.mjs';
import { inventoryText } from './inventory.mjs';

const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-opus-4-5';
const MAX_INLINE_BYTES = 20 * 1024 * 1024;

const str = { type: 'string' };
const numT = { type: 'number' };
const strArr = { type: 'array', items: str };

export const PLAN_SCHEMA = {
  type: 'object',
  required: ['summary', 'assumptions', 'job_type', 'zones', 'shifts', 'vehicles', 'base_fee_days', 'logistics_notes', 'reasoning', 'red_flags', 'missing_info'],
  properties: {
    summary: { type: 'string', description: '2-3 sentences: what the job is and the recommended approach.' },
    job_type: { type: 'string', enum: ['full_production', 'full_service', 'strike_only', 'install_only', 'studio_only', 'other'],
      description: 'full_production = Jersey Strike produces the whole build (planning, sourcing, fabrication, trucking, install, strike); always use it for FULL PRODUCTION INQUIRY entries. full_service = day-of install and strike ($5,000 minimum). strike_only = $1,500 minimum.' },
    hq: { type: 'string', enum: ['Forked River', 'Montclair'] },
    zones: { type: 'array', items: { type: 'object', required: ['name', 'team'], properties: {
      name: str, tasks: str, team: { type: 'number', description: '1-2 people' }, notes: str } } },
    shifts: { type: 'array', description: 'One entry per crew call (install, strike, flip-only call, return trip). Portal to portal.',
      items: { type: 'object', required: ['label', 'kind', 'team_size', 'depart_hq', 'back_hq', 'steps'], properties: {
        label: { type: 'string', description: 'e.g. "Wedding Install"' },
        date: { type: 'string', description: 'MM/DD/YY or weekday + date' },
        kind: { type: 'string', enum: ['install', 'design', 'flip', 'strike', 'delivery', 'return'] },
        team_size: numT,
        roles: { type: 'string', description: 'e.g. "2 Detail Muscle + 1 Designer"' },
        depart_hq: { type: 'string', description: 'Time crew leaves HQ, e.g. "6:15am"' },
        back_hq: { type: 'string', description: 'Time crew is back at HQ, e.g. "7:30pm" (can be after midnight)' },
        steps: { type: 'array', items: { type: 'object', required: ['time', 'label'], properties: { time: str, label: str } } },
        venue_day: { type: 'boolean', description: 'Crew is on site at the venue this day (base fee day).' },
        premium_reasons: { type: 'array', items: { type: 'string', enum: ['major_holiday', 'holiday', 'nyc_difficult', 'short_notice', 'extreme_access', 'difficult_scope'] },
          description: 'Premium labor triggers for THIS crew call. major_holiday = time and a half; each other trigger adds $10/hr (max +$20). Leave empty for normal jobs.' },
      } } },
    studio_days: { type: 'array', items: { type: 'object', required: ['people'], properties: { label: str, date: str, people: numT } } },
    vehicles: { type: 'array', items: { type: 'object', required: ['kind', 'label'], properties: {
      kind: { type: 'string', enum: ['van', 'uhaul', 'client_truck', 'box_truck'] },
      js_van: { type: 'string', enum: ['VANessa', 'MINIvan', 'both'], description: 'van only: which of our two vans (count 2 = both).' },
      crew_only: { type: 'boolean', description: 'MINIvan only: true when it just transports crew and carries nothing (seats 4-6 instead of 2).' },
      label: { type: 'string', description: 'e.g. "Wedding: 26ft box truck"' },
      count: numT,
      round_trip_miles: numT,
      trips: { type: 'number', description: 'Round trips (install trip and strike trip each count).' },
      rental_days: { type: 'number', description: 'U-Haul only. Pick up day before, return day after (min 2).' },
      uhaul_miles: { type: 'number', description: 'U-Haul only: total miles the U-Haul itself drives (from pickup to return).' },
      js_owned: { type: 'boolean', description: 'box_truck only: true when it is a Jersey Strike-owned truck.' },
      notes: str } } },
    equipment: { type: 'object', description: 'What we pull from OUR inventory (see INVENTORY). Counts per job.', properties: {
      ladders_list: { type: 'array', description: 'Each ladder type and how many. Use this instead of ladders/skyscraper_ladders.', items: { type: 'object', required: ['type', 'count'], properties: {
        type: { type: 'string', enum: ['skyscraper', 'podium', 'aframe_12', 'lg_8_12', 'lg_5_10', 'lg_4_8', 'std_6', 'step'] }, count: numT, why: str } } },
      hand_trucks: numT, folding_wagons: numT, xl_lawn_cart: numT, furniture_dollies: numT, kitchen_cart: numT, gorilla_cart: numT,
      strike_kits: numT, rigging_kit: { type: 'boolean' }, winch: { type: 'boolean' },
      ladders: { type: 'number', description: 'Legacy; use ladders_list.' }, skyscraper_ladders: { type: 'number', description: 'Legacy; use ladders_list.' } } },
    reach_note: { type: 'object', description: 'REQUIRED for any ceiling, tent pole, hung or overhead install. How high we work and how we reach it.', properties: {
      height_ft: { type: 'number', description: 'Floor to ceiling / tent pole / attachment point, in ft. 0 if unknown.' },
      working_height_ft: { type: 'number', description: 'Highest point the crew must reach/attach at, in ft.' },
      height_source: { type: 'string', enum: ['client', 'venue_doc', 'past_job', 'assumed', 'unknown'] },
      ladders_chosen: { type: 'string', description: 'Which ladders reach it and why (e.g. "4 podiums reach 14 ft; Skyscraper for the 18 ft peak").' },
      notes: str } },
    fabrication: { type: 'array', description: 'Custom builds (chuppah, arch, arbor, plinths, stage façade, frames, grids, rings, tabletops, trees). Estimate our cost; the engine prices it.',
      items: { type: 'object', required: ['label', 'materials_cost', 'shop_hours', 'confidence'], properties: {
        label: str, description: { type: 'string', description: 'What it is, dimensions, finish, how it breaks down/transports.' },
        materials_cost: { type: 'number', description: 'Our estimated materials cost in $ (lumber/steel/hardware/paint/casters/etc.).' },
        materials_breakdown: str,
        shop_hours: { type: 'number', description: 'Shop labor hours to build + finish (not install; install goes in shifts).' },
        confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        comparable: { type: 'string', description: 'Closest past fab job and its price.' },
        flags: { ...strArr, description: "Claude's concerns: engineering/weight, timeline, structural risk, venue rules, unknown dimensions." },
        questions_for_larry: strArr,
        reusable: { type: 'string', description: 'Whether JS could keep it as a rental afterward, and a suggested rental price.' } } } },
    additional_rentals: { type: 'array', description: 'Outside vendor rentals at OUR cost (e.g. lift, truss, tent add-ons). The engine adds the handling upcharge on full productions.',
      items: { type: 'object', properties: { label: str, amount: numT, note: str } } },
    sourced_items: { type: 'array', description: 'Things Jersey Strike buys for the job (chandeliers, greenery, disco balls, lanterns, decor, hardware) at OUR estimated cost. The engine prices them at our cost × 2 (50% margin).',
      items: { type: 'object', required: ['label', 'cost'], properties: { label: str, cost: { type: 'number', description: 'Our estimated cost in $' }, note: { type: 'string', description: 'Quantity, where from, how the cost was estimated.' } } } },
    travel: { type: 'object', properties: {
      tolls: numT, tolls_note: str, hotel_nights: numT, hotel_rooms: numT, hotel_rate_estimate: numT, meal_person_days: numT, hotel_reason: str } },
    base_fee_days: { type: 'number', description: 'Days the crew is on site at a venue, minus days waived because a split/next-day delivery is for our schedule, safety or convenience.' },
    base_fee_note: str,
    logistics_notes: { ...strArr, description: 'Truck sizing, load-in/strike timing, travel, parking/dock, route restrictions.' },
    reasoning: { ...strArr, description: 'Why this team size, hours and vehicles.' },
    red_flags: strArr,
    missing_info: { ...strArr, description: 'Info to get from the client before quoting for real.' },
    client_questions: { ...strArr, description: 'Short questions the admin can paste into a reply to the client.' },
    client_history: { type: 'string', description: 'How many times this business appears in past jobs (booked vs archived/declined), and what that means for this quote.' },
    lean_option: { type: 'string', description: 'For first-time or price-sensitive clients: a leaner alternative (smaller team/shorter scope/strike-only) with its tradeoffs, in one or two sentences. Empty if not useful.' },
    similar_jobs: { type: 'array', items: { type: 'object', properties: { job: str, why: str, charged: str } } },
    task_list: { ...strArr, description: 'Scope / task list in the style of the proposal template, grouped by event.' },
    assumptions: {
      type: 'array',
      description: 'The 3-6 judgment calls that drive this price, written so the admin team will check and challenge them (not take them on faith). Most price-sensitive first.',
      items: { type: 'object', required: ['item', 'assumed', 'basis', 'if_wrong'], properties: {
        item: { type: 'string', description: 'e.g. "Team size", "Strike pace", "Return drive", "Unload time", "Table count", "Vehicle"' },
        assumed: { type: 'string', description: 'What the draft assumed, with the number, e.g. "3 people, 1 hr strike"' },
        basis: { type: 'string', description: 'Where it came from: client form, their document, Google Maps, our formula, a past job, or Claude\'s judgment (say so plainly when it is a guess)' },
        if_wrong: { type: 'string', description: 'What changes and roughly by how much if it is wrong, e.g. "+1 person = +$228"' },
      } },
    },
    staffing: {
      type: 'array',
      description: 'Suggested crew per crew call, picked from the STAFF SHORTLIST only (never invent names). Empty if no shortlist was given.',
      items: {
        type: 'object',
        properties: {
          shift: { type: 'string', description: 'Which crew call (match the shift label/date).' },
          crew: { type: 'array', items: { type: 'object', properties: { name: str, role: { type: 'string', description: 'Lead, Truck driver, Rigging, Floral, Detail Muscle...' }, why: { type: 'string', description: 'One line: rank/priority, skill fit, drive, availability.' } } } },
          backups: strArr,
          flags: { ...strArr, description: 'Staffing risks: peak day, people booked the day before/after or heavy week, missing skills, long drives, Wile approval.' },
        },
      },
    },
  },
};

// Checks the event date against the US holiday calendar in code (not by guessing).
// Our premium rules: major_holiday (time and a half) and holiday (+$10) per PRICING-FORMULA.md.
// Other US holidays are named so admin can decide; they don't add a premium on their own.
export function dateCheck(raw) {
  const m = String(raw || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : new Date(Date.parse(`${raw} 12:00 UTC`));
  if (!raw || isNaN(d)) return 'Event date unknown: no holiday check.';
  const y = d.getUTCFullYear();
  const D = (mo, day) => Date.UTC(y, mo, day);
  const nth = (mo, wd, n) => { const f = new Date(D(mo, 1)).getUTCDay(); return D(mo, 1 + ((wd - f + 7) % 7) + (n - 1) * 7); };
  const last = (mo, wd) => { const l = new Date(D(mo + 1, 0)); return D(mo, l.getUTCDate() - ((l.getUTCDay() - wd + 7) % 7)); };
  const easter = (() => { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d1 = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d1 - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, mm = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * mm + 114) / 31) - 1, day = ((h + l - 7 * mm + 114) % 31) + 1; return D(mo, day); })();
  const DAY = 864e5, t = d.getTime(), thanks = nth(10, 4, 4);
  // [name, date, premium: 'major' | 'holiday' | null, days before, days after] (window = the holiday weekend/week)
  const cal = [
    ["New Year's Day", D(0, 1), 'major', 0, 0], ['MLK Day weekend', nth(0, 1, 3), null, 2, 0],
    ["Presidents' Day weekend", nth(1, 1, 3), null, 2, 0], ["Valentine's Day week", D(1, 14), 'holiday', 7, 0],
    ['Easter weekend', easter, null, 2, 0], ["Mother's Day week", nth(4, 0, 2), 'holiday', 6, 0],
    ['Memorial Day weekend', last(4, 1), 'holiday', 3, 0], ["Father's Day", nth(5, 0, 3), null, 1, 0],
    ['Juneteenth', D(5, 19), null, 0, 0], ['July 4th', D(6, 4), 'major', 0, 0], ['July 4th weekend', D(6, 4), null, 2, 2],
    ['Labor Day weekend', nth(8, 1, 1), 'holiday', 3, 0], ['Columbus / Indigenous Peoples Day weekend', nth(9, 1, 2), null, 2, 0],
    ['Halloween', D(9, 31), null, 0, 0], ['Veterans Day', D(10, 11), null, 0, 0],
    ['Thanksgiving Day', thanks, 'major', 0, 0], ['day after Thanksgiving', thanks + DAY, 'major', 0, 0],
    ['Thanksgiving / Black Friday weekend', thanks, 'major', 1, 3], ['holiday season week', D(11, 20), null, 3, 2],
    ['holiday season (Dec 23 - Jan 2)', D(11, 23), 'major', 0, 8], ['holiday season (Dec 23 - Jan 2)', D(0, 1), 'major', 0, 1],
    ['Christmas Eve', D(11, 24), 'major', 0, 0], ['Christmas Day', D(11, 25), 'major', 0, 0], ['day after Christmas', D(11, 26), 'major', 0, 0],
    ["New Year's Eve", D(11, 31), 'major', 0, 0],
  ];
  const hits = cal.filter(([, at, , before, after]) => t >= at - before * DAY && t <= at + after * DAY);
  const name = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const major = hits.find((h) => h[2] === 'major'), hol = hits.find((h) => h[2] === 'holiday'), other = hits.filter((h) => !h[2]);
  const staff = ' Add a red flag: holiday staffing is hard (crew availability, travel, burnout), so line up the team early.';
  if (major) return `${name}: MAJOR HOLIDAY (${major[0]}). Use premium_reasons major_holiday.${staff}`;
  if (hol) return `${name}: holiday period (${hol[0]}). Use premium_reasons holiday.${staff}`;
  if (other.length) return `${name}: US holiday (${other.map((h) => h[0]).join(', ')}). No holiday premium under our rules; mention it once in logistics_notes (traffic / crew availability) for admin to decide.`;
  return `${name}: not on the US holiday calendar. Do not add holiday premiums, and do not flag holidays or holiday traffic.`;
}

function systemPrompt() {
  return `You are the production estimator for Jersey Strike Co., an event staffing + logistics partner for florists, planners and venues in NJ/NY/PA (install + strike crews, flips, transport, studio processing, fabrication, rentals).

A new inquiry came in. Plan a PRELIMINARY quote for the admin team to review. It is never sent to the client automatically.

How to plan:
- Build a detailed running timeline for every crew call, portal to portal (crew departs HQ -> ... -> back at HQ), following the install and strike timelines in the pricing formula exactly (15 min early studio arrival, 15-30 min early venue arrival (30-45 min only if parking/dock is hard; never more),  load, drive, unload, setup, backload, flip, truck organized, drive home; strike: early prep, client truck reset, strike, pack + strap, delivery, unload/organize, home).
- Use the drive times and miles provided (they come from Google Maps / truck routing). In the timeline, use each leg's plan_minutes, not the raw minutes (the first leg out of HQ is just rounded up to the quarter hour; every later leg already includes a 15 min buffer); miles stay as given. If none are provided, estimate conservatively and say so in red_flags.
- Every leg of the timeline is a real drive between two real addresses. Work each one out from the addresses (HQ, client studio, venue, crew homes), never by assuming two places are "close". If the client's studio/pickup address is the same as (or next to) our HQ, then venue -> studio is the same drive as venue -> HQ, and the call ends when the unload at the studio is done (no extra drive home). Departure time = first start time minus (the leg's plan_minutes + the 15-30 min arrival buffer), rounded to the quarter hour, but never less than 1 hr before that start time, and the drive back to HQ is never less than 1 hr either (1 hr minimum each way, from either HQ). Strike timing: when the client gives a hard out, the crew strikes and backloads right up to the hard out ("strike done, van backloaded + organized" = the hard out time, not earlier), then departs about 15 min later. Always show the unload at the drop-off as its own step: arrive, then unload/organize sized to the vehicle and how full it is: about 15 min for a van; 30-60 min for a smaller box truck or U-Haul; up to 1.5 hrs for a full 26 ft box truck (less with a bigger crew or a light load). Then done. Follow the worked strike example in the pricing formula (9:30 depart, 10:15 arrive/prep, 10:30 start, 11:30 done + backloaded, 11:45 depart, 12:45 studio unload, 1:00 done). Don't add separate "prep" time before the start beyond that arrival buffer, and don't add buffers after the last unload: when the last stop is HQ (or the client's studio is at HQ), the call ends when the unload/organize is done.
- Take the client's answers on the inquiry form as fact (start time, hard out, their staff on site, linens, what comes back, addresses, vehicles). Don't ask them to confirm something they already answered, and don't call it into question, unless it conflicts with another answer or with their documents; then flag the specific conflict. missing_info and client_questions are only for things they did NOT tell us or that conflict. Bad examples (never ask these when the form answered them): "confirm the strike start time", "is the hard out strict?", "will your team be on site?" (Their staff on site: 0 means none), "is everything coming back to your studio?". A document giving a range (e.g. 16-18 tables) is fine: plan for the high end and note it, don't ask.
- Size the team with zones: every task area is a zone with 1-2 people, and every zone must finish inside the client's window (load-in -> photo ready). Strike is sized the same way against breakdown start -> departure.
- When an attached proposal/production doc conflicts with the inquiry form (date, guest count, table count, pieces), TRUST THE DOCUMENT and flag the mismatch.
- Use the client's documents (proposal, design guide, flower order, run of show, floor plan, inventory pull report) to count pieces per zone and judge how heavy, fragile and numerous the inventory is. Use that for truck size and load/strike time.
- Pick vehicles: JS van ($1/mi per van) for small loads; U-Haul box truck sized to the inventory (min 2 rental days: pick up day before, return day after); or driving the client's truck (management fee). U-Haul is never left without a plan for strike: note if it stays parked near the venue.
- Inventory + vehicles (see INVENTORY below): plan what this job pulls from our own stock in "equipment" (each ladder type in ladders_list, carts, strike kits, rigging kit, winch) and name the van(s) with js_van. We own TWO vans only: VANessa (extended cargo van, 12 ft interior rear doors to dash) and MINIvan (10 ft). Anything beyond what those two hold, more than 2 vans, or a ladder too long for the van, needs a rental (U-Haul cargo van or box truck): add it to vehicles so it is priced in, don't leave it for admin to find. Ladders decide the vehicle too: the Skyscraper, the 12 ft A-frame and the podiums are 12 ft at their most compact (the low end of each ladder's size range), so they ride in or on VANessa (roof rack) or a truck, never MINIvan (10 ft); 3+ long ladders take most of a van floor. If the job needs more of anything than we own (ladders, carts, dollies, kits), add the rental/purchase to additional_rentals with an estimated cost and say so in red_flags. Every crew call normally takes a strike kit (we have 4). Ladder work counts against reach: pick ladders whose reach covers the working height. Crew ride together from HQ, so seats matter: VANessa seats only 2 but has a ladder roof rack (long ladders ride on top); MINIvan seats 2 up front when it carries a load (deliveries), and 4-6 people only when it carries nothing and just transports crew (set crew_only); a U-Haul/box truck cab seats ~3. Match vehicles to crew size and load (e.g. crew of 4 with a delivery = VANessa 2 + MINIvan 2 both loaded; crew of 6 where VANessa holds the whole load = VANessa 2 + MINIvan crew_only 4), and in staffing say who drives which vehicle (TRUCK DRIVER for trucks) and who rides where.
- Ceiling / tent pole / hung / overhead installs ALWAYS get a reach_note: the ceiling or pole height, the working height, where the number came from, and which ladders reach it. If the client didn't give the height, set height_source "unknown" (or "assumed" with your best guess for timing), put the height question first in client_questions, and add a red flag. Over 20 ft = extreme_access; over 24 ft = beyond our Skyscraper, plan a lift rental.
- Base fee: count venue days, but waive extra days caused by next-day deliveries/returns that are for our schedule, team safety or convenience (explain in base_fee_note).
- Destination job (hotel + $50/person/day meals) only if a shift is over 12 hrs on site AND the drive home is over 2 hrs; flag back-to-back far-away days for admin to decide.
- Studio processing / reset days are flat per person (studio_days), not hourly.
- Full productions (scope starts with "FULL PRODUCTION INQUIRY", or we produce the whole build): set job_type "full_production". Plan labor, trucking and equipment exactly as usual. List everything we'd buy for the job (chandeliers, greenery, disco balls, decor, hardware) in sourced_items at our estimated cost, and outside vendor rentals in additional_rentals at our cost; the engine prices sourcing at cost × 2, the rental handling and the 12% production planning fee. Include a planning/walkthrough crew call when a site visit is needed.
- Never write "TBD" (or leave blank) for depart_hq, back_hq or step times: the price is built from them, and a TBD prices the crew call at $0. When the client hasn't given call times, assume sensible ones (e.g. 9am load-in, a typical event-day call), use them, and list each assumed time in assumptions so the team can correct it.
- assumptions: this draft is a starting point for people who know the jobs better than you do. List the judgment calls behind the price (team size, pace, timings, drive, unload, counts, vehicle), say plainly which ones are your guesses vs. from the client, Google Maps or the formula, and what each would change in dollars if wrong. Never sound more certain than the evidence is.
- Staffing: when a STAFF SHORTLIST is given, fill "staffing" with a suggested crew for every crew call, matching team_size. Use only names from the shortlist. Pick by: (1) availability (never anyone booked that day; note day-before/after bookings and heavy weeks); (2) SCHEDULE PRIORITY (1 = guaranteed weekly hours, schedule first; then 2, 3, 4; 5 = as needed, only for big/new jobs or when a team lead is needed); (3) Team Rank (A > B > TRAINEE; every crew call needs at least one A as Lead, and a TRAINEE only alongside an A); (4) skills the scope needs (TRUCK DRIVER for box trucks/U-Hauls/client trucks, Rigging for hung or overhead work, Floral Designer for design help, Wile Approved = YES for any Wile Events job); (5) home HQ that matches the job's HQ and a shorter drive (we pay their drive to HQ). Give 1-2 backups. Flag a peak day (calendar shows several events or many staff booked), anyone stretched thin, and skill gaps. If the shortlist is not available, leave staffing empty and say why in missing_info.
- Team size: follow past-jobs/00-job-sizing.md (zones → work units → person-hours → fit the window → sanity-check vs similar jobs).
- Solo (team of 1) only when ALL are true: very easy job, daytime, easy/short drive, no ladders/rigging; say it needs a very strong team member. Night strikes and anything with ladders get at least 2.
- Premium labor triggers per crew call (premium_reasons): major_holiday = time and a half (Thanksgiving / Black Friday weekend Wed-Sun, the whole Dec 23 - Jan 2 holiday season, July 4; e.g. $97.50/hr), holiday = +$10 (Memorial/Labor Day weekends, Valentine's/Mother's Day weeks for floral work), nyc_difficult (Manhattan/Brooklyn/Queens venues with no dock, street parking/permits, security check-in, freight-elevator or union rules, long carries), short_notice (inquiry < 7 days before the event), extreme_access (ladders over 20 ft, scissor lift, heavy hung structures/grids over a dance floor), difficult_scope (the team will clearly work beyond a reasonable expectation: very heavy/awkward pieces, huge piece counts for the window, many long carries or stairs, multiple flips, punishing conditions). Only for genuinely harder calls; explain each in reasoning. Holidays come ONLY from the DATE CHECK line in the inquiry; never flag a holiday, holiday weekend or holiday traffic it doesn't name. Don't add generic red flags (weather, \"check for conflicts\", \"December night\"); red flags are specific risks to this job.
- Fabrication: if the job needs a custom build, estimate it in "fabrication" (materials cost + shop hours) using past fab jobs as comparables (e.g. metal chuppah $2,800 = $2,200 materials + $600 labor; wooden 8x8 chuppah ~$4,600; standard custom chuppah builds $1,823–3,279; modular arch ~$3,600–3,900; plinth build ~$2,355; 2x6 ft frame $450; 9x4 ft grid $510; chandelier rings $100 each; custom tabletops ~$415 each). Be explicit about confidence, flags and questions for Larry. If Jersey Strike already owns something that fits (wooden chuppah rental $950, arch rental, white plinths $75 each, pole urn + plinth, stage backdrop ~$3,600), suggest renting it instead via additional_rentals.
- Viability: Jersey Strike aims for a 50% gross margin on every job. Team pay is $30/hr ($45 on major holidays, overtime after 40 hrs/week) and includes each person's drive from home (often ~1 hr each way beyond HQ). The engine calculates margin; in reasoning, call out anything that would squeeze it (long drives, idle waits between install and strike, extra crew for safety, many small multi-day calls, grandfathered rates) and suggest how to restructure (fewer trips, combine calls, next-day strike, U-Haul vs van).
- Client history: check the past jobs for this business. Many first-time inquirers haven't budgeted for Jersey Strike yet and often book on their 3rd–5th inquiry or when in a pinch. For first-timers and past declines, keep the quote honest (don't cut safety/team below what the job needs), fill lean_option with a leaner alternative, and note it in client_history.
- Compare against the past jobs and list the most similar ones with what was charged.
- Do NOT calculate prices. Return quantities and times only; the pricing engine does the math.
- Times: use "h:mmam"/"h:mmpm" (e.g. "6:15am", "12:30am").
- Be specific and practical. Red flags = things that could blow the timeline or budget (tight windows, vague scope, unknown access/dock, union venue, ceiling/rigging work, high ladder work, weather for outdoor installs, second venues, missing docs). Missing info = what you'd need to firm up the quote.

Today is ${new Date().toISOString().slice(0, 10)}.

=== INVENTORY (what Jersey Strike owns) ===
${inventoryText()}

=== PRICING FORMULA (source of truth) ===
${FORMULA}

=== PAST JOBS ===
${PAST_JOBS.map((j) => `--- ${j.file} ---\n${j.text}`).join('\n\n') || '(none yet)'}`;
}

async function fileToBlock(f) {
  const name = f.filename || 'Document';
  try {
    const r = await fetch(f.url);
    if (!r.ok) throw new Error(`download ${r.status}`);
    const type = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const isPdf = type === 'application/pdf' || /\.pdf$/i.test(name);
    const img = type.match(/^image\/(jpeg|png|gif|webp)$/) || name.match(/\.(jpe?g|png|gif|webp)$/i);
    if (!isPdf && !img) return { note: `${name}: not a PDF or image (${type || 'unknown type'}), so Claude couldn't read it. Admin should open it.` };
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_INLINE_BYTES) {
      if (isPdf) return { block: { type: 'document', source: { type: 'url', url: f.url }, title: name }, note: `${name}: large file, read by link.` };
      return { note: `${name}: image too large to read (${Math.round(buf.length / 1e6)} MB).` };
    }
    const data = buf.toString('base64');
    if (isPdf) return { block: { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data }, title: name } };
    const mt = type.startsWith('image/') ? type : `image/${img[1].toLowerCase().replace('jpg', 'jpeg')}`;
    return { block: { type: 'image', source: { type: 'base64', media_type: mt, data } } };
  } catch (e) {
    return { note: `${name}: couldn't download (${e.message}). Admin should open it from Airtable.` };
  }
}

export async function planQuote(inquiry, routes, staff = null) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set');

  const files = await Promise.all((inquiry.files || []).map(fileToBlock));
  const docNotes = files.map((f) => f.note).filter(Boolean);
  const content = [];
  for (const f of files) if (f.block) content.push(f.block);
  content.push({
    type: 'text',
    text: `NEW INQUIRY
${JSON.stringify({
  business: inquiry.business, contact: inquiry.contact, event_date: inquiry.eventDate, venue: inquiry.venue,
  studio_pickup_delivery: inquiry.studio, services: inquiry.services, estimated_team_size: inquiry.teamSize,
  team_needs: inquiry.teamNeeds, vehicles_requested: inquiry.vehicles, scope_of_work: inquiry.scope,
  documents: (inquiry.files || []).map((f) => f.filename),
}, null, 2)}

DATE CHECK
${dateCheck(inquiry.eventDate)}

${staff?.available ? `STAFF SHORTLIST (from Airtable; ranked, free that day)\n${JSON.stringify({ calendar: staff.calendar, shortlist: staff.shortlist, booked_that_day: staff.booked_that_day }, null, 1)}\n\n` : `STAFF SHORTLIST: not available${staff?.notes?.length ? ` (${staff.notes.join('; ')})` : ''}\n\n`}DRIVE TIMES (${routes.available ? 'from Google Maps' : 'not available'})
${JSON.stringify(routes, null, 2)}
${docNotes.length ? `\nDOCUMENT NOTES\n${docNotes.join('\n')}` : ''}

Plan the preliminary quote and submit it with the submit_quote_plan tool.`,
  });

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL(),
      max_tokens: 12000,
      // Cached: the formula + past jobs are the same for every inquiry, so repeat drafts cost much less.
      system: [{ type: 'text', text: systemPrompt(), cache_control: { type: 'ephemeral' } }],
      tools: [{ name: 'submit_quote_plan', description: 'Submit the structured preliminary quote plan.', input_schema: PLAN_SCHEMA }],
      tool_choice: { type: 'tool', name: 'submit_quote_plan' },
      messages: [{ role: 'user', content }],
    }),
  });
  if (!r.ok) throw new Error(`Claude ${r.status}: ${(await r.text()).slice(0, 500)}`);
  const msg = await r.json();
  const tool = msg.content?.find((c) => c.type === 'tool_use');
  if (!tool) throw new Error(`Claude returned no plan (stop_reason: ${msg.stop_reason})`);
  return { plan: fixTimeline(tool.input, { studioIsHq: !!(inquiry.studio && routes?.hq && sameAddress(inquiry.studio, routes.hq.address)) }), docNotes, usage: msg.usage, model: msg.model };
}

// Timeline guard (code, not Claude): the unload at the last stop is real time on the clock.
// If the last step is "arrive + unload" with no separate finish, add the finish time
// (van ~15 min, U-Haul/box truck ~60 min, 26 ft ~90 min, or the minutes Claude wrote)
// and make sure back_hq (what we bill to) is that finish time.
const fmtTime = (m) => { m = ((m % 1440) + 1440) % 1440; const h = Math.floor(m / 60), mm = m % 60; return `${h % 12 || 12}:${String(mm).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`; };
const sameAddress = (a, b) => { const k = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14); return k(a) === k(b); };
export function fixTimeline(plan, { studioIsHq = false } = {}) {
  const v = (plan.vehicles || []).map((x) => `${x.kind} ${x.label}`).join(' ');
  const defaultUnload = /26 ?ft/i.test(v) ? 90 : /box_truck|uhaul|client_truck|box truck|ft/i.test(v) ? 60 : 15;
  for (const s of plan.shifts || []) {
    const steps = s.steps || [];
    const last = steps[steps.length - 1];
    if (!last || !/unload/i.test(last.label) || !/arriv/i.test(last.label)) continue;
    const at = toMinutes(last.time);
    if (at == null) continue;
    const mins = Number(last.label.match(/(\d+)\s*min/i)?.[1]) || defaultUnload;
    const done = at + mins;
    last.label = last.label.replace(/\s*[—-]+\s*DONE\s*$/i, '').replace(/,?\s*done\s*$/i, '');
    const home = studioIsHq || /studio is (?:at )?HQ|= ?HQ|back at HQ/i.test(last.label);
    steps.push({ time: fmtTime(done), label: home ? 'Done (back at HQ)' : 'Unload done, depart for HQ' });
    const back = toMinutes(s.back_hq);
    const late = (b) => { let d = b - toMinutes(s.depart_hq); if (d <= 0) d += 1440; return d; };
    if (home && (back == null || late(back) < late(done))) s.back_hq = fmtTime(done);
  }
  return plan;
}
