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
      notes: str } } },
    equipment: { type: 'object', properties: { ladders: numT, skyscraper_ladders: numT, rigging_kit: { type: 'boolean' } } },
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
    similar_jobs: { type: 'array', items: { type: 'object', properties: { job: str, why: str, charged: str } } },
    task_list: { ...strArr, description: 'Scope / task list in the style of the proposal template, grouped by event.' },
  },
};

function systemPrompt() {
  return `You are the production estimator for Jersey Strike Co., an event staffing + logistics partner for florists, planners and venues in NJ/NY/PA (install + strike crews, flips, transport, studio processing, fabrication, rentals).

A new inquiry came in. Plan a PRELIMINARY quote for the admin team to review. It is never sent to the client automatically.

How to plan:
- Build a detailed running timeline for every crew call, portal to portal (crew departs HQ -> ... -> back at HQ), following the install and strike timelines in the pricing formula exactly (1 hr minimum HQ departure leg, 15 min early studio arrival, 15 min early venue arrival or 30-45 min if parking/dock is hard, load, drive, unload, setup, backload, flip, truck organized, drive home; strike: early prep, client truck reset, strike, pack + strap, delivery, unload/organize, home).
- Use the drive times and miles provided (they come from Google Maps / truck routing). If none are provided, estimate conservatively and say so in red_flags.
- Size the team with zones: every task area is a zone with 1-2 people, and every zone must finish inside the client's window (load-in -> photo ready). Strike is sized the same way against breakdown start -> departure.
- Use the client's documents (proposal, design guide, flower order, run of show, floor plan, inventory pull report) to count pieces per zone and judge how heavy, fragile and numerous the inventory is. Use that for truck size and load/strike time.
- Pick vehicles: JS van ($1/mi per van) for small loads; U-Haul box truck sized to the inventory (min 2 rental days: pick up day before, return day after); or driving the client's truck (management fee). U-Haul is never left without a plan for strike: note if it stays parked near the venue.
- Base fee: count venue days, but waive extra days caused by next-day deliveries/returns that are for our schedule, team safety or convenience (explain in base_fee_note).
- Destination job (hotel + $50/person/day meals) only if a shift is over 12 hrs on site AND the drive home is over 2 hrs; flag back-to-back far-away days for admin to decide.
- Studio processing / reset days are flat per person (studio_days), not hourly.
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
