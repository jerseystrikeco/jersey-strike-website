import { priceQuote } from '../netlify/functions/lib/pricing.mjs';
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const shift = [{ label: 'Install', kind: 'install', team_size: 3, depart_hq: '8am', back_hq: '4pm' }];
// 1. Skyscraper in MINIvan only
let p = priceQuote({ shifts: shift, vehicles: [{ kind: 'van', js_van: 'MINIvan', label: 'Van', round_trip_miles: 40 }], equipment: { ladders_list: [{ type: 'skyscraper', count: 1 }, { type: 'podium', count: 2 }], hand_trucks: 2 } }, { scope: 'deliver florals' });
ok(p.warnings.some((w) => /won't fit in MINIvan/.test(w)), 'Skyscraper flagged in MINIvan');
ok(p.lines.some((l) => /Skyscraper/.test(l.label) && l.amount === 150) && p.lines.some((l) => /Podium/.test(l.label) && l.amount === 100), 'ladders priced by type');
// 2. 5 podiums + 3 vans
p = priceQuote({ shifts: shift, vehicles: [{ kind: 'van', count: 3, label: 'Vans', round_trip_miles: 40 }], equipment: { ladders_list: [{ type: 'podium', count: 5 }], hand_trucks: 5 } }, {});
ok(p.warnings.some((w) => /we only own 2/.test(w)), '3 vans flagged');
ok(p.warnings.some((w) => /5 × Podium.*have 4/.test(w)), 'podium shortage flagged');
ok(p.warnings.some((w) => /Hand trucks.*have 4/.test(w)), 'hand truck shortage flagged');
// 3. Ceiling install, no height
p = priceQuote({ shifts: shift, vehicles: [{ kind: 'van', js_van: 'VANessa', label: 'Van' }], equipment: { ladders_list: [{ type: 'podium', count: 2 }] } }, { scope: 'Ceiling install of greenery in tent' });
ok(p.warnings[0].startsWith('CEILING / POLE HEIGHT UNKNOWN'), 'ceiling height required');
// 4. Tent pole 18 ft, podiums only reach 14
p = priceQuote({ shifts: shift, reach_note: { height_ft: 18, working_height_ft: 18, height_source: 'client' }, vehicles: [{ kind: 'van', js_van: 'VANessa', label: 'Van' }], equipment: { ladders_list: [{ type: 'podium', count: 2 }] } }, { scope: 'tent pole wraps' });
ok(p.warnings.some((w) => /only reaches 14 ft/.test(w)), 'reach shortfall flagged');
// 5. Same-day events
p = priceQuote({ shifts: shift, vehicles: [{ kind: 'van', js_van: 'both', label: 'Vans' }] }, {}, { otherEvents: ['2026-11-07 Venue X'] });
ok(p.warnings.some((w) => /BOTH vans/.test(w)), 'same-day both-vans conflict flagged');
// 6. Clean job: no inventory warnings
p = priceQuote({ shifts: [{ ...shift[0], team_size: 2 }], vehicles: [{ kind: 'van', js_van: 'VANessa', label: 'Van' }], equipment: { ladders_list: [{ type: 'std_6', count: 1 }], strike_kits: 1 } }, { scope: 'centerpiece strike' });
ok(!p.warnings.some((w) => /van|ladder|have|HEIGHT/i.test(w)), 'clean job has no gear warnings');
console.log(p.gear);
// 7. Crew of 4 in VANessa only -> seats short; crew of 4 in MINIvan -> cargo check
p = priceQuote({ shifts: [{ ...shift[0], team_size: 4 }], vehicles: [{ kind: 'van', js_van: 'VANessa', label: 'Van' }] }, {});
ok(p.warnings.some((w) => /only 2 seats/.test(w)), 'VANessa seats 2 flagged for crew of 4');
p = priceQuote({ shifts: [{ ...shift[0], team_size: 4 }], vehicles: [{ kind: 'van', js_van: 'MINIvan', label: 'Van' }] }, {});
ok(p.warnings.some((w) => /only 2 seats/.test(w)), 'loaded MINIvan seats 2');
p = priceQuote({ shifts: [{ ...shift[0], team_size: 6 }], vehicles: [{ kind: 'van', js_van: 'VANessa', label: 'Load' }, { kind: 'van', js_van: 'MINIvan', crew_only: true, label: 'Crew' }] }, {});
ok(!p.warnings.some((w) => /seats/.test(w)), 'VANessa 2 + crew-only MINIvan 4 = 6 seats');
p = priceQuote({ shifts: [{ ...shift[0], team_size: 4 }], vehicles: [{ kind: 'van', js_van: 'both', label: 'Vans' }] }, {});
ok(!p.warnings.some((w) => /seats/.test(w)), 'both vans loaded = 4 seats');
// 8. Skyscraper + 4 crew in both vans: rack, no fit warning
p = priceQuote({ shifts: [{ ...shift[0], team_size: 4 }], vehicles: [{ kind: 'van', js_van: 'both', label: 'Vans' }], equipment: { ladders_list: [{ type: 'skyscraper', count: 1 }, { type: 'aframe_12', count: 1 }] } }, {});
ok(!p.warnings.some((w) => /won't fit|tight fit|seats/.test(w)) && p.gear.some((g) => /roof rack/.test(g)), 'long ladders ride on VANessa roof rack');
process.exit(fail ? 1 : 0);
