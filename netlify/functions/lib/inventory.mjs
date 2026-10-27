// Jersey Strike's own vehicles, ladders and gear. Claude plans what each job pulls
// (plan.vehicles[].js_van, plan.equipment); checkInventory() flags anything we don't
// have enough of, anything that won't fit in our vans, and same-day conflicts, so the
// rental (U-Haul, extra ladder, cart) gets built into the quote instead of found later.
// To change the inventory, edit it here AND in PRICING-FORMULA.md.

// Interior length, rear doors to dash.
export const VANS = {
  // VANessa: 2 seats only; ladder roof rack (long ladders can ride on top).
  // MINIvan: 2 up front when it's carrying a load (deliveries); 4-6 total when it's only moving crew (nothing to carry). No rack.
  VANessa: { label: 'VANessa (extended cargo van, 2 seats, ladder roof rack)', interiorFt: 12, seats: 2, roofRack: true },
  MINIvan: { label: 'MINIvan (2 seats up front when carrying a load; 4-6 people when it only transports crew)', interiorFt: 10, seats: 2, seatsCrewOnly: 6, roofRack: false },
};
// Seats in rentals / client trucks (driver included).
const RENTAL_SEATS = { uhaul: 3, box_truck: 3, client_truck: 3 };
const ROOF_RACK_LADDERS = 4; // VANessa's rack has carried about 4 at a time (Alyssa, 10/27)

// lengthFt = most compact length for transport = the low end of the ladder's size range (Alyssa, 10/27).
export const LADDERS = {
  skyscraper: { label: 'Skyscraper 12-24 ft extension ladder', have: 1, reachFt: 24, lengthFt: 12, price: 150 },
  podium: { label: 'Podium ladder (12-14 ft reach)', have: 4, reachFt: 14, lengthFt: 12, price: 50 },
  aframe_12: { label: '12 ft A-frame (15 ft reach)', have: 1, reachFt: 15, lengthFt: 12, price: 50 },
  lg_8_12: { label: 'Little Giant 8-12 ft (15 ft reach)', have: 1, reachFt: 15, lengthFt: 8, price: 50 },
  lg_5_10: { label: 'Little Giant 5-10 ft (13-14 ft reach)', have: 1, reachFt: 14, lengthFt: 5, price: 50 },
  lg_4_8: { label: 'Little Giant 4-8 ft (10-12 ft reach)', have: 1, reachFt: 12, lengthFt: 4, price: 50 },
  std_6: { label: '6 ft ladder (8-10 ft reach)', have: 2, reachFt: 10, lengthFt: 6, price: 50 },
  step: { label: 'Step ladder (6-7 ft reach)', have: 2, reachFt: 7, lengthFt: 6, price: 50 },
};

export const GEAR = {
  hand_trucks: { label: 'Hand trucks / carts', have: 4 },
  folding_wagons: { label: 'Folding wagons', have: 3 },
  xl_lawn_cart: { label: 'XL lawn cart', have: 1 },
  furniture_dollies: { label: 'Furniture dollies', have: 3 },
  kitchen_cart: { label: 'Kitchen push cart', have: 1 },
  gorilla_cart: { label: 'Small Gorilla push cart (lives in North Jersey)', have: 1 },
  strike_kits: { label: 'Standard strike kits (snips, trash bags, first aid, ratchet straps, paper towels, moving blankets)', have: 4 },
  rigging_kit: { label: 'Rigging essentials kit (cable, carabiners)', have: 1 },
  winch: { label: 'Electric winch', have: 1 },
};

// Text for Claude's system prompt.
export function inventoryText() {
  return [
    'VEHICLES WE OWN (2): ' + Object.entries(VANS).map(([k, v]) => `${k} = ${v.label}, ${v.interiorFt} ft interior rear doors to dash`).join('; ') + `. Anything beyond these two vans needs a rental (U-Haul cargo van or box truck). Crew ride together from HQ: VANessa seats 2; MINIvan seats 2 up front when it carries a load (deliveries), or 4-6 people when it only transports crew and carries nothing (set crew_only); U-Haul/box truck cab ~3. VANessa's ladder roof rack carries long ladders (~${ROOF_RACK_LADDERS}), freeing the floor for the load.`,
    'LADDERS (key: label, how many, reach, most compact length for transport): ' + Object.entries(LADDERS).map(([k, l]) => `${k}: ${l.label} x${l.have}, reach ${l.reachFt} ft, ~${l.lengthFt} ft compact`).join('; ') + '.',
    'CARTS + KITS (key: label x how many): ' + Object.entries(GEAR).map(([k, g]) => `${k}: ${g.label} x${g.have}`).join('; ') + '.',
  ].join('\n');
}

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

// Ladder lines for pricing. Uses equipment.ladders_list when given, else the old ladders / skyscraper_ladders counts.
export function ladderLines(eq = {}) {
  if (Array.isArray(eq.ladders_list) && eq.ladders_list.some((l) => num(l.count) > 0)) {
    const byType = new Map();
    for (const l of eq.ladders_list) if (num(l.count) > 0) byType.set(l.type, (byType.get(l.type) || 0) + Math.round(num(l.count)));
    return [...byType].map(([type, count]) => ({ type, count, label: LADDERS[type]?.label || type, price: LADDERS[type]?.price ?? 50 }));
  }
  const out = [];
  if (num(eq.skyscraper_ladders) > 0) out.push({ type: 'skyscraper', count: num(eq.skyscraper_ladders), label: LADDERS.skyscraper.label, price: 150 });
  if (num(eq.ladders) > 0) out.push({ type: 'ladder', count: num(eq.ladders), label: 'Ladders', price: 50 });
  return out;
}

// Which of our vans the plan uses. A van line without js_van fills VANessa first (MINIvan first when
// the crew is 3+, since VANessa seats 2), then the other.
function vansUsed(plan) {
  const [a, b] = ['VANessa', 'MINIvan'];
  const used = [];
  const unnamed = [];
  for (const v of plan.vehicles || []) {
    if (v.kind !== 'van') continue;
    const n = Math.max(1, Math.round(num(v.count, 1)));
    if (v.js_van === 'both') { used.push('VANessa', 'MINIvan'); continue; }
    for (let i = 0; i < n; i++) (v.js_van && i === 0 ? used : unnamed).push(v.js_van || null);
  }
  for (const _ of unnamed) used.push(!used.includes(a) ? a : !used.includes(b) ? b : 'extra van');
  return used;
}

// Ceiling / tent pole / overhead work: the draft must say how high, where that number
// came from, and which ladder reaches it.
const OVERHEAD = /ceiling|tent pole|tent-pole|pole drap|overhead|hung|hang(ing)? (install|décor|decor|florals?)|suspend|chandelier|canopy|rigg|cloud install|floral cloud|drap(e|ing) (the )?(ceiling|tent)/i;
export function overheadJob(plan, inquiry = {}) {
  const text = [inquiry.scope, plan.summary, ...(plan.zones || []).map((z) => `${z.name} ${z.tasks || ''}`)].join(' ');
  return OVERHEAD.test(text);
}
export function checkReach(plan, inquiry = {}) {
  const warnings = [];
  if (!overheadJob(plan, inquiry)) return warnings;
  const r = plan.reach_note;
  const h = num(r?.height_ft);
  if (!r || !h) {
    warnings.push('CEILING / POLE HEIGHT UNKNOWN: this is a ceiling, tent pole or overhead install. Get the height (floor to ceiling or tent pole/attachment point) before quoting; it decides the ladders, the vehicle and whether we need a lift.');
    return warnings;
  }
  const work = num(r.working_height_ft) || h;
  const best = Math.max(0, ...ladderLines(plan.equipment).map((l) => LADDERS[l.type]?.reachFt || 0));
  if (r.height_source === 'assumed') warnings.push(`Ceiling/pole height ${h} ft is ASSUMED, not from the client or venue: confirm it before quoting.`);
  if (!best) warnings.push(`Overhead work at ~${work} ft but no ladders are planned.`);
  else if (best < work) warnings.push(`Working height ~${work} ft, but the tallest ladder planned only reaches ${best} ft. Add a taller ladder${work > 24 ? ' or a lift rental (over our 24 ft Skyscraper)' : ''}.`);
  if (work > 24) warnings.push(`~${work} ft is beyond anything we own (Skyscraper reaches 24 ft): plan a lift rental and price it in.`);
  else if (work > 20) warnings.push(`~${work} ft is extreme access (over 20 ft): Skyscraper only, premium labor, and rigging-trained crew.`);
  return warnings;
}

// Returns { warnings: [...], pull: [...] } . pull = the gear list for the email.
export function checkInventory(plan, { otherEvents = [], hqName = '' } = {}) {
  const warnings = [];
  const pull = [];
  const eq = plan.equipment || {};
  const rentals = (plan.additional_rentals || []).map((r) => `${r.label} ${r.note || ''}`.toLowerCase()).join(' | ');
  const vehicles = plan.vehicles || [];
  const truck = vehicles.find((v) => ['uhaul', 'box_truck', 'client_truck'].includes(v.kind));
  const vans = vansUsed(plan);

  // Vans
  if (vans.length) pull.push(`Vans: ${vans.join(' + ')}`);
  if (truck) pull.push(`Truck: ${vehicles.filter((v) => ['uhaul', 'box_truck', 'client_truck'].includes(v.kind)).map((v) => v.label).join(', ')}`);
  const counts = vans.reduce((m, v) => ((m[v] = (m[v] || 0) + 1), m), {});
  if (vans.length > 2 || counts['extra van'] || counts.VANessa > 1 || counts.MINIvan > 1) {
    warnings.push(`Plan uses ${vans.length} vans, but we only own 2 (VANessa + MINIvan). Add a rental (U-Haul cargo van or box truck) and build it into the quote.`);
  }

  // Ladders: stock + fit
  const ladders = ladderLines(eq);
  for (const l of ladders) {
    pull.push(`${l.count} × ${l.label}`);
    const inv = LADDERS[l.type];
    if (inv && l.count > inv.have) {
      warnings.push(`Needs ${l.count} × ${inv.label}, we have ${inv.have}. ${/ladder|lift/.test(rentals) ? 'A ladder/lift rental is listed: check it covers the gap.' : 'Rent/borrow the rest (add it under additional rentals) or swap in another ladder.'}`);
    }
  }
  const sized = ladders.filter((l) => LADDERS[l.type]);
  const longest = sized.reduce((m, l) => Math.max(m, LADDERS[l.type].lengthFt), 0);
  if (sized.length && !truck) {
    if (!vans.length) warnings.push('Ladders are planned but no vehicle is: add a van or truck to get them there.');
    const maxVan = Math.max(0, ...vans.map((v) => VANS[v]?.interiorFt || 0));
    const rack = vans.includes('VANessa');
    const longCount = sized.filter((l) => LADDERS[l.type].lengthFt >= 10).reduce((a, l) => a + l.count, 0);
    if (rack && longest > maxVan - 0.5) {
      pull.push('Long ladder(s) ride on VANessa\'s roof rack');
      if (longCount > ROOF_RACK_LADDERS + 2) warnings.push(`${longCount} long ladders (10 ft+ compact): ~${ROOF_RACK_LADDERS} on VANessa's roof rack, the rest inside. Check they fit with the load, or add a U-Haul.`);
    } else if (vans.length && longest > maxVan) {
      const l = sized.find((x) => LADDERS[x.type].lengthFt === longest);
      warnings.push(`${LADDERS[l.type].label} is ~${longest} ft compact and won't fit in ${vans.join(' + ')} (${maxVan} ft). Use VANessa (roof rack) or a box truck/U-Haul, and price it in.`);
    } else if (vans.length && longest >= maxVan - 0.5) {
      warnings.push(`Longest ladder (~${longest} ft compact) is a tight fit in a ${maxVan} ft van: confirm it rides with the load, or plan a truck.`);
    }
    if (!rack && longCount >= 3) warnings.push(`${longCount} long ladders (10 ft+ compact) riding in the vans take most of the floor. Check they fit with the client's load, carts and kits, or add a U-Haul.`);
  }

  // Seats: the crew rides together from HQ
  const truckSeats = vehicles.filter((v) => RENTAL_SEATS[v.kind]).reduce((a, v) => a + RENTAL_SEATS[v.kind] * Math.max(1, Math.round(num(v.count, 1))), 0);
  const miniCrewOnly = vehicles.some((v) => v.kind === 'van' && (v.js_van === 'MINIvan' || v.js_van === 'both') && v.crew_only);
  const vanSeats = vans.reduce((a, v) => a + (v === 'MINIvan' && miniCrewOnly ? VANS.MINIvan.seatsCrewOnly : VANS[v]?.seats || 2), 0);
  const seats = vanSeats + truckSeats;
  const crew = Math.max(0, ...(plan.shifts || []).map((s) => Math.round(num(s.team_size))));
  if (miniCrewOnly) pull.push('MINIvan: crew transport only (nothing carried)');
  if (crew && (vans.length || truckSeats) && crew > seats) {
    warnings.push(`Crew of ${crew} but only ${seats} seats in the planned vehicles (VANessa 2; MINIvan 2 when carrying a load, 4-6 only if it carries nothing). The rest need a ride: make MINIvan crew-only if the load fits elsewhere, add a vehicle, or pay mileage for a separate car.`);
  }

  // Carts + kits
  for (const [k, g] of Object.entries(GEAR)) {
    const need = typeof eq[k] === 'boolean' ? (eq[k] ? 1 : 0) : Math.round(num(eq[k]));
    if (!need) continue;
    pull.push(`${need} × ${g.label}`);
    if (need > g.have) warnings.push(`Needs ${need} × ${g.label}, we have ${g.have}. Rent/buy the gap and build it into the quote.`);
  }
  if (num(eq.gorilla_cart) > 0 && /forked/i.test(hqName)) warnings.push('The Gorilla push cart lives in North Jersey: plan who brings it down, or use another cart.');

  // Same-day conflicts (Airtable calendar doesn't track gear, so this is a heads-up)
  if (otherEvents.length && (vans.length || ladders.length)) {
    const usesBoth = counts.VANessa && counts.MINIvan;
    warnings.push(`${otherEvents.length} other event(s) on the calendar that day (${otherEvents.slice(0, 3).join('; ')}). ${usesBoth ? 'This job takes BOTH vans, ' : ''}Confirm ${[...new Set(vans.filter((v) => VANS[v]))].join(' / ') || 'the vans'}${ladders.length ? ', the ladders' : ''} and strike kits aren't already going out on another job; if they are, add a rental.`);
  }
  return { warnings, pull };
}
