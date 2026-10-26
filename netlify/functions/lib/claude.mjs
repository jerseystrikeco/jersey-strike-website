// Asks Claude to plan the job: timeline per shift, zones, team, vehicles, equipment,
// logistics, red flags, missing info and similar past jobs. Claude does NOT do the
// pricing math; pricing.mjs does that from this plan.
import { FORMULA, PAST_JOBS } from './knowledge.generated.mjs';

const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-opus-4-5';
const MAX_INLINE_BYTES = 20 * 1024 * 1024;

const str = { type: 'string' };
const numT = { type: 'number' };
const strArr = { type: 'array', items: str };

export const PLAN_SCHEMA = {
  type: 'object',
  required: ['summary', 'job_type', 'zones', 'shifts', 'vehicles', 'base_fee_days', 'logistics_notes', 'reasoning', 'red_flags', 'missing_info'],
  properties: {
    summary: { type: 'string', description: '2-3 sentences: what the job is and the recommended approach.' },
    job_type: { type: 'string', enum: ['full_service', 'strike_only', 'install_only', 'studio_only', 'other'],
      description: 'full_service = day-of install and strike ($5,000 minimum). strike_only = $1,500 minimum.' },
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
      label: { type: 'string', description: 'e.g. "Wedding: 26ft box truck"' },
      count: numT,
      round_trip_miles: numT,
      trips: { type: 'number', description: 'Round trips (install trip and strike trip each count).' },
      rental_days: { type: 'number', description: 'U-Haul only. Pick up day before, return day after (min 2).' },
      uhaul_miles: { type: 'number', description: 'U-Haul only: total miles the U-Haul itself drives (from pickup to return).' },
      js_owned: { type: 'boolean', description: 'box_truck only: true when it is a Jersey Strike-owned truck.' },
      notes: str } } },
    equipment: { type: 'object', properties: { ladders: numT, skyscraper_ladders: numT, rigging_kit: { type: 'boolean' } } },
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
    additional_rentals: { type: 'array', items: { type: 'object', properties: { label: str, amount: numT, note: str } } },
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
  },
};

function systemPrompt() {
  return `You are the production estimator for Jersey Strike Co., an event staffing + logistics partner for florists, planners and venues in NJ/NY/PA (install + strike crews, flips, transport, studio processing, fabrication, rentals).

A new inquiry came in. Plan a PRELIMINARY quote for the admin team to review. It is never sent to the client automatically.

How to plan:
- Build a detailed running timeline for every crew call, portal to portal (crew departs HQ -> ... -> back at HQ), following the install and strike timelines in the pricing formula exactly (1 hr minimum HQ departure leg, 15 min early studio arrival, 15-30 min early venue arrival (30-45 min only if parking/dock is hard; never more),  load, drive, unload, setup, backload, flip, truck organized, drive home; strike: early prep, client truck reset, strike, pack + strap, delivery, unload/organize, home).
- Use the drive times and miles provided (they come from Google Maps / truck routing). If none are provided, estimate conservatively and say so in red_flags.
- Every leg of the timeline is a real drive between two real addresses. Work each one out from the addresses (HQ, client studio, venue, crew homes), never by assuming two places are "close". If the client's studio/pickup address is the same as (or next to) our HQ, then venue -> studio is the same drive as venue -> HQ, and the call ends when the unload at the studio is done (no extra drive home). Leave HQ only as early as the drive + the 15-30 min arrival buffer require; do not pad the departure.
- Take the client's answers on the inquiry form as fact (start time, hard out, their staff on site, linens, what comes back, addresses, vehicles). Don't ask them to confirm something they already answered, and don't call it into question, unless it conflicts with another answer or with their documents; then flag the specific conflict. missing_info and client_questions are only for things they did NOT tell us or that conflict.
- Size the team with zones: every task area is a zone with 1-2 people, and every zone must finish inside the client's window (load-in -> photo ready). Strike is sized the same way against breakdown start -> departure.
- When an attached proposal/production doc conflicts with the inquiry form (date, guest count, table count, pieces), TRUST THE DOCUMENT and flag the mismatch.
- Use the client's documents (proposal, design guide, flower order, run of show, floor plan, inventory pull report) to count pieces per zone and judge how heavy, fragile and numerous the inventory is. Use that for truck size and load/strike time.
- Pick vehicles: JS van ($1/mi per van) for small loads; U-Haul box truck sized to the inventory (min 2 rental days: pick up day before, return day after); or driving the client's truck (management fee). U-Haul is never left without a plan for strike: note if it stays parked near the venue.
- Base fee: count venue days, but waive extra days caused by next-day deliveries/returns that are for our schedule, team safety or convenience (explain in base_fee_note).
- Destination job (hotel + $50/person/day meals) only if a shift is over 12 hrs on site AND the drive home is over 2 hrs; flag back-to-back far-away days for admin to decide.
- Studio processing / reset days are flat per person (studio_days), not hourly.
- Team size: follow past-jobs/00-job-sizing.md (zones → work units → person-hours → fit the window → sanity-check vs similar jobs).
- Solo (team of 1) only when ALL are true: very easy job, daytime, easy/short drive, no ladders/rigging; say it needs a very strong team member. Night strikes and anything with ladders get at least 2.
- Premium labor triggers per crew call (premium_reasons): major_holiday = time and a half (Thanksgiving Day + the day after, Dec 24, 25, 26, Dec 31, Jan 1, July 4; e.g. $97.50/hr), holiday = +$10 (the rest of Thanksgiving weekend, Memorial/Labor Day weekends, Valentine's/Mother's Day weeks for floral work), nyc_difficult (Manhattan/Brooklyn/Queens venues with no dock, street parking/permits, security check-in, freight-elevator or union rules, long carries), short_notice (inquiry < 7 days before the event), extreme_access (ladders over 20 ft, scissor lift, heavy hung structures/grids over a dance floor), difficult_scope (the team will clearly work beyond a reasonable expectation: very heavy/awkward pieces, huge piece counts for the window, many long carries or stairs, multiple flips, punishing conditions). Only for genuinely harder calls; explain each in reasoning.
- Fabrication: if the job needs a custom build, estimate it in "fabrication" (materials cost + shop hours) using past fab jobs as comparables (e.g. metal chuppah $2,800 = $2,200 materials + $600 labor; wooden 8x8 chuppah ~$4,600; standard custom chuppah builds $1,823–3,279; modular arch ~$3,600–3,900; plinth build ~$2,355; 2x6 ft frame $450; 9x4 ft grid $510; chandelier rings $100 each; custom tabletops ~$415 each). Be explicit about confidence, flags and questions for Larry. If Jersey Strike already owns something that fits (wooden chuppah rental $950, arch rental, white plinths $75 each, pole urn + plinth, stage backdrop ~$3,600), suggest renting it instead via additional_rentals.
- Viability: Jersey Strike aims for a 50% gross margin on every job. Team pay is $30/hr ($45 on major holidays, overtime after 40 hrs/week) and includes each person's drive from home (often ~1 hr each way beyond HQ). The engine calculates margin; in reasoning, call out anything that would squeeze it (long drives, idle waits between install and strike, extra crew for safety, many small multi-day calls, grandfathered rates) and suggest how to restructure (fewer trips, combine calls, next-day strike, U-Haul vs van).
- Client history: check the past jobs for this business. Many first-time inquirers haven't budgeted for Jersey Strike yet and often book on their 3rd–5th inquiry or when in a pinch. For first-timers and past declines, keep the quote honest (don't cut safety/team below what the job needs), fill lean_option with a leaner alternative, and note it in client_history.
- Compare against the past jobs and list the most similar ones with what was charged.
- Do NOT calculate prices. Return quantities and times only; the pricing engine does the math.
- Times: use "h:mmam"/"h:mmpm" (e.g. "6:15am", "12:30am").
- Be specific and practical. Red flags = things that could blow the timeline or budget (tight windows, vague scope, unknown access/dock, union venue, ceiling/rigging work, high ladder work, weather for outdoor installs, second venues, missing docs). Missing info = what you'd need to firm up the quote.

Today is ${new Date().toISOString().slice(0, 10)}.

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

export async function planQuote(inquiry, routes) {
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

DRIVE TIMES (${routes.available ? 'from Google Maps' : 'not available'})
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
  return { plan: tool.input, docNotes, usage: msg.usage, model: msg.model };
}
