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
  // Major holidays (Thanksgiving weekend Wed–Sun, Dec 23 – Jan 2, July 4; see holidayOf below): time and a half
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
  boxTruckFuelPerRoundTrip: 200, // MINIMUM: box trucks bill $1/mi per round trip, at least $200 per round trip (Alyssa, 11/3/26)
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
// Strict hard out (rule 11/11/26): with 1 hour or less from strike start to the venue's hard out, the crew carries the
// arrangements out whole, then finishes the standard strike at the truck (stems out of vessels, consolidate, pack +
// strap): 30-60 min after the hard out (45 by default) before departing. shift.hard_out = the venue's hard out.
export const TRUCK_STEP = 'Finish strike at the truck: stems out of vessels, consolidate, pack + strap';
const isTruckStep = (st) => /finish strike at the truck/i.test(st?.label || '');
const fmtMin = (m) => { m = ((m % 1440) + 1440) % 1440; const h = Math.floor(m / 60), mm = m % 60; return `${h % 12 || 12}:${String(mm).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`; };
const nearDiff = (a, b) => { let d = (b - a) % 1440; if (d < -720) d += 1440; if (d > 720) d -= 1440; return d; };
const startIdx = (steps) => steps.findIndex((x) => /begin|start/i.test(x.label || '') && toMinutes(x.time) != null);
export function strikeWindow(s) {
  const st = s?.steps || []; const i = startIdx(st);
  const start = i >= 0 ? toMinutes(st[i].time) : null; const ho = toMinutes(s?.hard_out);
  if (start == null || ho == null) return null;
  let w = ho - start; if (w <= 0) w += 1440;
  return { start, hardOut: ho, minutes: w, tight: w <= 60, truck: st.some(isTruckStep) };
}
// Puts the "finish strike at the truck" step in (or takes it out) and moves the drive back + return to match.
export function applyHardOut(s) {
  const w = strikeWindow(s); if (!w) return s;
  const steps = (s.steps || []).map((x) => ({ ...x }));
  const shiftFrom = (k0, d) => { for (let k = k0; k < steps.length; k++) { const m = toMinutes(steps[k].time); if (m != null) steps[k].time = fmtMin(m + d); } };
  const backOf = () => (steps.length && toMinutes(steps[steps.length - 1].time) != null ? steps[steps.length - 1].time : s.back_hq);
  let ti = steps.findIndex(isTruckStep);
  if (!w.tight) {
    if (ti < 0) return s;
    const tEnd = toMinutes(steps[ti].time) + (Number(s.truck_applied) || 45);
    steps.splice(ti, 1);
    const prev = steps[ti - 1]; if (prev && /out of the venue by the hard out/i.test(prev.label || '')) prev.label = 'Strike done, van backloaded + organized';
    const pm = prev ? toMinutes(prev.time) : null;
    // the truck time comes back off; a "depart" step goes back to ~15 min after the strike is done
    if (pm != null && steps[ti]) shiftFrom(ti, nearDiff(tEnd, pm + (/depart/i.test(steps[ti].label || '') ? 15 : 0)));
    const { truck_applied: _t, ...rest } = s; return { ...rest, steps, back_hq: backOf() };
  }
  const tmin = Math.max(30, Math.min(60, Math.round(Number(s.truck_min) || 45)));
  const si = startIdx(steps);
  let di = ti > 0 ? ti - 1 : steps.findIndex((x, k) => k > si && /done|backload|out of the venue/i.test(x.label || ''));
  if (di < 0) di = si;
  // where the strike work ended before this change (the next steps keep their gap from it: the drive, or depart right away)
  const nx0 = steps[(ti >= 0 ? ti : di) + 1]; const nxm = nx0 ? toMinutes(nx0.time) : null;
  let prevEnd = ti >= 0 ? toMinutes(steps[ti].time) + (Number(s.truck_applied) || 45) : toMinutes(steps[di].time);
  if (ti < 0 && nx0 && /depart/i.test(nx0.label || '') && nxm != null && prevEnd != null) prevEnd += Math.max(0, Math.min(15, nearDiff(prevEnd, nxm)));
  if (di !== si) { steps[di].time = fmtMin(w.hardOut); if (!/out of the venue/i.test(steps[di].label || '')) steps[di].label = 'Out of the venue by the hard out (arrangements carried out whole)'; }
  const truck = { time: fmtMin(w.hardOut), label: `${TRUCK_STEP} (${tmin} min)` };
  if (ti < 0) { steps.splice(di + 1, 0, truck); ti = di + 1; } else steps[ti] = truck;
  if (steps[ti + 1] && prevEnd != null) shiftFrom(ti + 1, nearDiff(prevEnd, w.hardOut + tmin));
  return { ...s, steps, back_hq: backOf(), truck_applied: tmin };
}

// The playbook's holiday calendar (same as the website drafts' date check): 'major' = time and a half,
// 'holiday' = +$10/hr. Returns the premium for a date (YYYY-MM-DD or M/D/YY), or null.
export function holidayOf(raw) {
  const iso = String(raw || '').match(/(\d{4})-(\d{2})-(\d{2})/); const us = String(raw || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  const d = iso ? new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3])) : us ? new Date(Date.UTC(+(us[3].length === 2 ? `20${us[3]}` : us[3]), +us[1] - 1, +us[2])) : null;
  if (!d || isNaN(d)) return null;
  const y = d.getUTCFullYear(); const D = (mo, day) => Date.UTC(y, mo, day);
  const nth = (mo, wd, n) => { const f = new Date(D(mo, 1)).getUTCDay(); return D(mo, 1 + ((wd - f + 7) % 7) + (n - 1) * 7); };
  const last = (mo, wd) => { const l = new Date(D(mo + 1, 0)); return D(mo, l.getUTCDate() - ((l.getUTCDay() - wd + 7) % 7)); };
  const DAY = 864e5, t = d.getTime(), thanks = nth(10, 4, 4);
  const cal = [["New Year's Day", D(0, 1), 'major', 0, 0], ['the holiday season (Dec 23 – Jan 2)', D(0, 1), 'major', 0, 1], ["Valentine's week", D(1, 14), 'holiday', 7, 0],
    ["Mother's Day week", nth(4, 0, 2), 'holiday', 6, 0], ['Memorial Day weekend', last(4, 1), 'holiday', 3, 0], ['July 4th', D(6, 4), 'major', 0, 0],
    ['Labor Day weekend', nth(8, 1, 1), 'holiday', 3, 0], ['Thanksgiving weekend (Wed–Sun)', thanks, 'major', 1, 3], ['the holiday season (Dec 23 – Jan 2)', D(11, 23), 'major', 0, 8]];
  const hits = cal.filter(([, at, , b, a]) => t >= at - b * DAY && t <= at + a * DAY);
  const h = hits.find((x) => x[2] === 'major') || hits.find((x) => x[2] === 'holiday');
  return h ? { name: h[0], premium: h[2] === 'major' ? 'major_holiday' : 'holiday' } : null;
}

// Playbook checks with a one-click fix (the hub's quote editor shows them with a button; the website drafts list
// them under Check before quoting). Each tip: { id, text, fix } where fix is a plain object applyTip() understands.
export function playbookTips(plan, inquiry = {}, ctx = {}) {
  const tips = []; const shifts = plan.shifts || []; const g = clientRules(inquiry.business || inquiry.client || '');
  const evIso = String(plan.event_date || inquiry.event_date || inquiry.eventDate || '');
  const ev = evIso.match(/^\d{2}(\d{2})-(\d{2})-(\d{2})$/); const evShort = ev ? `${+ev[2]}/${+ev[3]}/${ev[1]}` : '';
  const vehicles = plan.vehicles || []; const eq = plan.equipment || {};
  const truckish = vehicles.filter((v) => ['uhaul', 'box_truck', 'client_truck'].includes(v.kind));
  const ladders = (eq.ladders_list || []).some((l) => Number(l.count) > 0);
  const venueCalls = shifts.filter((x) => x.kind !== 'design' && !x.optional);
  const mins = (t) => toMinutes(t);
  const gap = (a, b) => { const x = mins(a), y = mins(b); if (x == null || y == null) return null; let d = y - x; if (d < 0) d += 1440; return d; };
  shifts.forEach((sh, i) => {
    const name = `"${sh.label || 'Crew call'}"${sh.date ? ` (${sh.date})` : ''}`;
    const pr = sh.premium_reasons || []; const team = Math.round(Number(sh.team_size) || 0);
    const steps = sh.steps || []; const si = steps.findIndex((x) => /begin|start/i.test(x.label || '') && mins(x.time) != null);
    // 1. Holidays from the call's date
    const hol = !g && sh.kind !== 'design' ? holidayOf(sh.date || evShort) : null;
    if (hol && !pr.includes(hol.premium) && !(hol.premium === 'holiday' && pr.includes('major_holiday')))
      tips.push({ id: `hol:${sh.id}`, text: `${name} falls on ${hol.name}: ${hol.premium === 'major_holiday' ? 'time and a half' : '+$10/hr holiday premium'}, and line up the team early (holiday staffing is hard).`, fix: { type: 'premium', shift: i, reason: hol.premium } });
    // 6. Night strikes + anything with ladders get at least 2
    const startM = si >= 0 ? mins(steps[si].time) : mins(sh.depart_hq);
    const night = sh.kind === 'strike' || (startM != null && (startM >= 18 * 60 || startM < 5 * 60));
    if (team === 1 && sh.kind !== 'design' && (night || ladders)) tips.push({ id: `solo:${sh.id}`, text: `${name} is a solo call ${night ? 'at night' : 'with ladders'}: the playbook says at least 2.`, fix: { type: 'team', shift: i, size: 2 } });
    // 3a. 1 hr minimum out of HQ (depart → work starts) and back (last stop → HQ)
    if (si > 0) { const out = gap(sh.depart_hq, steps[si].time); if (out != null && out < 60) tips.push({ id: `out:${sh.id}`, text: `${name} leaves HQ only ${out} min before work starts: the minimum is 1 hr.`, fix: { type: 'depart', shift: i, minutes: 60 - out } }); }
    if (steps.length >= 3 && /\bhq\b/i.test(steps[steps.length - 1].label || '')) {
      const leg = gap(steps[steps.length - 2].time, steps[steps.length - 1].time);
      if (leg != null && leg < 60) tips.push({ id: `back:${sh.id}`, text: `${name}'s last leg back to HQ is ${leg} min: the minimum is 1 hr.`, fix: { type: 'back', shift: i, minutes: 60 - leg } });
    }
    // 4. Unload is its own step when things come back
    if (['strike', 'delivery', 'return'].includes(sh.kind) && steps.length >= 2 && !steps.some((x) => /unload/i.test(x.label || ''))) {
      const big = truckish.some((v) => /26/.test(`${v.label} ${v.description || ''}`)); const m = big ? 90 : truckish.length ? 45 : 15;
      tips.push({ id: `unload:${sh.id}`, text: `${name} has no unload step: ~${m} min for ${big ? 'a full 26 ft truck' : truckish.length ? 'a U-Haul / box truck' : 'a van'}.`, fix: { type: 'unload', shift: i, minutes: m } });
    }
    // 7. Destination: 12+ hrs on site and 2+ hrs drive home → hotel + meals
    if (steps.length >= 4 && !(Number(plan.travel?.hotel_nights) > 0)) {
      const onsite = gap(steps[1].time, steps[steps.length - 2].time); const home = gap(steps[steps.length - 2].time, steps[steps.length - 1].time);
      if (onsite != null && home != null && onsite >= 12 * 60 && home >= 120) tips.push({ id: `hotel:${sh.id}`, text: `${name} is ${Math.round(onsite / 6) / 10} hrs on site with a ${Math.round(home / 6) / 10} hr drive home: destination rules say hotel at cost + $50/person/day meals.`, fix: { type: 'hotel', rooms: team, nights: 1, meals: team } });
    }
  });
  // 2. Short notice: inquiry less than 7 days before the event
  const asked = ctx.inquiredOn ? new Date(ctx.inquiredOn) : null; const evD = ev ? new Date(`${evIso}T12:00:00`) : null;
  if (asked && evD && !isNaN(asked) && !g) { const days = Math.floor((evD - asked) / 864e5);
    if (days >= 0 && days < 7 && venueCalls.some((x) => !(x.premium_reasons || []).includes('short_notice'))) tips.push({ id: 'short', text: `Inquiry came in ${days} day${days === 1 ? '' : 's'} before the event: short notice is +$10/hr on the crew calls.`, fix: { type: 'premium_all', reason: 'short_notice' } }); }
  // 8. Strike kits: one per crew call
  const kits = Number(eq.strike_kits) || 0; if (venueCalls.length && kits < Math.min(4, venueCalls.length)) tips.push({ id: 'kits', text: `${venueCalls.length} crew call${venueCalls.length > 1 ? 's' : ''} but ${kits} strike kit${kits === 1 ? '' : 's'} planned: one per call (we own 4).`, fix: { type: 'kits', value: Math.min(4, venueCalls.length) } });
  // 9. Fabrication: ballast, big builds ride in a 15 ft U-Haul with a team of 3
  (plan.fabrication || []).forEach((f, i) => {
    const txt = `${f.label || ''} ${f.description || ''} ${(f.components || []).map((c) => c.item).join(' ')} ${f.materials_breakdown || ''}`;
    if (!/sand ?bag|ballast/i.test(txt)) tips.push({ id: `ballast:${f.id || i}`, text: `"${f.label || 'Build'}": every freestanding build gets 8 sand bags for ballast.`, fix: { type: 'ballast', fab: i } });
  });
  const wide = (plan.fabrication || []).some((f) => { const m = `${f.label || ''} ${f.description || ''}`.match(/(\d+(?:\.\d+)?)\s*(?:ft|'|feet)?\s*(?:w(?:ide)?\b|×|x)\s*\d/i); return m && Number(m[1]) > 6; }) || (plan.fabrication || []).length >= 3;
  if (wide && !truckish.length) tips.push({ id: 'fabtruck', text: 'A wall-size build (over ~6 ft wide) or several big pieces: 15 ft U-Haul for the install + strike day and a team of 3.', fix: { type: 'fabtruck' } });
  return tips;
}
// Applies one tip's fix to a plan (mutates it). Returns false when it can't.
export function applyTip(plan, fix) {
  const sh = fix.shift != null ? (plan.shifts || [])[fix.shift] : null;
  const shiftSteps = (x, from, d) => { (x.steps || []).forEach((st, k) => { if (k >= from) { const m = toMinutes(st.time); if (m != null) st.time = fmtMin(m + d); } }); };
  switch (fix.type) {
    case 'premium': if (!sh) return false; sh.premium_reasons = [...new Set([...(sh.premium_reasons || []).filter((r) => !(fix.reason === 'major_holiday' && r === 'holiday')), fix.reason])]; return true;
    case 'premium_all': (plan.shifts || []).filter((x) => x.kind !== 'design').forEach((x) => { x.premium_reasons = [...new Set([...(x.premium_reasons || []), fix.reason])]; }); return true;
    case 'team': if (!sh) return false; sh.team_size = fix.size; return true;
    case 'depart': if (!sh) return false; { const st = sh.steps || []; const si = st.findIndex((x) => /begin|start/i.test(x.label || '')); st.forEach((x, k) => { if (k < si) { const m = toMinutes(x.time); if (m != null) x.time = fmtMin(m - fix.minutes); } }); sh.depart_hq = st[0]?.time || fmtMin(toMinutes(sh.depart_hq) - fix.minutes); } return true;
    case 'back': if (!sh) return false; { const st = sh.steps || []; shiftSteps(sh, st.length - 1, fix.minutes); sh.back_hq = st[st.length - 1]?.time || sh.back_hq; } return true;
    case 'unload': if (!sh) return false; { const st = sh.steps || []; const lt = st[st.length - 1].time; st.push({ time: lt, label: `Unload + organize (${fix.minutes} min)` }, { time: fmtMin(toMinutes(lt) + fix.minutes), label: 'Done' }); sh.back_hq = st[st.length - 1].time; } return true;
    case 'hotel': plan.travel = { ...(plan.travel || {}), hotel_rooms: fix.rooms, hotel_nights: fix.nights, meal_person_days: fix.meals }; return true;
    case 'kits': plan.equipment = { ...(plan.equipment || {}), strike_kits: fix.value }; return true;
    case 'ballast': { const f = (plan.fabrication || [])[fix.fab]; if (!f) return false; if (Array.isArray(f.components)) f.components.push({ item: 'Sand bags, ballast (8)', qty: 8, unit_cost: 0 }); else f.materials_breakdown = `${f.materials_breakdown ? `${f.materials_breakdown}; ` : ''}8 sand bags (ballast)`; f.description = `${f.description ? `${f.description} ` : ''}Ballast: 8 sand bags.`.trim(); } return true;
    case 'fabtruck': plan.vehicles = [...(plan.vehicles || []), { id: `v${Math.random().toString(36).slice(2, 7)}`, kind: 'uhaul', label: '15 ft U-Haul', rental_days: 2, trips: 1, round_trip_miles: (plan.vehicles || [])[0]?.round_trip_miles || 0 }];
      (plan.shifts || []).filter((x) => ['install', 'strike'].includes(x.kind) && Number(x.team_size) < 3).forEach((x) => { x.team_size = 3; }); return true;
    default: return false;
  }
}

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
export function priceUhaul({ days, miles, quotedCost, method }, U = RATES.uhaul) {
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
  if (method === 'A' || method === 'B') { // picked by hand on this event
    chosen = method === 'A' ? a : b;
    why = `Method ${method} picked by hand for this event${chosen.amount < floor ? ` (under the ${U.profitFloor}× profit floor of ${fmt(floor)})` : ''}.`;
  } else if (chosen) {
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
  // "uhaul.billPerDay"-style keys override one rate inside a group (uhaul, fab, production, minimums, cost).
  const ovN = {};
  for (const [k, v] of Object.entries(ov)) { const [g2, sub] = k.split('.'); if (sub) ovN[g2] = { ...(ovN[g2] || {}), [sub]: v }; else ovN[k] = v; }
  const base = ctx.rates || {};
  const R = mergeRates({ ...base, ...ovN, ...Object.fromEntries(['uhaul', 'fab', 'production', 'minimums', 'cost'].filter((g2) => ovN[g2]).map((g2) => [g2, { ...(base[g2] || {}), ...ovN[g2] }])) });
  // plan.client_rule: pick a client's pricing by hand ('standard' = none), else matched from the business name.
  const g = plan.client_rule === 'standard' ? null : plan.client_rule ? GRANDFATHERED.find((x) => x.name === plan.client_rule) || null : clientRules(inquiry.business);
  const production = !!inquiry.production || plan.job_type === 'full_production';
  const lines = [];
  const warnings = [];
  const uhauls = [];
  const costs = [];
  let personHrs = 0;
  const optionals = []; // optional add-ons "for consideration": priced, shown on the proposal, NOT in the total
  const add = (section, label, math, amount, extra = {}) =>
    (extra.optional ? optionals : lines).push({ section, label, math, amount: round2(amount), ...extra });

  // Labor: each shift is portal to portal
  for (const [si, s] of (plan.shifts || []).entries()) {
    let hrs = shiftHours(s.depart_hq, s.back_hq);
    if (hrs == null) {
      hrs = num(s.hours);
      warnings.push(`Couldn't read the times for "${s.label}"; used ${hrs} hrs.`);
    }
    if (Math.round(num(s.team_size)) === 1) warnings.push(`"${s.label}" is a solo shift: only OK with a very strong team member, a very easy job, daytime and an easy drive.`);
    if (hrs > 16) warnings.push(`"${s.label}" is ${hrs} hrs portal to portal. Check team safety / hotel.`);
    const hw = strikeWindow(s);
    if (hw?.tight && !hw.truck) warnings.push(`"${s.label}" has ${hw.minutes} min from strike start to the ${s.hard_out} hard out: add 30-60 min after the hard out to finish the strike at the truck (stems out of vessels, pack + strap).`);
    else if (hw?.tight) warnings.push(`"${s.label}": ${s.truck_applied || 45} min added after the ${s.hard_out} hard out to finish the strike at the truck (1-hour hard out rule). Change it on the call if the load is lighter or heavier.`);
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
    const sOpt = !!s.optional; // optional crew call: priced "for consideration", not in the total, cost or hours
    if (!sOpt) costs.push({ what: `${s.label}: ${team} × (${hrs} + ${R.cost.homeDriveHrs} home drive) hrs × ${fmt(payRate)}`, amount: team * (hrs + R.cost.homeDriveHrs) * payRate, kind: 'labor', shift: si, team, hrs, payRate, holiday: major && grand == null });
    if (!sOpt) personHrs += team * hrs;
    add('Labor', [s.label, s.date].filter(Boolean).join(' | '),
      `Team of ${team} × ${hrs} hrs × ${fmt(rate)}/hr (${s.depart_hq} → ${s.back_hq} portal to portal)${triggers.length && grand == null ? `; premium: ${triggers.join(' + ').replace(/_/g, ' ')}` : ''}`,
      team * hrs * rate, { optional: sOpt, date: s.date || '', hours: hrs, team, rate, roles: s.roles || '', ref: s.id, phase: s.phase || phaseOfKind(kind),
        recipe: [{ k: 'Team', v: `${team} people` }, { k: 'Hours, portal to portal', v: `${s.depart_hq} → ${s.back_hq} = ${hrs} hrs` },
          { k: 'Rate', v: `${fmt(rate)}/hr${num(s.rate_override) > 0 ? ' (typed on this call)' : grand != null ? ` (${g.name} deal)` : triggers.length ? ` (${fmt(R.laborPerHour)} + premium: ${triggers.join(', ').replace(/_/g, ' ')})` : ov.laborPerHour != null ? ' (this quote’s rate)' : ' (standard)'}` },
          { k: 'Price', v: `${team} × ${hrs} × ${fmt(rate)} = ${fmt(team * hrs * rate)}` },
          { k: 'Our cost', v: `${team} × (${hrs} + ${R.cost.homeDriveHrs} home drive) hrs × ${fmt(payRate)} = ${fmt(team * (hrs + R.cost.homeDriveHrs) * payRate)}`, cost: true }],
        steps: (s.steps || []).filter((st) => st && (st.time || st.label)).map((st) => ({ time: st.time, label: st.label })), ...(s.proposal_text ? { text: s.proposal_text } : {}), attached: [] });
  }
  for (const d of plan.studio_days || []) {
    const p = Math.max(0, Math.round(num(d.people)));
    if (!d.optional) costs.push({ what: `${d.label || 'Studio day'}: ${p} × ${R.cost.studioDayHrs} hrs × ${fmt(R.cost.teamPay)}`, amount: p * R.cost.studioDayHrs * R.cost.teamPay });
    add('Labor', [d.label || 'Studio day', d.date].filter(Boolean).join(' | '),
      `${p} × ${fmt(R.studioDayPerPerson)} flat per person`, p * R.studioDayPerPerson, { optional: !!d.optional, date: d.date || '', ref: d.id, phase: d.phase || 'studio',
      recipe: [{ k: 'People', v: p }, { k: 'Flat per person per day', v: fmt(R.studioDayPerPerson), rate: 'studioDayPerPerson' }, { k: 'Our cost', v: `${p} × ${R.cost.studioDayHrs} hrs × ${fmt(R.cost.teamPay)}`, cost: true }], display: `${plural(p, 'person')} × ${fmt(R.studioDayPerPerson)} studio day` });
  }

  // Vehicles
  let truckGroup = null; // the first U-Haul's one-line group (the job's tolls fold into it)
  for (const v of plan.vehicles || []) {
    const count = v.kind === 'van' && v.js_van === 'both' ? Math.max(2, Math.round(num(v.count, 2))) : Math.max(1, Math.round(num(v.count, 1)));
    const trips = Math.max(1, Math.round(num(v.trips, 1)));
    const rt = Math.max(0, Math.round(num(v.round_trip_miles)));
    const label = v.label || v.kind;
    const vOpt = !!v.optional; const vcost = (c) => { if (!vOpt) costs.push(c); }; // optional vehicle: priced, not in the total
    if (v.kind === 'van') {
      const miles = rt * trips * count;
      vcost({ what: `${label}: OUR fuel cost, ${miles} mi × $0.70 (client is billed $1/mi above)`, amount: miles * R.cost.fuelPerMile });
      add('Vehicles', label, `${plural(count, 'van')} × ${rt} mi round trip × ${plural(trips, 'trip')} × ${fmt(R.vanPerMile)}/mi`, miles * R.vanPerMile, { optional: vOpt, ref: v.id, key: `${v.id}:van`, phase: 'transport',
        recipe: [{ k: 'Vans', v: count }, { k: 'Miles per round trip', v: `${rt} mi` }, { k: 'Round trips', v: trips }, { k: 'Fuel charge', v: `${fmt(R.vanPerMile)}/mi per van, no minimum`, rate: 'vanPerMile' },
          { k: 'Price', v: `${count} × ${rt} × ${trips} × ${fmt(R.vanPerMile)} = ${fmt(miles * R.vanPerMile)}` }, { k: 'Our fuel cost', v: `${miles} mi × ${fmt(R.cost.fuelPerMile)}`, cost: true }],
        display: [v.description || `JS vehicle use${trips > 1 ? ` (${plural(trips, 'trip')})` : ''}${count > 1 ? `, ${plural(count, 'van')}` : ''}`, `Approx ${miles} miles round trip`, '', `${fmt(R.vanPerMile).replace('.00', '')}/mile`].join('\n') });
    } else if (v.kind === 'uhaul') {
      const miles = num(v.uhaul_miles) > 0 ? num(v.uhaul_miles) : rt * trips;
      for (let i = 0; i < count; i++) {
        const UR = { ...R.uhaul, ...Object.fromEntries(Object.entries(v.uhaul_rates || {}).filter(([, x]) => x !== '' && x != null && Number.isFinite(Number(x))).map(([k, x]) => [k, Number(x)])) };
        const u = priceUhaul({ days: v.rental_days, miles, quotedCost: v.uhaul_quoted_cost, method: v.uhaul_method }, UR);
        uhauls.push({ label, ...u });
        vcost({ what: `${label}: U-Haul (our cost) + fuel`, amount: u.ourCost * (num(v.uhaul_quoted_cost) > 0 ? 1 : 1 + R.uhaul.taxesFeesPct) + u.miles * R.cost.fuelPerMile });
        const vk = count > 1 ? `${v.id}#${i + 1}` : v.id;
        // One line per truck on the proposal (rental + fuel + management, + tolls); v.itemize prints the parts separately.
        const grp = (partName) => (v.itemize ? {} : { group: vk, groupLabel: count > 1 ? `${label} #${i + 1}` : label, partName });
        if (!v.itemize && !vOpt && !truckGroup) truckGroup = vk;
        add('Vehicles', `${label}: rental + mileage`, `${u.chosen.math} (Method ${u.chosen.method}; our cost ${fmt(u.ourCost)})`, u.chosen.amount, { optional: vOpt, ref: v.id, key: `${vk}:rental`, phase: 'transport', ...grp('Rental + mileage'), display: v.description || (v.itemize ? `${plural(u.days, 'day')} rental + ${u.miles} mi` : `${plural(u.days, 'day')} rental, ${u.miles} mi, fuel + truck management${num(plan.travel?.tolls) > 0 && truckGroup === vk ? ' + tolls' : ''}`),
          recipe: [{ k: 'Rental days', v: `${u.days} (${UR.minDays}-day minimum: pick up the day before, return the day after)` }, { k: 'Miles', v: `${u.miles} mi${num(v.uhaul_miles) > 0 ? ' (typed)' : ` (${rt} mi × ${plural(trips, 'trip')})`}` },
            { k: 'Our U-Haul cost', v: u.costMath, cost: true },
            { k: 'Method A · Trellis rate', v: `${u.a.math} = ${fmt(u.a.amount)}`, rate: 'uhaul.billPerDay' },
            { k: 'Method B · markup on cost', v: `${u.b.math} = ${fmt(u.b.amount)}`, cost: true },
            { k: 'Profit floor', v: `${UR.profitFloor}× our cost = ${fmt(u.floor)}`, cost: true },
            { k: 'Used', v: `Method ${u.chosen.method}: ${fmt(u.chosen.amount)}. ${u.why}` }] });
        const fpm = num(v.fuel_per_mile) > 0 ? num(v.fuel_per_mile) : R.boxTruckFuelPerMile; const fmin = v.fuel_min !== undefined && v.fuel_min !== '' && Number.isFinite(Number(v.fuel_min)) ? Number(v.fuel_min) : R.boxTruckFuelPerRoundTrip;
        const uf = Math.max(fmin, u.miles / trips * fpm);
        add('Vehicles', `${label}: fuel`, `${plural(trips, 'round trip')} × ${uf > fmin ? `${Math.round(u.miles / trips)} mi × ${fmt(fpm)}` : `${fmt(fmin)} (min)`}`, trips * uf, { optional: vOpt, ref: v.id, key: `${vk}:fuel`, phase: 'transport', ...grp('Fuel'),
          recipe: [{ k: 'Round trips', v: trips }, { k: 'Miles per round trip', v: `${Math.round(u.miles / trips)} mi` }, { k: 'Fuel charge', v: `${fmt(fpm)}/mi${num(v.fuel_per_mile) > 0 ? ' (this truck)' : ''}`, rate: 'boxTruckFuelPerMile' },
            { k: 'Minimum per round trip', v: `${fmt(fmin)}${fmin !== R.boxTruckFuelPerRoundTrip ? ' (this truck)' : ''}`, rate: 'boxTruckFuelPerRoundTrip' }, { k: 'Price', v: `${trips} × greater of ${fmt(fmin)} or ${Math.round(u.miles / trips)} × ${fmt(fpm)} = ${fmt(trips * uf)}` },
            { k: 'Our fuel cost', v: `${u.miles} mi × ${fmt(R.cost.fuelPerMile)}`, cost: true }] });
        const mpm = num(v.mgmt_per_mile) > 0 ? num(v.mgmt_per_mile) : R.managementPerMile;
        add('Vehicles', `${label}: U-Haul management`, `${u.miles} mi × ${fmt(mpm)}/mi`, u.miles * mpm, { optional: vOpt, ref: v.id, key: `${vk}:mgmt`, phase: 'transport', ...grp('Truck management'),
          recipe: [{ k: 'Miles', v: `${u.miles} mi` }, { k: 'Management (pick up, return, our driver’s responsibility)', v: `${fmt(mpm)}/mi${num(v.mgmt_per_mile) > 0 ? ' (this truck)' : ''}`, rate: 'managementPerMile' }, { k: 'Price', v: `${u.miles} × ${fmt(mpm)} = ${fmt(u.miles * mpm)}` }] });
      }
    } else if (v.kind === 'client_truck') {
      const per = Math.max(R.managementMinClientTruck, rt * R.managementPerMile);
      // driver is already paid on the crew call; no extra vehicle cost
      add('Vehicles', `${label}: truck management (driving client's truck)`,
        `${plural(trips, 'round trip')} × greater of ${fmt(R.managementMinClientTruck)} or ${rt} mi × ${fmt(R.managementPerMile)}`, per * trips * count, { optional: vOpt, ref: v.id, key: `${v.id}:mgmt`, phase: 'transport',
        recipe: [{ k: 'Round trips', v: trips }, { k: 'Miles per round trip', v: `${rt} mi` }, { k: 'Management', v: `${fmt(R.managementPerMile)}/mi`, rate: 'managementPerMile' }, { k: 'Minimum per round trip', v: fmt(R.managementMinClientTruck), rate: 'managementMinClientTruck' },
          { k: 'Price', v: `${trips} × greater of ${fmt(R.managementMinClientTruck)} or ${rt} × ${fmt(R.managementPerMile)} = ${fmt(per * trips * count)}` }] });
    } else if (v.kind === 'box_truck') {
      vcost({ what: `${label}: OUR fuel cost (× $0.70/mi)`, amount: rt * trips * count * R.cost.fuelPerMile });
      const bf = Math.max(R.boxTruckFuelPerRoundTrip, rt * R.boxTruckFuelPerMile);
      add('Vehicles', `${label}: fuel`, `${plural(trips * count, 'round trip')} × ${bf > R.boxTruckFuelPerRoundTrip ? `${rt} mi × ${fmt(R.boxTruckFuelPerMile)}` : `${fmt(R.boxTruckFuelPerRoundTrip)} (min)`}`, trips * count * bf, { optional: vOpt, ref: v.id, key: `${v.id}:fuel`, phase: 'transport',
        recipe: [{ k: 'Round trips', v: trips * count }, { k: 'Miles per round trip', v: `${rt} mi` }, { k: 'Fuel charge', v: `${fmt(R.boxTruckFuelPerMile)}/mi`, rate: 'boxTruckFuelPerMile' }, { k: 'Minimum per round trip', v: fmt(R.boxTruckFuelPerRoundTrip), rate: 'boxTruckFuelPerRoundTrip' },
          { k: 'Price', v: `${trips * count} × greater of ${fmt(R.boxTruckFuelPerRoundTrip)} or ${rt} × ${fmt(R.boxTruckFuelPerMile)} = ${fmt(trips * count * bf)}` }] });
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
    if (!f.optional) costs.push({ what: `${f.label || 'Fabrication'}: materials + ${hrs} shop hrs × ${fmt(R.cost.shopPay)}`, amount: mat + hrs * R.cost.shopPay });
    const fq = Math.max(1, Math.round(num(f.qty, 1)));
    add('Fabrication', f.label || 'Custom fabrication',
      `materials ${fmt(mat)} × ${R.fab.materialsMarkup} + ${hrs} shop hrs × ${fmt(R.fab.shopRate)} (estimate; Larry to confirm)`, amount,
      { ref: f.id, optional: !!f.optional, phase: f.phase || 'fabrication', qty: fq, display: fq > 1 ? `${fq} × ${fmt(amount / fq)}` : (f.description || 'Design, materials + shop build'),
        recipe: [{ k: 'Materials (our cost)', v: `${fmt(mat)}${f.materials_breakdown ? `: ${f.materials_breakdown}` : ''}`, cost: true }, { k: 'Materials markup', v: `× ${R.fab.materialsMarkup} = ${fmt(mat * R.fab.materialsMarkup)}`, rate: 'fab.materialsMarkup' },
          { k: 'Shop labor', v: `${hrs} hrs × ${fmt(R.fab.shopRate)} = ${fmt(hrs * R.fab.shopRate)}`, rate: 'fab.shopRate' }, { k: 'Price', v: fmt(amount) }, { k: 'Our cost', v: `${fmt(mat)} + ${hrs} × ${fmt(R.cost.shopPay)} = ${fmt(mat + hrs * R.cost.shopPay)}`, cost: true }] });
  }
  if (fabs.length && !ctx.manual) warnings.push('Custom fabrication is a Claude estimate: Alyssa to check with Larry before quoting.');

  // Equipment
  const eq = plan.equipment || {};
  // Ladders + rigging kit either print as their own lines, or roll into one crew call's price (equipment.attach_to = that
  // call's id), the way we show them on an INSTALL line: "(4) Podium ladders - 200 / Rigging Tool Kit - 100".
  const host = eq.attach_to && !eq.optional ? lines.find((l) => l.section === 'Labor' && l.ref === eq.attach_to) : null;
  const eqItems = [...ladderLines(eq).map((l) => ({ label: l.label, math: `${l.count} × ${fmt(l.price)}`, amount: l.count * l.price, text: `(${l.count}) ${l.label} - ${fmt(l.count * l.price).replace('.00', '')}` })),
    ...(eq.rigging_kit ? [{ label: 'Rigging tool kit', math: 'flat', amount: R.riggingKit, text: `Rigging Tool Kit - ${fmt(R.riggingKit).replace('.00', '')}` }] : [])];
  for (const e of eqItems) {
    if (host) { host.amount = round2(host.amount + e.amount); host.attached.push(e.text); host.math += ` + ${e.label} ${fmt(e.amount)}`; }
    else add('Equipment', e.label, e.math, e.amount, { optional: !!eq.optional, phase: 'equipment', recipe: [{ k: 'Math', v: `${e.math} = ${fmt(e.amount)}` }] });
  }
  for (const r of plan.additional_rentals || []) {
    if (num(r.amount) > 0 && !r.js_owned && !r.optional) costs.push({ what: `${r.label || 'Rental'} (pass-through)`, amount: num(r.amount) });
    if (num(r.amount) > 0 && production && !r.js_owned) {
      const up = R.production.rentalUpcharge;
      add('Equipment', r.label || 'Additional rental', `our cost ${fmt(num(r.amount))} + ${Math.round(up * 100)}% handling${r.note ? `: ${r.note}` : ''}`, num(r.amount) * (1 + up), { optional: !!r.optional, phase: 'other', display: r.note || 'Outside rental, coordinated by Jersey Strike' });
    } else if (num(r.amount) > 0) add('Equipment', r.label || 'Additional rental', r.note ? `pass-through: ${r.note}` : 'pass-through', num(r.amount), { optional: !!r.optional, phase: 'other' });
  }

  // Sourced items (chandeliers, greenery, disco balls, decor we buy for the job): our cost × 2 = 50% margin.
  for (const it of plan.sourced_items || []) {
    const c = Math.max(0, num(it.cost));
    if (!c) continue;
    const m = R.production.sourcedMultiplier;
    if (!it.optional) costs.push({ what: `${it.label || 'Sourced item'} (our cost)`, amount: c });
    const sq = Math.max(1, Math.round(num(it.qty, 1)));
    add('Sourcing', it.label || 'Sourced items', `our cost ${fmt(c)} × ${m}${it.note ? `: ${it.note}` : ''}`, c * m,
      { ref: it.id, optional: !!it.optional, phase: it.phase || 'sourcing', qty: sq, display: sq > 1 ? `${sq} × ${fmt((c * m) / sq)}${it.note ? ` · ${it.note}` : ''}` : (it.note || 'Sourced + prepped by Jersey Strike'),
        recipe: [{ k: 'Our cost', v: fmt(c), cost: true }, { k: 'Markup', v: `× ${m}`, rate: 'production.sourcedMultiplier' }, { k: 'Price', v: `${fmt(c)} × ${m} = ${fmt(c * m)}` }] });
  }
  // Quote items with their own recipe (Trellis-style, built in the hub's quote editor): qty × price each, where the price
  // is the recipe's retail (each component's own markup) unless someone typed a price. Description prints on the proposal.
  for (const it of plan.items || []) {
    const q = Math.max(0, num(it.qty, 1));
    const each = it.price !== undefined && it.price !== null && it.price !== '' ? num(it.price) : num(it.retail);
    if (!(q * each)) continue;
    if (num(it.cost) > 0 && !it.optional) costs.push({ what: `${it.name || 'Item'}: recipe cost (materials + labor)`, amount: q * num(it.cost) });
    add('Items', it.name || 'Item', `${q} × ${fmt(each)}${num(it.cost) > 0 ? ` (recipe cost ${fmt(num(it.cost))} each, MU ${(each / num(it.cost)).toFixed(2)})` : ''}`, q * each,
      { ref: it.id, optional: !!it.optional, phase: it.phase || 'sourcing', qty: q, display: it.description || '', photos: it.photos || [] });
  }
  // Custom line items (Trellis-style: anything else on the job, e.g. a delivery fee or floral disposal): qty × unit price.
  for (const ci of plan.custom_items || []) {
    const q = num(ci.qty, 1), up = num(ci.unit_price);
    if (!(q * up)) continue;
    if (num(ci.unit_cost) > 0 && !ci.optional) costs.push({ what: `${ci.label || 'Line item'} (our cost)`, amount: q * num(ci.unit_cost) });
    add('Other', ci.label || 'Line item', `${q} × ${fmt(up)}`, q * up, { ref: ci.id, optional: !!ci.optional, phase: ci.phase || 'other', qty: q, display: ci.note || `${q} × ${fmt(up)}` });
  }
  if (!ctx.manual && (plan.sourced_items || []).some((it) => num(it.cost) > 0)) warnings.push('Sourced item costs are Claude estimates: confirm real prices before quoting.');

  // Travel
  const t = plan.travel || {};
  if (num(t.tolls) > 0) costs.push({ what: 'Tolls', amount: num(t.tolls) });
  if (num(t.tolls) > 0) add('Travel', 'Tolls (estimate)', t.tolls_note || 'pass-through', num(t.tolls), { phase: 'travel', ...(truckGroup ? { group: truckGroup, partName: 'Tolls' } : {}) });
  if (num(t.hotel_nights) > 0 && num(t.hotel_rooms) > 0) {
    const rate = num(t.hotel_rate_estimate, 180);
    costs.push({ what: 'Hotel', amount: num(t.hotel_rooms) * num(t.hotel_nights) * rate });
    add('Travel', 'Hotel (estimate, pass-through)', `${plural(num(t.hotel_rooms), 'room')} × ${plural(num(t.hotel_nights), 'night')} × ${fmt(rate)}`,
      num(t.hotel_rooms) * num(t.hotel_nights) * rate, { phase: 'travel' });
  }
  if (num(t.meal_person_days) > 0) costs.push({ what: 'Meals', amount: num(t.meal_person_days) * R.mealPerPersonDay });
  if (num(t.meal_person_days) > 0) add('Travel', 'Meal allowance', `${num(t.meal_person_days)} person-days × ${fmt(R.mealPerPersonDay)}`, num(t.meal_person_days) * R.mealPerPersonDay, { phase: 'travel', recipe: [{ k: 'Person-days', v: num(t.meal_person_days) }, { k: 'Per person per day', v: fmt(R.mealPerPersonDay), rate: 'mealPerPersonDay' }] });

  // Every line: a key (for a price set by hand on this event) and a recipe (the math, row by row) for the quote editor.
  const lo = plan.line_overrides || {};
  for (const l of [...lines, ...optionals]) {
    l.key = l.key || (l.ref ? `${l.ref}` : `${l.section}:${l.label}`);
    if (!l.recipe) l.recipe = [{ k: 'Math', v: `${l.math} = ${fmt(l.amount)}` }];
    const o = lo[l.key];
    if (o !== undefined && o !== null && o !== '' && Number.isFinite(Number(o))) {
      l.calc = l.amount; l.amount = round2(Number(o)); l.overridden = true;
      l.recipe = [...l.recipe, { k: 'Set by hand for this event', v: `${fmt(l.amount)} (the math says ${fmt(l.calc)})` }];
      l.math = `${l.math} → set by hand: ${fmt(l.amount)}`;
      if (l.section === 'Labor' && l.team && l.hours) l.rate = round2(l.amount / (l.team * l.hours));
    }
  }

  // U-Haul parts → one line per truck (its recipe keeps every part; a price set by hand on the whole truck wins).
  const mergeParts = (arr) => {
    const byG = new Map(); const out = [];
    for (const l of arr) {
      if (!l.group) { out.push(l); continue; }
      let m = byG.get(l.group);
      if (!m) { m = { ...l, key: `${l.group}:truck`, label: l.groupLabel || l.label, parts: [], recipe: [], amount: 0, overridden: false }; delete m.calc; byG.set(l.group, m); out.push(m); }
      if (!m.ref && l.ref) m.ref = l.ref;
      m.parts.push(l); m.amount = round2(m.amount + l.amount); m.overridden = m.overridden || !!l.overridden;
      m.recipe.push({ k: `▸ ${l.partName || l.label}`, v: fmt(l.amount), part: true }, ...(l.recipe || []).filter((r) => !/^Price$/.test(r.k)).map((r) => ({ ...r, k: `   ${r.k}` })));
    }
    for (const m of byG.values()) {
      m.math = m.parts.map((x) => `${x.partName || x.label} ${fmt(x.amount)}`).join(' + ');
      m.recipe.push({ k: 'Price (one line on the proposal)', v: `${m.math} = ${fmt(m.amount)}` });
      const o = lo[m.key];
      if (o !== undefined && o !== null && o !== '' && Number.isFinite(Number(o))) {
        m.calc = m.amount; m.amount = round2(Number(o)); m.overridden = true;
        m.recipe.push({ k: 'Set by hand for this event', v: `${fmt(m.amount)} (the math says ${fmt(m.calc)})` }); m.math = `${m.math} → set by hand: ${fmt(m.amount)}`;
      }
    }
    arr.splice(0, arr.length, ...out);
  };
  mergeParts(lines); mergeParts(optionals);

  // Trellis-style order: sourcing → studio → delivery → install → strike → fabrication → vehicles → equipment → other.
  if (ctx.groupByPhase) {
    // Sections in order (set up / install before strike), and inside a section by date (multi-day installs: day 1, day 2…).
    const order = Object.fromEntries(PHASES.map(([k], i) => [k, i]));
    const dkey = (l) => { const m = String(l.label || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); return m ? Number(`${m[3].length === 2 ? `20${m[3]}` : m[3]}${m[1].padStart(2, '0')}${m[2].padStart(2, '0')}`) : 0; };
    const keyed = lines.map((l, i) => [order[l.phase] ?? 99, dkey(l), i, l]).sort((a, b) => a[0] - b[0] || (!plan.manual_order && a[1] && b[1] ? a[1] - b[1] : 0) || a[2] - b[2]); // manual_order: the order set in the quote editor
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
    const venueCalls = (plan.shifts || []).filter((x) => x.kind !== 'design' && x.venue_day !== false && !x.optional).length;
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

  // One block per optional piece (a U-Haul's rental + fuel + management stay together), priced the way it would be added:
  // an optional crew call at a venue carries its base fee (2027+ per-call rule), and every block carries the admin fee.
  const optBlocks = Object.values(optionals.reduce((m, l) => { const k = l.ref || l.key || l.label;
    const o = m[k] || (m[k] = { title: l.section === 'Vehicles' ? String(l.label).split(':')[0] : l.label, lines: [], admin: 0, total: 0, note: '*Noted for consideration; not included in this proposal’s total investment.' });
    o.lines.push(l); o.total = round2(o.total + l.amount); return m; }, {}));
  for (const o of optBlocks) {
    const sh = (plan.shifts || []).find((x) => x.optional && o.lines.some((l) => l.section === 'Labor' && l.ref === x.id));
    if (sh && baseFee?.per === 'call' && sh.kind !== 'design' && sh.venue_day !== false && baseFee.amount) {
      o.lines.push({ section: 'Charges', label: 'Base Service', math: `1 crew call × ${fmt(baseFee.amount)}`, display: `1 crew call × ${fmt(baseFee.amount)}`, amount: baseFee.amount, key: `${o.lines[0].key}:base` });
      o.total = round2(o.total + baseFee.amount);
    }
    o.admin = round2(o.total * adminPct); o.total = round2(o.total + o.admin);
  }
  // How the proposal groups its lines (plan.present, picked in the quote editor):
  //   ''            items first, then a LABOR heading (the standard Jersey Strike layout)
  //   'build_labor' Design + build (materials, fabrication, sourcing) | Labor + logistics (day-of crew, vehicles, gear, travel)
  //   'type'        Design + build, then one heading per kind of work (Delivery, Install, Strike, Vehicles…)
  //   'day'         Design + build, then one heading per date (with the day's name, e.g. "Load-in"), then Logistics
  const LAB = new Set(['Labor', 'Vehicles', 'Equipment', 'Travel']);
  let groups = null;
  if (plan.present) {
    const build = lines.filter((l) => !LAB.has(l.section)); const rest = lines.filter((l) => LAB.has(l.section));
    groups = [];
    if (build.length) groups.push({ title: 'Design + build', lines: build });
    if (plan.present === 'type') {
      for (const [k, lab] of PHASES) { const ls = rest.filter((l) => l.phase === k); if (ls.length) groups.push({ title: lab, lines: ls }); }
      const left = rest.filter((l) => !PHASES.some(([k]) => k === l.phase)); if (left.length) groups.push({ title: 'Other', lines: left });
    } else if (plan.present === 'day') {
      const ev = String(plan.event_date || inquiry.event_date || inquiry.eventDate || '').match(/^\d{2}(\d{2})-(\d{2})-(\d{2})$/);
      const evShort = ev ? `${+ev[2]}/${+ev[3]}/${ev[1]}` : '';
      const pd = (d) => { const m = String(d || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); return m ? new Date(Number(m[3].length === 2 ? `20${m[3]}` : m[3]), Number(m[1]) - 1, Number(m[2])) : null; };
      const byDay = new Map(); const logi = [];
      for (const l of rest) { const d = l.section === 'Labor' ? (l.date || evShort) : ''; if (d) { if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(l); } else logi.push(l); }
      const names = plan.day_names || {};
      [...byDay.entries()].sort((a, b) => (pd(a[0])?.getTime() || 9e15) - (pd(b[0])?.getTime() || 9e15)).forEach(([d, ls]) => {
        const x = pd(d); groups.push({ title: [x ? x.toLocaleDateString('en-US', { weekday: 'long', month: 'numeric', day: 'numeric', year: '2-digit' }).replace(',', '') : d, names[d]].filter(Boolean).join(' · '), lines: ls });
      });
      if (logi.length) groups.push({ title: 'Logistics', lines: logi });
    } else groups.push({ title: 'Labor + logistics', lines: rest });
    groups = groups.filter((g) => g.lines.length).map((g) => ({ ...g, total: round2(g.lines.reduce((a, l) => a + l.amount, 0)) }));
  }
  const tips = playbookTips(plan, inquiry, ctx);
  for (const t of tips) if (!warnings.includes(t.text)) warnings.push(t.text);
  return {
    tips,
    groups,
    optionalLines: optionals,
    optional: optBlocks,
    lines, charges, baseFee, itemsSubtotal, subtotal, minimum, adminPct, feeLabel, production, admin, discount, total, uhauls, fabs, margin, warnings, gear: inv.pull, reach: plan.reach_note || null, localEvents: events,
    grandfathered: g ? g.note : '',
  };
}
