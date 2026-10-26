// Drive times and mileage for the quote.
// Vans/cars: Google Maps Routes API (GOOGLE_MAPS_API_KEY).
// Box trucks: HERE truck routing (HERE_API_KEY, optional), which avoids parkways, low bridges, etc.
// If a key is missing, Claude estimates the drive and the draft flags it.

export const HQS = [
  { name: 'Forked River', address: '1404 Circle Dr, Forked River, NJ 08731', region: 'South Jersey' },
  { name: 'Montclair', address: 'Montclair, NJ', region: 'North Jersey + NY' },
];

const M_PER_MI = 1609.344;
export const DRIVE_BUFFER_MIN = Number(process.env.DRIVE_BUFFER_MIN || 15);

async function googleLeg(origin, destination) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.travelAdvisory.tollInfo',
    },
    body: JSON.stringify({
      origin: { address: origin },
      destination: { address: destination },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      extraComputations: ['TOLLS'],
      units: 'IMPERIAL',
    }),
  });
  if (!r.ok) throw new Error(`Google Routes ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const route = (await r.json()).routes?.[0];
  if (!route) throw new Error(`No route from "${origin}" to "${destination}"`);
  const toll = route.travelAdvisory?.tollInfo?.estimatedPrice?.[0];
  return {
    // Google leaves out distance/duration when the two stops are the same place.
    miles: Math.round((route.distanceMeters || 0) / M_PER_MI),
    minutes: Math.round((parseInt(route.duration, 10) || 0) / 60),
    tolls: toll ? Number(toll.units || 0) + Number(toll.nanos || 0) / 1e9 : route.travelAdvisory?.tollInfo ? null : 0,
  };
}

async function hereGeocode(q) {
  const u = `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(q)}&in=countryCode:USA&limit=1&apiKey=${process.env.HERE_API_KEY}`;
  const r = await fetch(u);
  if (!r.ok) throw new Error(`HERE geocode ${r.status}`);
  const p = (await r.json()).items?.[0]?.position;
  if (!p) throw new Error(`HERE couldn't find "${q}"`);
  return `${p.lat},${p.lng}`;
}

// 26ft box truck profile: ~26,000 lb GVW, 13'6" tall.
async function hereTruckLeg(origin, destination) {
  const [o, d] = await Promise.all([hereGeocode(origin), hereGeocode(destination)]);
  const u = `https://router.hereapi.com/v8/routes?transportMode=truck&origin=${o}&destination=${d}&return=summary` +
    `&vehicle[grossWeight]=11800&vehicle[height]=411&apiKey=${process.env.HERE_API_KEY}`;
  const r = await fetch(u);
  if (!r.ok) throw new Error(`HERE truck route ${r.status}`);
  const s = (await r.json()).routes?.[0]?.sections || [];
  if (!s.length) throw new Error('HERE returned no truck route');
  const sec = s.reduce((a, x) => ({ duration: a.duration + x.summary.duration, length: a.length + x.summary.length }), { duration: 0, length: 0 });
  return { miles: Math.round(sec.length / M_PER_MI), minutes: Math.round(sec.duration / 60) };
}

// Route: HQ -> studio (if given) -> venue -> HQ. Tries both HQs and keeps the shorter.
export async function planRoutes(inquiry, { truck = false } = {}) {
  const notes = [];
  if (!process.env.GOOGLE_MAPS_API_KEY) return { available: false, notes: ['GOOGLE_MAPS_API_KEY not set: drive times estimated by Claude.'] };
  if (!inquiry.venue) return { available: false, notes: ['No venue given: drive times not calculated.'] };
  // Install: HQ -> studio -> venue -> HQ. Strike only: HQ -> venue -> studio (drop-off) -> HQ.
  const services = (inquiry.services || []).join(' ');
  const strikeOnly = /strike/i.test(services) && !/install|set ?up|delivery|flip|design/i.test(services);
  const same = (a, b) => String(a).toLowerCase().replace(/[^a-z0-9]/g, '') === String(b).toLowerCase().replace(/[^a-z0-9]/g, '');
  const stops = (hq) => {
    const mid = inquiry.studio ? (strikeOnly ? [inquiry.venue, inquiry.studio] : [inquiry.studio, inquiry.venue]) : [inquiry.venue];
    // Drop repeated stops (e.g. the client's studio is our HQ address).
    return [hq.address, ...mid, hq.address].filter((x, i, a) => i === 0 || !same(x, a[i - 1]));
  };

  const options = await Promise.all(HQS.map(async (hq) => {
    try {
      const s = stops(hq);
      const legs = await Promise.all(s.slice(0, -1).map(async (from, i) => ({ from, to: s[i + 1], ...(await googleLeg(from, s[i + 1])) })));
      return { hq, legs, miles: legs.reduce((a, l) => a + l.miles, 0), minutes: legs.reduce((a, l) => a + l.minutes, 0) };
    } catch (e) {
      notes.push(`${hq.name}: ${e.message}`);
      return null;
    }
  }));
  const ok = options.filter(Boolean).sort((a, b) => a.minutes - b.minutes);
  if (!ok.length) return { available: false, notes };
  const best = ok[0];
  // Timeline drive times. Leaving HQ: rounded up to the quarter hour (the 15-30 min early
  // arrival is the cushion there). Every later leg (venue -> studio, back to HQ, often late at
  // night with a loaded van) gets +15 min, rounded up (44 min -> 1 hr).
  // New York legs (NYC, Westchester, Long Island) always get a bigger cushion: +30 min instead of +15.
  const isNY = (a) => /,\s*(NY|New York)\b|\bNYC\b|Manhattan|Brooklyn|Queens|Bronx|Staten Island/i.test(String(a || ''));
  const plan = (m, first, ny) => (m > 0 ? Math.ceil((m + (first ? (ny ? 15 : 0) : (ny ? 30 : DRIVE_BUFFER_MIN))) / 15) * 15 : 0);
  best.legs.forEach((leg, i) => { leg.ny = isNY(leg.from) || isNY(leg.to); leg.plan_minutes = plan(leg.minutes, i === 0, leg.ny); });
  notes.push(`Used ${best.hq.name} HQ (${best.minutes} min total loop${ok[1] ? ` vs ${ok[1].minutes} min from ${ok[1].hq.name}` : ''}).`);

  if (truck) {
    if (process.env.HERE_API_KEY) {
      for (const leg of best.legs) {
        try {
          const t = await hereTruckLeg(leg.from, leg.to);
          leg.truckMiles = t.miles;
          leg.truckMinutes = t.minutes;
          leg.plan_minutes = plan(t.minutes, leg === best.legs[0], leg.ny);
        } catch (e) {
          notes.push(`Truck route ${leg.from} → ${leg.to}: ${e.message}`);
        }
      }
    } else {
      notes.push('HERE_API_KEY not set: box truck legs use the car route. Check for parkway / low-clearance restrictions and pad drive times.');
    }
  }
  const tolls = best.legs.reduce((a, l) => a + (l.tolls || 0), 0);
  return { available: true, hq: best.hq, legs: best.legs, miles: best.miles, minutes: best.minutes, tolls: Math.round(tolls * 100) / 100, notes };
}
