// Truck-legal routing for U-Hauls / box trucks (Alyssa, 11/3/26: "truck routes need to be taken into account for
// all roads"). Google's Routes API has no truck mode, so every truck leg asks Google for its alternative routes,
// reads the road names on each step and throws out any route that uses a road trucks can't drive. If every
// alternative breaks a rule, it forces a via point (e.g. the NJ Turnpike instead of the Garden State Parkway north
// of Exit 105); if that still fails, it pads the car time and flags the leg for a manual check.
// Same file in the hub: src/lib/engine/truck-routes.mjs (keep identical).
// Low bridges / clearances aren't in Google's data: HERE truck routing covers those when HERE_API_KEY is set.

const nyEast = (p) => p && p.latitude > 40.49 && p.longitude > -74.03; // NYC east of the Hudson, Long Island, Westchester, CT
const anyPt = (pts, f) => pts.some((p) => p && f(p));

// [road name on the Google step, extra condition on the step's start/end points, why]
export const TRUCK_RULES = [
  [/garden state (pkwy|parkway)/i, (pts) => anyPt(pts, (p) => p.latitude > 40.285), 'Garden State Parkway north of Exit 105 (no trucks over 10,000 lb)'],
  [/palisades (interstate )?(pkwy|parkway)/i, null, 'Palisades Interstate Parkway (no trucks or commercial vehicles)'],
  [/(hutchinson river|saw mill( river)?|bronx river|taconic( state)?|sprain( brook)?|cross county|henry hudson|bear mountain|korean war veterans|belt|grand central|cross island|jackie robinson|interborough|southern state|northern state|meadowbrook( state)?|wantagh( state)?|sagtikos|sunken meadow|bethpage( state)?|ocean|loop|mosholu|pelham) (pkwy|parkway)/i, null, 'New York parkway (no trucks or commercial vehicles)'],
  [/(merritt|wilbur cross) (pkwy|parkway)/i, null, 'Merritt / Wilbur Cross Parkway, CT (no trucks or commercial vehicles)'],
  [/\b(pkwy|parkway)\b/i, (pts) => anyPt(pts, nyEast), 'New York parkway (no trucks or commercial vehicles)'],
  [/\bfdr\b|franklin d\.? roosevelt|harlem river dr/i, null, 'FDR Drive / Harlem River Drive (no trucks)'],
  [/pulaski skyway/i, null, 'Pulaski Skyway (no trucks)'],
  [/kelly dr|martin luther king (jr\.? )?dr|lincoln dr|wissahickon dr/i, (pts) => anyPt(pts, (p) => p.latitude > 39.9 && p.latitude < 40.1 && p.longitude > -75.3 && p.longitude < -75.1), 'Philadelphia Kelly Dr / MLK Dr / Lincoln Dr (no trucks)'],
];

// Via points used when every Google alternative breaks a rule.
const VIAS = [
  [/garden state/i, { latitude: 40.3633, longitude: -74.495 }], // NJ Turnpike near Exit 8A (Jamesburg)
];

export function truckViolations(route) {
  const out = new Set();
  for (const leg of route?.legs || []) {
    for (const st of leg.steps || []) {
      const text = st.navigationInstruction?.instructions || '';
      if (!text) continue;
      const pts = [st.startLocation?.latLng, st.endLocation?.latLng];
      for (const [road, cond, why] of TRUCK_RULES) if (road.test(text) && (!cond || cond(pts))) { out.add(why); break; }
    }
  }
  return [...out];
}

const M_PER_MI = 1609.344;
const MASK = 'routes.duration,routes.distanceMeters,routes.travelAdvisory.tollInfo,routes.legs.steps.navigationInstruction.instructions,routes.legs.steps.startLocation,routes.legs.steps.endLocation';
const shape = (r) => {
  const toll = r.travelAdvisory?.tollInfo?.estimatedPrice?.[0];
  return { miles: Math.round((r.distanceMeters || 0) / M_PER_MI), minutes: Math.round((parseInt(r.duration, 10) || 0) / 60), tolls: toll ? Number(toll.units || 0) + Number(toll.nanos || 0) / 1e9 : 0 };
};

async function ask(key, origin, destination, { via, traffic = true } = {}) {
  const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': MASK },
    body: JSON.stringify({
      origin: { address: origin }, destination: { address: destination }, travelMode: 'DRIVE',
      routingPreference: traffic ? 'TRAFFIC_AWARE' : 'TRAFFIC_UNAWARE', extraComputations: ['TOLLS'], units: 'IMPERIAL',
      ...(via ? { intermediates: [{ via: true, location: { latLng: via } }] } : { computeAlternativeRoutes: true }),
    }),
  });
  if (!r.ok) throw Object.assign(new Error(`Google Maps ${r.status}: ${(await r.text()).slice(0, 160)}`), { status: 502 });
  return (await r.json()).routes || [];
}

// { miles, minutes, tolls, legal, avoided: [rules the car route breaks that this route avoids], violations: [...], note }
export async function googleTruckLeg(key, origin, destination, opts = {}) {
  const routes = await ask(key, origin, destination, opts);
  if (!routes.length) throw new Error(`No route from "${origin}" to "${destination}"`);
  const carBreaks = truckViolations(routes[0]);
  const legal = routes.find((r) => !truckViolations(r).length);
  if (legal) return { ...shape(legal), legal: true, avoided: carBreaks, violations: [], note: carBreaks.length ? `Truck route avoids: ${carBreaks.join('; ')}.` : '' };
  for (const [hit, via] of VIAS) {
    if (!carBreaks.some((w) => hit.test(w))) continue;
    const forced = (await ask(key, origin, destination, { ...opts, via }).catch(() => []))[0];
    if (forced && !truckViolations(forced).length) return { ...shape(forced), legal: true, avoided: carBreaks, violations: [], note: `Truck route forced off ${carBreaks.join('; ')} (via the NJ Turnpike).` };
  }
  const s = shape(routes[0]);
  return { ...s, minutes: Math.round(s.minutes * 1.15), legal: false, avoided: [], violations: carBreaks,
    note: `No truck-legal route found automatically: Google's route uses ${carBreaks.join('; ')}. Car time +15% used; route the truck by hand.` };
}
