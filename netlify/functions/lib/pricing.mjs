// Jersey Strike pricing rules + math.
//
// Claude plans the job (timeline, team, vehicles, equipment). This file does every
// dollar calculation, so the math is exact and every line shows its work.
// To change a rate, change it here AND in PRICING-FORMULA.md (Claude reads that file).

import { ladderLines, checkInventory, checkReach } from './inventory.mjs';
import { localEvents } from './local-events.mjs';

export const RATES = {
  laborPerHour: 65, // all labor types
  // Premium labor: +$10/hr per trigger on that crew call, max +$20 (=$75 / $85).
  // Triggers: holiday, nyc_difficult, short_notice, extreme_access, difficult_scope (see PRICING-FORMULA.md).
  premiumPerTrigger: 10,
  premiumMax: 20,
  // Major holidays (Thanksgiving Day + Black Friday, Dec 24–26, Dec 31–Jan 1, July 4): time and a half
  // on the whole rate, e.g. $65 -> $97.50 (what we charged the day after Christmas 2025).
  majorHolidayMultiplier: 1.5,
  studioDayPerPerson: 450, // processing / design studio / reset days, flat
  baseFeePerVenueDay: 300,
  // Base fee by EVENT year (Alyssa, 10/30/26): 2027+ events pay $350 per crew call on site (install and strike are
  // 2 calls even on the same day), like her Heart + Soil 6/12/27 quote. Earlier dates, and grandfathered clients, keep $300 per venue day.
  baseFeeByYear: { 2027: { amount: 350, per: 'call' } },
  adminFeePct: 0.08, // applied last, on everything
  // Full production jobs (Full Production page, or job_type "full_production"). Modeled on Social Supply (DC).
  production: {
    planningFeePct: 0.12, // "Production planning fee", replaces the 8% admin fee; applied last, on the full subtotal
    sourcedMultiplier: 2, // things we buy for the job (chandeliers, greenery, disco balls, decor): our cost x 2 = 50% margin (same as fab materials)
    rentalUpcharge: 0.1, // outside vendor rentals / pass-throughs: our cost + 10% handling (production jobs only)
    depositPct: 0.5, // deposit on the remainder, after the planning fee
    typicalMin: 15000, // drafts flag full productions under this, don't bump
  },
  vanPerMile: 1, // per van, round trip
  boxTruckFuelPerRoundTrip: 200, // cap: box trucks bill $1/mi per round trip, up to $200 (short local trips don't burn a full tank)
  boxTruckFuelPerMile: 1,
  managementPerMile: 1, // U-Haul or client truck we drive
  managementMinClientTruck: 200,
  ladder: 50,
  skyscraperLadder: 150, // 12-24 ft
  riggingKit: 100,
  mealPerPersonDay: 50, // destination jobs
  // Custom fabrication (Claude's estimate; Larry confirms every one):
  // price = materials (our cost) x materialsMarkup + shop hours x shopRate.
  // Alyssa's Heart + Soil 6/12/27 quote: materials x 2.5, shop labor billed $75/hr, costs us $65/hr.
  fab: { materialsMarkup: 2.5, shopRate: 75 },
  // What jobs cost us (for the gross-margin check; never shown to clients).
  cost: {
    teamPay: 30, // $/hr, all jobs
    holidayPay: 45, // major holidays
    overtimeAfter: 40, // hrs clocked in a week -> time and a half
    homeDriveHrs: 1, // extra paid drive per person per crew call (home <-> HQ round trip), avg assumption
    studioDayHrs: 8, // paid hours per person on a flat studio day
    fuelPerMile: 0.7, // our fuel cost, any vehicle
    shopPay: 65, // $/hr, fabrication shop labor (Larry)
  },
  targetMargin: 0.5, // aim for 50% gross profit on every job
  bigJobGrossProfit: 2000, // a job clearing $2k+ gross profit can run under 50%
  minimums: { strike_only: 1500, full_service: 5000, full_production: 15000 }, // all-in totals incl. admin; drafts FLAG jobs under these, don't bump
  uhaul: {
    costPerDay: 87.5, // what U-Haul charges us (used when there's no real quote)
    costPerMile: 1.99,
    billPerDay: 135, // Method A (Trellis)
    billPerMile: 2.99,
    taxesFeesPct: 0.2, // Method B
    markup: 2.5,
    minDays: 2,
    profitFloor: 1.5, // billed rental + mileage must be at least this x our cost
  },
};

// Clients on older rates. `match` is tested against the business name.
export const GRANDFATHERED = [
  {
    match: /\bwile\b/i,
    name: 'Wile Events',
    laborPerHour: { install: 50, design: 50, flip: 50 }, // strike/returns stay at $65.
    // Set-up rate steps up each year toward $65, by EVENT DATE (Alyssa, 10/28/26). Add next year's rate here each November.
    laborByYear: { 2026: 50, 2027: 55 },
    adminFeePct: 0.05,
    marginByDollars: true, // judged on gross-profit dollars: high average project value (often $5k+ net)
    note: 'Wile Events is grandfathered: install, design and flip labor at $50/hr for 2026 dates and $55/hr for 2027 dates (strike stays $65/hr), and a 5% admin fee.',
  },
  {
    match: /petal\s*to\s*peddle|\baptp\b/i,
    name: 'A Petal to Peddle',
    noMinimum: true, // small jobs; charged actual + admin
    note: 'A Petal to Peddle is grandfathered: no strike or full-service minimum (actual job + 8% admin).',
  },
  {
    match: /lily\s+among\s+thorns/i,
    name: 'A Lily Among Thorns',
    discountPct: 0.25, // "family" discount, taken off the total after the admin fee
    note: 'A Lily Among Thorns is grandfathered: 25% family discount off the total (after the 8% admin fee).',
  },
];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const fmt = (n) =>
  (n < 0 ? '-$' : '$') + Math.abs(round2(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// "6:15am", "6:15 PM", "18:30", "12am" -> minutes after midnight
export function toMinutes(t) {
  const m = String(t || '').trim().toLowerCase().replace(/\./g, '').match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) return null;
  let h = +m[1];
  const min = +(m[2] || 0);
  const ap = m[3]?.[0];
  if (h > 23 || min > 59) return null;
  if (ap === 'p' && h !== 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  return h * 60 + min;
}

// Portal to portal: depart HQ -> back at HQ. Handles shifts past midnight. Rounds up to 1/4 hr.
export function shiftHours(depart, back) {
  const a = toMinutes(depart);
  const b = toMinutes(back);
  if (a == null || b == null) return null;
  let d = b - a;
  if (d <= 0) d += 24 * 60;
  return Math.ceil(d / 15) / 4;
}

export function clientRules(business) {
  return GRANDFATHERED.find((g) => g.match.test(business || '')) || null;
}

// U-Haul: price both ways, use the one that's cheaper for the client and still profitable.
export function priceUhaul({ days, miles, quotedCost }) {
  const U = RATES.uhaul;
  const d = Math.max(U.minDays, Math.ceil(num(days)));
  const mi = Math.max(0, Math.round(num(miles)));
  const ourCost = num(quotedCost) > 0 ? num(quotedCost) : d * U.costPerDay + mi * U.costPerMile;
  const costMath = num(quotedCost) > 0
    ? `U-Haul quote ${fmt(ourCost)}`
    : `${plural(d, 'day')} × ${fmt(U.costPerDay)} + ${mi} mi × ${fmt(U.costPerMile)} = ${fmt(ourCost)}`;
  const a = { method: 'A', label: 'Trellis rate', amount: round2(d * U.billPerDay + mi * U.billPerMile),
    math: `${plural(d, 'day')} × ${fmt(U.billPerDay)} + ${mi} mi × ${fmt(U.billPerMile)}` };
  const b = { method: 'B', label: '2.5× cost', amount: round2(ourCost * (1 + U.taxesFeesPct) * U.markup),
    math: `(${fmt(ourCost)} cost + ${U.taxesFeesPct * 100}% taxes/fees) × ${U.markup}` };
  const floor = round2(ourCost * U.profitFloor);
  const ok = [a, b].filter((x) => x.amount >= floor).sort((x, y) => x.amount - y.amount);
  let chosen = ok[0];
  let why;
  if (chosen) {
    const other = chosen === a ? b : a;
    why = `Method ${chosen.method} (${chosen.label}) is ${fmt(other.amount - chosen.amount)} cheaper for the client than Method ${other.method} and is ${(chosen.amount / ourCost).toFixed(2)}× our cost (floor ${U.profitFloor}×).`;
    if (other.amount < chosen.amount) why = `Method ${other.method} would be cheaper but is under the ${U.profitFloor}× profit floor, so Method ${chosen.method} is used.`;
  } else {
    chosen = { method: 'floor', label: 'profit floor', amount: floor, math: `${fmt(ourCost)} cost × ${U.profitFloor}` };
    why = `Both methods fall under the ${U.profitFloor}× profit floor, so the floor is used.`;
  }
  return { days: d, miles: mi, ourCost: round2(ourCost), costMath, a, b, floor, chosen, why };
}

// plan: Claude's structured plan (see claude.mjs schema). inquiry: normalized form data.
// Phases (Trellis-style sections): every line says which part of the job it belongs to, so the hub's quote editor
// and the proposal can group them (ctx.groupByPhase) and full productions read in order.
// Order = how the proposal reads: what we make/source/rent first, then the labor (crew calls), vehicles + equipment.
export const PHASES = [['sourcing', 'Floral + decor sourcing'], ['fabrication', 'Fabrication'], ['rentals', 'Rentals (our library)'], ['studio', 'Studio prep + processing'],
  ['delivery', 'Delivery + pickup'], ['install', 'Install / set up'], ['strike', 'Strike'], ['transport', 'Vehicles + transport'], ['equipment', 'Equipment'], ['other', 'Other'], ['travel', 'Travel']];
export const phaseOfKind = (k) => ({ design: 'studio', processing: 'studio', studio: 'studio', delivery: 'delivery', pickup: 'delivery', return: 'delivery', strike: 'strike' }[k] || 'install');

// ctx.rates: optional overrides (e.g. the hub's dated rate card): { laborPerHour, baseFeePerVenueDay, adminFeePct, vanPerMile, cost: { teamPay, ... } }.
export function mergeRates(over = {}) {
  const o = over || {};
  return { ...RATES, ...o, cost: { ...RATES.cost, ...(o.cost || {}) }, uhaul: { ...RATES.uhaul, ...(o.uhaul || {}) }, fab: { ...RATES.fab, ...(o.fab || {}) }, production: { ...RATES.production, ...(o.production || {}) }, minimums: { ...RATES.minimums, ...(o.minimums || {}) } };
}

export function priceQuote(plan, inquiry = {}, ctx = {}) {
  // plan.rate_overrides: this quote's own rates (labor $/hr, admin %, base fee, van $/mi), set in the hub's quote editor.
  const ov = Object.fromEntries(Object.entries(plan.rate_overrides || {}).filter(([, v]) => v !== '' && v != null && Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)]));
  const R = mergeRates({ ...(ctx.rates || {}), ...ov });
  // plan.client_rule: pick a client's pricing by hand ('standard' = none), else matched from the business name.
  const g = plan.client_rule === 'standard' ? null : plan.client_rule ? GRANDFATHERED.find((x) => x.name === plan.client_rule) || null : clientRules(inquiry.business);
  const production = !!inquiry.production || plan.job_type === 'full_production';
  const lines = [];
  const warnings = [];
  const uhauls = [];
  const costs = [];
  let personHrs = 0;
  const add = (section, label, math, amount, extra = {}) =>
    lines.push({ section, label, math, amount: round2(amount), ...extra });

  // Labor: each shift is portal to portal
  for (const [si, s] of (plan.shifts || []).entries()) {
    let hrs = shiftHours(s.depart_hq, s.back_hq);
    if (hrs == null) {
      hrs = num(s.hours);
      warnings.push(`Couldn't read the times for "${s.label}"; used ${hrs} hrs.`);
    }
    if (Math.round(num(s.team_size)) === 1) warnings.push(`"${s.label}" is a solo shift: only OK with a very strong team member, a very easy job, daytime and an easy drive.`);
    if (hrs > 16) warnings.push(`"${s.label}" is ${hrs} hrs portal to portal. Check team safety / hotel.`);
    const kind = s.kind || 'install';
    let grand = ov.laborPerHour != null ? undefined : g?.laborPerHour?.[kind]; // a typed labor rate for the quote beats the client's deal
    if (grand != null && g.laborByYear) {
      let yr = null;
      const dm = String(s.date || '').match(/\d{1,2}\/\d{1,2}\/(\d{2,4})/) || String(plan.event_date || inquiry.event_date || '').match(/^(\d{4})-/);
      if (dm) yr = Number(dm[1].length === 2 ? `20${dm[1]}` : dm[1]);
      const years = Object.keys(g.laborByYear).map(Number).sort();
      if (!yr) { yr = new Date().getFullYear(); warnings.push(`${g.name}: no event year on "${s.label}"; used ${yr} rates.`); }
      const use = years.filter((y) => y <= yr).pop() ?? years[0];
      grand = g.laborByYear[use];
    }
    const triggers = [...new Set((s.premium_reasons || []).filter(Boolean))];
    let rate = grand ?? R.laborPerHour;
    const major = triggers.includes('major_holiday');
    const adders = triggers.filter((t) => t !== 'major_holiday');
    if (grand == null) {
      if (adders.length) rate += Math.min(R.premiumMax, adders.length * R.premiumPerTrigger);
      if (major) rate = round2(rate * R.majorHolidayMultiplier);
    }
    if (triggers.length && grand != null) warnings.push(`"${s.label}" has premium triggers (${triggers.join(', ')}) but ${g.name} is on grandfathered rates; no premium applied.`);
    if (num(s.rate_override) > 0) rate = num(s.rate_override); // a rate typed on this call in the quote editor wins
    const team = Math.max(0, Math.round(num(s.team_size)));
    const payRate = major && grand == null ? R.cost.holidayPay : R.cost.teamPay;
    costs.push({ what: `${s.label}: ${team} × (${hrs} + ${R.cost.homeDriveHrs} home drive) hrs × ${fmt(payRate)}`, amount: team * (hrs + R.cost.homeDriveHrs) * payRate, kind: 'labor', shift: si, team, hrs, payRate, holiday: major && grand == null });
    personHrs += team * hrs;
    add('Labor', [s.label, s.date].filter(Boolean).join(' | '),
      `Team of ${team} × ${hrs} hrs × ${fmt(rate)}/hr (${s.depart_hq} → ${s.back_hq} portal to portal)${triggers.length && grand == null ? `; premium: ${triggers.join(' + ').replace(/_/g, ' ')}` : ''}`,
      team * hrs * rate, { hours: hrs, team, rate, roles: s.roles || '', ref: s.id, phase: s.phase || phaseOfKind(kind),
        steps: (s.steps || []).filter((st) => st && (st.time || st.label)).map((st) => ({ time: st.time, label: st.label })), ...(s.proposal_text ? { text: s.proposal_text } : {}), attached: [] });
  }
  for (const d of plan.studio_days || []) {
    const p = Math.max(0, Math.round(num(d.people)));
    costs.push({ what: `${d.label || 'Studio day'}: ${p} × ${R.cost.studioDayHrs} hrs × ${fmt(R.cost.teamPay)}`, amount: p * R.cost.studioDayHrs * R.cost.teamPay });
    add('Labor', [d.label || 'Studio day', d.date].filter(Boolean).join(' | '),
      `${p} × ${fmt(R.studioDayPerPerson)} flat per person`, p * R.studioDayPerPerson, { ref: d.id, phase: d.phase || 'studio', display: `${plural(p, 'person')} × ${fmt(R.studioDayPerPerson)} studio day` });
  }

  // Vehicles
  for (const v of plan.vehicles || []) {
    const count = v.kind === 'van' && v.js_van === 'both' ? Math.max(2, Math.round(num(v.count, 2))) : Math.max(1, Math.round(num(v.count, 1)));
    const trips = Math.max(1, Math.round(num(v.trips, 1)));
    const rt = Math.max(0, Math.round(num(v.round_trip_miles)));
    const label = v.label || v.kind;
    if (v.kind === 'van') {
      const miles = rt * trips * count;
      costs.push({ what: `${label}: OUR fuel cost, ${miles} mi × $0.70 (client is billed $1/mi above)`, amount: miles * R.cost.fuelPerMile });
      add('Vehicles', label, `${plural(count, 'van')} × ${rt} mi round trip × ${plural(trips, 'trip')} × ${fmt(R.vanPerMile)}/mi`, miles * R.vanPerMile, { ref: v.id, phase: 'transport',
        display: [v.description || `JS vehicle use${trips > 1 ? ` (${plural(trips, 'trip')})` : ''}${count > 1 ? `, ${plural(count, 'van')}` : ''}`, `Approx ${miles} miles round trip`, '', `${fmt(R.vanPerMile).replace('.00', '')}/mile`].join('\n') });
    } else if (v.kind === 'uhaul') {
      const miles = num(v.uhaul_miles) > 0 ? num(v.uhaul_miles) : rt * trips;
      for (let i = 0; i < count; i++) {
        const u = priceUhaul({ days: v.rental_days, miles, quotedCost: v.uhaul_quoted_cost });
        uhauls.push({ label, ...u });
        costs.push({ what: `${label}: U-Haul (our cost) + fuel`, amount: u.ourCost * (num(v.uhaul_quoted_cost) > 0 ? 1 : 1 + R.uhaul.taxesFeesPct) + u.miles * R.cost.fuelPerMile });
        add('Vehicles', `${label}: rental + mileage`, `${u.chosen.math} (Method ${u.chosen.method}; our cost ${fmt(u.ourCost)})`, u.chosen.amount, { ref: v.id, phase: 'transport', display: `${plural(u.days, 'day')} rental + ${u.miles} mi` });
        const uf = Math.min(R.boxTruckFuelPerRoundTrip, u.miles / trips * R.boxTruckFuelPerMile);
        add('Vehicles', `${label}: fuel`, `${plural(trips, 'round trip')} × ${uf < R.boxTruckFuelPerRoundTrip ? `${Math.round(u.miles / trips)} mi × ${fmt(R.boxTruckFuelPerMile)}` : `${fmt(R.boxTruckFuelPerRoundTrip)} (max)`}`, trips * uf, { ref: v.id, phase: 'transport' });
        add('Vehicles', `${label}: U-Haul management`, `${u.miles} mi × ${fmt(R.managementPerMile)}/mi`, u.miles * R.managementPerMile, { ref: v.id, phase: 'transport' });
      }
    } else if (v.kind === 'client_truck') {
      const per = Math.max(R.managementMinClientTruck, rt * R.managementPerMile);
      // driver is already paid on the crew call; no extra vehicle cost
      add('Vehicles', `${label}: truck management (driving client's truck)`,
        `${plural(trips, 'round trip')} × greater of ${fmt(R.managementMinClientTruck)} or ${rt} mi × ${fmt(R.managementPerMile)}`, per * trips * count, { ref: v.id, phase: 'transport' });
    } else if (v.kind === 'box_truck') {
      costs.push({ what: `${label}: OUR fuel cost (× $0.70/mi)`, amount: rt * trips * count * R.cost.fuelPerMile });
      const bf = Math.min(R.boxTruckFuelPerRoundTrip, rt * R.boxTruckFuelPerMile);
      add('Vehicles', `${label}: fuel`, `${plural(trips * count, 'round trip')} × ${bf < R.boxTruckFuelPerRoundTrip ? `${rt} mi × ${fmt(R.boxTruckFuelPerMile)}` : `${fmt(R.boxTruckFuelPerRoundTrip)} (max)`}`, trips * count * bf, { ref: v.id, phase: 'transport' });
      if (!v.js_owned) warnings.push(`"${label}" is a box truck that isn't a U-Haul or the client's. Only fuel is charged; confirm whose truck it is.`);
    }
  }

  // Custom fabrication
  const fabs = [];
  for (const f of plan.fabrication || []) {
    const mat = Math.max(0, num(f.materials_cost));
    const hrs = Math.max(0, num(f.shop_hours));
    const amount = mat * R.fab.materialsMarkup + hrs * R.fab.shopRate;
    fabs.push({ ...f, amount: round2(amount) });
    costs.push({ what: `${f.label || 'Fabrication'}: materials + ${hrs} shop hrs × ${fmt(R.cost.shopPay)}`, amount: mat + hrs * R.cost.shopPay });
    const fq = Math.max(1, Math.round(num(f.qty, 1)));
    add('Fabrication', f.label || 'Custom fabrication',
      `materials ${fmt(mat)} × ${R.fab.materialsMarkup} + ${hrs} shop hrs × ${fmt(R.fab.shopRate)} (estimate; Larry to confirm)`, amount,
      { ref: f.id, phase: f.phase || 'fabrication', qty: fq, display: fq > 1 ? `${fq} × ${fmt(amount / fq)}` : (f.description || 'Design, materials + shop build') });
  }
  if (fabs.length && !ctx.manual) warnings.push('Custom fabrication is a Claude estimate: Alyssa to check with Larry before quoting.');

  // Equipment
  const eq = plan.equipment || {};
  // Ladders + rigging kit either print as their own lines, or roll into one crew call's price (equipment.attach_to = that
  // call's id), the way we show them on an INSTALL line: "(4) Podium ladders - 200 / Rigging Tool Kit - 100".
  const host = eq.attach_to ? lines.find((l) => l.section === 'Labor' && l.ref === eq.attach_to) : null;
  const eqItems = [...ladderLines(eq).map((l) => ({ label: l.label, math: `${l.count} × ${fmt(l.price)}`, amount: l.count * l.price, text: `(${l.count}) ${l.label} - ${fmt(l.count * l.price).replace('.00', '')}` })),
    ...(eq.rigging_kit ? [{ label: 'Rigging tool kit', math: 'flat', amount: R.riggingKit, text: `Rigging Tool Kit - ${fmt(R.riggingKit).replace('.00', '')}` }] : [])];
  for (const e of eqItems) {
    if (host) { host.amount = round2(host.amount + e.amount); host.attached.push(e.text); host.math += ` + ${e.label} ${fmt(e.amount)}`; }
    else add('Equipment', e.label, e.math, e.amount, { phase: 'equipment' });
  }
  for (const r of plan.additional_rentals || []) {
    if (num(r.amount) > 0 && !r.js_owned) costs.push({ what: `${r.label || 'Rental'} (pass-through)`, amount: num(r.amount) });
    if (num(r.amount) > 0 && production && !r.js_owned) {
      const up = R.production.rentalUpcharge;
      add('Equipment', r.label || 'Additional rental', `our cost ${fmt(num(r.amount))} + ${Math.round(up * 100)}% handling${r.note ? `: ${r.note}` : ''}`, num(r.amount) * (1 + up), { phase: 'other', display: r.note || 'Outside rental, coordinated by Jersey Strike' });
    } else if (num(r.amount) > 0) add('Equipment', r.label || 'Additional rental', r.note ? `pass-through: ${r.note}` : 'pass-through', num(r.amount), { phase: 'other' });
  }

  // Sourced items (chandeliers, greenery, disco balls, decor we buy for the job): our cost × 2 = 50% margin.
  for (const it of plan.sourced_items || []) {
    const c = Math.max(0, num(it.cost));
    if (!c) continue;
    const m = R.production.sourcedMultiplier;
    costs.push({ what: `${it.label || 'Sourced item'} (our cost)`, amount: c });
    const sq = Math.max(1, Math.round(num(it.qty, 1)));
    add('Sourcing', it.label || 'Sourced items', `our cost ${fmt(c)} × ${m}${it.note ? `: ${it.note}` : ''}`, c * m,
      { ref: it.id, phase: it.phase || 'sourcing', qty: sq, display: sq > 1 ? `${sq} × ${fmt((c * m) / sq)}${it.note ? ` · ${it.note}` : ''}` : (it.note || 'Sourced + prepped by Jersey Strike') });
  }
  // Quote items with their own recipe (Trellis-style, built in the hub's quote editor): qty × price each, where the price
  // is the recipe's retail (each component's own markup) unless someone typed a price. Description prints on the proposal.
  for (const it of plan.items || []) {
    const q = Math.max(0, num(it.qty, 1));
    const each = it.price !== undefined && it.price !== null && it.price !== '' ? num(it.price) : num(it.retail);
    if (!(q * each)) continue;
    if (num(it.cost) > 0) costs.push({ what: `${it.name || 'Item'}: recipe cost (materials + labor)`, amount: q * num(it.cost) });
    add('Items', it.name || 'Item', `${q} × ${fmt(each)}${num(it.cost) > 0 ? ` (recipe cost ${fmt(num(it.cost))} each, MU ${(each / num(it.cost)).toFixed(2)})` : ''}`, q * each,
      { ref: it.id, phase: it.phase || 'sourcing', qty: q, display: it.description || '', photos: it.photos || [] });
  }
  // Custom line items (Trellis-style: anything else on the job, e.g. a delivery fee or floral disposal): qty × unit price.
  for (const ci of plan.custom_items || []) {
    const q = num(ci.qty, 1), up = num(ci.unit_price);
    if (!(q * up)) continue;
    if (num(ci.unit_cost) > 0) costs.push({ what: `${ci.label || 'Line item'} (our cost)`, amount: q * num(ci.unit_cost) });
    add('Other', ci.label || 'Line item', `${q} × ${fmt(up)}`, q * up, { ref: ci.id, phase: ci.phase || 'other', qty: q, display: ci.note || `${q} × ${fmt(up)}` });
  }
  if (!ctx.manual && (plan.sourced_items || []).some((it) => num(it.cost) > 0)) warnings.push('Sourced item costs are Claude estimates: confirm real prices before quoting.');

  // Travel
  const t = plan.travel || {};
  if (num(t.tolls) > 0) costs.push({ what: 'Tolls', amount: num(t.tolls) });
  if (num(t.tolls) > 0) add('Travel', 'Tolls (estimate)', t.tolls_note || 'pass-through', num(t.tolls), { phase: 'travel' });
  if (num(t.hotel_nights) > 0 && num(t.hotel_rooms) > 0) {
    const rate = num(t.hotel_rate_estimate, 180);
    costs.push({ what: 'Hotel', amount: num(t.hotel_rooms) * num(t.hotel_nights) * rate });
    add('Travel', 'Hotel (estimate, pass-through)', `${plural(num(t.hotel_rooms), 'room')} × ${plural(num(t.hotel_nights), 'night')} × ${fmt(rate)}`,
      num(t.hotel_rooms) * num(t.hotel_nights) * rate, { phase: 'travel' });
  }
  if (num(t.meal_person_days) > 0) costs.push({ what: 'Meals', amount: num(t.meal_person_days) * R.mealPerPersonDay });
  if (num(t.meal_person_days) > 0) add('Travel', 'Meal allowance', `${num(t.meal_person_days)} person-days × ${fmt(R.mealPerPersonDay)}`, num(t.meal_person_days) * R.mealPerPersonDay, { phase: 'travel' });

  // Trellis-style order: sourcing → studio → delivery → install → strike → fabrication → vehicles → equipment → other.
  if (ctx.groupByPhase) {
    // Sections in order (set up / install before strike), and inside a section by date (multi-day installs: day 1, day 2…).
    const order = Object.fromEntries(PHASES.map(([k], i) => [k, i]));
    const dkey = (l) => { const m = String(l.label || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); return m ? Number(`${m[3].length === 2 ? `20${m[3]}` : m[3]}${m[1].padStart(2, '0')}${m[2].padStart(2, '0')}`) : 0; };
    const keyed = lines.map((l, i) => [order[l.phase] ?? 99, dkey(l), i, l]).sort((a, b) => a[0] - b[0] || (a[1] && b[1] ? a[1] - b[1] : 0) || a[2] - b[2]);
    lines.splice(0, lines.length, ...keyed.map((x) => x[3]));
  }
  const itemsSubtotal = round2(lines.reduce((s, l) => s + l.amount, 0));

  // Base service fee: per day on site at a venue
  const charges = [];
  const eyMatch = String(plan.event_date || inquiry.event_date || inquiry.eventDate || '').match(/^(\d{4})-/) || String((plan.shifts || [])[0]?.date || '').match(/\d{1,2}\/\d{1,2}\/(\d{2,4})/);
  const eventYear = eyMatch ? Number(eyMatch[1].length === 2 ? `20${eyMatch[1]}` : eyMatch[1]) : null;
  const byYear = Object.keys(R.baseFeeByYear || {}).map(Number).sort().filter((y) => eventYear && y <= eventYear).pop();
  const yearRule = byYear && !g ? R.baseFeeByYear[byYear] : null; // grandfathered clients (Wile, APTP, ALAT) keep $300 per venue day
  let baseFee;
  if (yearRule?.per === 'call') {
    const venueCalls = (plan.shifts || []).filter((x) => x.kind !== 'design' && x.venue_day !== false).length;
    const n = plan.base_fee_calls != null && plan.base_fee_calls !== '' ? Math.max(0, Math.round(num(plan.base_fee_calls))) : venueCalls;
    const amt = ov.baseFeePerVenueDay ?? yearRule.amount;
    baseFee = { per: 'call', count: n, amount: amt, year: byYear };
    if (n) charges.push({ label: 'Base Service', math: `${plural(n, 'crew call')} × ${fmt(amt)}`, amount: n * amt });
  } else {
    const baseDays = Math.max(0, Math.round(num(plan.base_fee_days)));
    baseFee = { per: 'day', count: baseDays, amount: R.baseFeePerVenueDay };
    if (baseDays) charges.push({ label: 'Base Service', math: `${plural(baseDays, 'venue day')} × ${fmt(R.baseFeePerVenueDay)}`, amount: baseDays * R.baseFeePerVenueDay });
  }
  let subtotal = round2(itemsSubtotal + charges.reduce((s, c) => s + c.amount, 0));

  // Minimums ($1,500 strike / $5,000 full-service, all-in incl. admin) are FLAGGED, not added:
  // the draft shows the real number and the admin team decides.
  const minimum = g?.noMinimum ? 0 : R.minimums[production ? 'full_production' : plan.job_type] || 0;
  // Full productions carry a 12% production planning fee instead of the admin fee.
  const adminPct = ov.adminFeePct != null ? ov.adminFeePct : production ? R.production.planningFeePct : g?.adminFeePct ?? R.adminFeePct;
  const feeLabel = production ? 'Production planning fee' : 'Admin fee';
  if (production && g?.adminFeePct != null) warnings.push(`${g.name} normally gets a ${Math.round(g.adminFeePct * 100)}% admin fee; this full production uses the ${Math.round(R.production.planningFeePct * 100)}% production planning fee instead. Confirm.`);
  const admin = round2(subtotal * adminPct);
  let total = round2(subtotal + admin);
  let discount = null;
  if (g?.discountPct) {
    discount = { label: `${g.name} discount`, pct: g.discountPct, amount: round2(-total * g.discountPct) };
    total = round2(total + discount.amount);
  }
  if (production && minimum && total < minimum) {
    warnings.push(`Under ${fmt(minimum)}, the low end of a typical full production, by ${fmt(minimum - total)}. Check whether this should be quoted as a crew job instead.`);
  } else if (minimum && total < minimum) {
    warnings.push(`Under the ${fmt(minimum)} ${plan.job_type === 'strike_only' ? 'strike' : 'full-service day-of'} minimum by ${fmt(minimum - total)} (all-in). Not bumped up; decide whether to apply it.`);
  }

  // Gross margin check (target 50%)
  const cost = round2(costs.reduce((a, c) => a + c.amount, 0));
  const gp = round2(total - cost);
  const marginPct = total > 0 ? gp / total : 0;
  const neededTotal = round2(cost / (1 - R.targetMargin));
  const margin = { cost, costs: costs.map((c) => ({ ...c, amount: round2(c.amount) })), gp, pct: Math.round(marginPct * 1000) / 10, target: R.targetMargin * 100,
    neededTotal, verdict: marginPct >= R.targetMargin ? 'on target' : gp >= R.bigJobGrossProfit ? `under 50% but worth it: ${fmt(gp)} gross profit`
      : g?.marginByDollars ? `${g.name} exception: judged on gross-profit dollars (${fmt(gp)})` : marginPct >= 0.4 ? 'below target' : 'not viable as quoted' };
  if (marginPct < R.targetMargin && total > 0 && gp < R.bigJobGrossProfit && !g?.marginByDollars) warnings.push(`Gross margin ${margin.pct}% is under the 50% target (cost ${fmt(cost)}). ${fmt(neededTotal)} would hit 50%.`);
  const perPerson = (plan.shifts || []).length ? personHrs / Math.max(1, ...(plan.shifts || []).map((s) => num(s.team_size))) : 0;
  if (perPerson > R.cost.overtimeAfter * 0.6) warnings.push(`About ${Math.round(perPerson)} hrs per person on this job: check the crew's weekly hours. Over 40 clocked = overtime at $45/hr.`);

  // Inventory, vehicles + reach (code checks, so a short ladder or a third van never slips through)
  const inv = checkInventory(plan, { otherEvents: ctx.otherEvents || [], hqName: ctx.hqName || '' });
  // Big local events on the date (parades, marathons, tree lightings, NYE...): road closures + traffic around the venue
  const events = localEvents([inquiry.eventDate || inquiry.event_date || plan.event_date, ...(plan.shifts || []).map((x) => x.date)],
    [inquiry.venue, inquiry.studio, ...(plan.shifts || []).flatMap((x) => (x.steps || []).map((st) => st.label))]);
  const eventFlags = events.map((e) => `LOCAL EVENT ${e.when === 'same day' ? 'ON THE DATE' : 'THE DAY BEFORE/AFTER'} (${e.date}): ${e.name}. Add ~${e.buffer} min to every drive into/out of the area, plan the route around the closures, and confirm the venue's loading/access plan.`);
  warnings.unshift(...eventFlags, ...checkReach(plan, inquiry), ...inv.warnings);

  return {
    lines, charges, baseFee, itemsSubtotal, subtotal, minimum, adminPct, feeLabel, production, admin, discount, total, uhauls, fabs, margin, warnings, gear: inv.pull, reach: plan.reach_note || null, localEvents: events,
    grandfathered: g ? g.note : '',
  };
}
