// Local test for Phase 2 quote drafting. Run: npm run test:quote
// Uses fake Google / Claude / Resend / Airtable endpoints (nothing real is called)
// and a sample Claude plan for the Wile Jamie x Greg weekend, then checks the
// pricing reproduces what Wile was actually charged and writes a preview of the
// admin email to test/quote-preview.html.
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { priceQuote, shiftHours, priceUhaul } from '../netlify/functions/lib/pricing.mjs';
import { triggerSecret } from '../netlify/functions/lib/trigger.mjs';

execSync('node scripts/build-knowledge.mjs', { cwd: new URL('../', import.meta.url) });
const { default: handler, draftQuote } = await import('../netlify/functions/draft-quote-background.mjs');

let ok = true;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) ok = false; };
const plan = JSON.parse(readFileSync(new URL('./wile-plan.json', import.meta.url), 'utf8'));

// ---- Pricing math
check(shiftHours('8:30pm', '1:30am') === 5 && shiftHours('6:15am', '7:30pm') === 13.25, 'portal-to-portal hours, incl. past midnight');
const wile = priceQuote(plan, { business: 'Wile Events' });
check(wile.adminPct === 0.05 && wile.lines[0].rate === 50, 'Wile grandfathered: $50/hr install, 5% admin');
check(wile.lines.find((l) => /Strike/.test(l.label)).rate === 65, 'Wile strike stays $65/hr');
const u = wile.uhauls[0];
check(u.a.amount === 1003 && u.b.amount === 1981.5 && u.chosen.method === 'A', 'U-Haul: Method A $1,003 beats Method B $1,981.50');
check(wile.subtotal === 9578 && wile.total === 10056.9, `Wile total $${wile.total} (charged $10,092.39; difference is the $33.80 manual U-Haul override)`);
const std = priceQuote(plan, { business: 'New Florist Co' });
check(std.adminPct === 0.08 && std.lines[0].rate === 65, 'standard client: $65/hr, 8% admin');
const strike = priceQuote({ job_type: 'strike_only', base_fee_days: 1, shifts: [{ label: 'Strike', kind: 'strike', team_size: 2, depart_hq: '9pm', back_hq: '1am' }] }, {});
check(strike.total === 885.6 && strike.warnings.some((w) => /Under the \$1,500.00 strike minimum by \$614.40/.test(w)), 'under the strike minimum: flagged, not bumped');
const bat = priceQuote({ job_type: 'strike_only', base_fee_days: 1, shifts: [{ label: 'Strike', kind: 'strike', team_size: 3, depart_hq: '9:45pm', back_hq: '2:00am' }], vehicles: [{ kind: 'van', label: 'JS van', round_trip_miles: 35 }] }, {});
check(bat.itemsSubtotal === 863.75 && bat.total === 1256.85 && bat.warnings.some((w) => /strike minimum/.test(w)), 'Battello-size strike for a standard client: $1,256.85 + minimum flag');
const aptp = priceQuote({ job_type: 'strike_only', base_fee_days: 1, shifts: [{ label: 'Strike', kind: 'strike', team_size: 3, depart_hq: '9:45pm', back_hq: '2:00am' }], vehicles: [{ kind: 'van', label: 'JS van', round_trip_miles: 35 }] }, { business: 'A Petal To Peddle' });
check(aptp.total === 1256.85 && !aptp.warnings.some((w) => /minimum/.test(w)), 'A Petal to Peddle grandfathered: no minimum flag');
const lily = priceQuote({ job_type: 'strike_only', base_fee_days: 1, shifts: [{ label: 'Strike', kind: 'strike', team_size: 3, depart_hq: '9:30pm', back_hq: '3:45am' }], vehicles: [{ kind: 'van', label: 'Van', round_trip_miles: 70 }] }, { business: 'A Lily Among Thorns' });
check(lily.subtotal === 1588.75 && lily.admin === 127.1 && lily.discount.amount === -428.96 && lily.total === 1286.89, `A Lily Among Thorns: 8% admin then 25% family discount = $${lily.total}`);
check(priceUhaul({ days: 1, miles: 50 }).days === 2, 'U-Haul minimum 2 days');
const ct = priceQuote({ vehicles: [{ kind: 'client_truck', label: 'Client truck', round_trip_miles: 120, trips: 2 }] }, {});
check(ct.lines[0].amount === 400, 'client truck management: $200 minimum per round trip');

const prem = priceQuote({ shifts: [
  { label: 'NYC holiday strike', kind: 'strike', team_size: 2, depart_hq: '9pm', back_hq: '2am', premium_reasons: ['holiday', 'nyc_difficult'] },
  { label: 'NYC strike', kind: 'strike', team_size: 2, depart_hq: '9pm', back_hq: '2am', premium_reasons: ['nyc_difficult'] },
  { label: 'Solo day delivery', kind: 'delivery', team_size: 1, depart_hq: '9am', back_hq: '1pm', premium_reasons: ['holiday', 'nyc_difficult', 'short_notice'] }] }, {});
check(prem.lines[0].rate === 85 && prem.lines[1].rate === 75 && prem.lines[2].rate === 85, 'premium labor: +$10 per trigger, capped at $85');
check(prem.warnings.some((w) => /solo shift/.test(w)), 'solo shifts are flagged');
const xmas = priceQuote({ shifts: [{ label: 'Day after Christmas', kind: 'install', team_size: 2, depart_hq: '8am', back_hq: '4pm', premium_reasons: ['major_holiday'] },
  { label: 'NYE NYC', kind: 'strike', team_size: 2, depart_hq: '9pm', back_hq: '3am', premium_reasons: ['major_holiday', 'nyc_difficult'] }] }, {});
check(xmas.lines[0].rate === 97.5 && xmas.lines[1].rate === 112.5, 'major holiday = time and a half ($97.50; $112.50 with an NYC premium)');
const wprem = priceQuote({ shifts: [{ label: 'Wile install', kind: 'install', team_size: 3, depart_hq: '6am', back_hq: '6pm', premium_reasons: ['holiday'] }] }, { business: 'Wile Events' });
check(wprem.lines[0].rate === 50 && wprem.warnings.some((w) => /grandfathered rates; no premium/.test(w)), 'Wile grandfathered rate is not bumped by premiums (flagged instead)');

const fab = priceQuote({ fabrication: [{ label: 'Custom 8x8 metal chuppah', materials_cost: 900, shop_hours: 14, confidence: 'medium', flags: ['Weight of florals unknown'], questions_for_larry: ['Powder coat or paint?'] }] }, {});
check(fab.lines[0].amount === 2710 && fab.fabs.length === 1 && fab.warnings.some((w) => /Larry/.test(w)), 'fabrication: materials x2 + shop hrs x $65, flagged for Larry');
const { quoteSubject } = await import('../netlify/functions/lib/quote-render.mjs');
check(quoteSubject({ business: 'X', eventDate: '2027-06-12' }, fab).startsWith('[Alyssa: check fab with Larry] Draft quote $2,926.80'), 'fab jobs flag the email subject');

check(wile.margin.cost > 4500 && wile.margin.cost < 6000 && wile.margin.pct > 40 && wile.margin.pct < 55, `Wile weekend margin ≈ ${wile.margin.pct}% (cost ${wile.margin.cost})`);
check(/Wile Events exception|worth it/.test(wile.margin.verdict) && !wile.warnings.some((w) => /Gross margin/.test(w)), 'Wile is judged on gross-profit dollars, not %: ' + wile.margin.verdict);
check(bat.margin.pct > 50, `Battello-size strike margin ${bat.margin.pct}%`);

// ---- Full pipeline with fake endpoints
const calls = [];
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  const body = opts.body ? JSON.parse(opts.body) : null;
  calls.push({ url, body, method: opts.method });
  if (url.includes('routes.googleapis.com')) return Response.json({ routes: [{ distanceMeters: 90000, duration: '5400s' }] });
  if (url.includes('api.anthropic.com')) return Response.json({ model: 'test', stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'submit_quote_plan', input: plan }] });
  if (url.includes('example.com/files')) return new Response(Buffer.from('%PDF-1.4 test'), { headers: { 'content-type': 'application/pdf' } });
  return Response.json({ id: 'ok' });
};
Object.assign(process.env, {
  ANTHROPIC_API_KEY: 'test', GOOGLE_MAPS_API_KEY: 'test', RESEND_API_KEY: 'test', AIRTABLE_TOKEN: 'test',
  AIRTABLE_BASE_ID: 'appTEST', INQUIRY_TO: 'inquire@jerseystrike.com',
});
const inquiry = {
  business: 'Wile Events', contact: 'Caroline Fragale', email: 'caroline@example.com', phone: '970-846-7401',
  eventDate: '2026-10-24', venue: 'The Reeds at Shelter Haven, 9601 Third Ave, Stone Harbor, NJ 08247',
  studio: '82 Birch Ave, Little Silver, NJ 07739', services: ['Install + strike crew', 'Studio processing'],
  teamSize: '4', teamNeeds: ['Designers', 'Box truck driving'], vehicles: ['26ft Box Truck', '1 Van'],
  scope: 'Welcome party Fri 10/23 at Stone Harbor Golf Club + wedding Sat 10/24 at The Reeds. Processing, install, flip, strike.',
  files: [{ url: 'https://example.com/files/flower-order.pdf', filename: 'Flower Order - Jamie x Greg.pdf' }],
};

const bad = await handler(new Request('https://x/', { method: 'POST', headers: { 'x-quote-secret': 'nope' }, body: JSON.stringify({ inquiry }) }));
check(bad.status === 403 && calls.length === 0, 'background function rejects requests without the secret');

const res = await handler(new Request('https://x/', { method: 'POST', headers: { 'x-quote-secret': triggerSecret() }, body: JSON.stringify({ inquiry, recordId: 'recABC' }) }));
check(res.status === 200, 'handler runs end to end');
const claude = calls.find((c) => c.url.includes('anthropic'));
check(claude && claude.body.messages[0].content[0].type === 'document', 'uploaded PDF is sent to Claude');
check(claude.body.system[0].text.includes('PRICING FORMULA') && claude.body.system[0].text.includes('Jamie x Greg'), 'Claude gets the pricing formula and past jobs');
check(calls.filter((c) => c.url.includes('routes.googleapis.com')).length === 6, 'drive times checked from both HQs');
const mail = calls.find((c) => c.url.includes('resend'));
check(mail && mail.body.to[0] === 'inquire@jerseystrike.com' && !mail.body.reply_to, 'review email goes to admins, no client reply-to');
check(mail.body.subject.startsWith('Re: New Inquiry:') && /inquiry-/.test(mail.body.headers['In-Reply-To']) && mail.body.text.startsWith('Draft quote $10,056.90'), 'draft threads under the inquiry email: ' + mail.body.subject);
check(/Method A/.test(mail.body.html) && /Red flags/i.test(mail.body.html) && /preliminary estimate/.test(mail.body.html), 'email has math, red flags and the scope-change footer');
const at = calls.find((c) => c.url.includes('airtable') && c.method === 'PATCH');
check(at && at.url.endsWith('/tblvthafdL2XhCDZt/recABC') && at.body.fields.Status === 'Needs review' && at.body.fields['Draft Total'] === 10056.9,
  'Airtable row updated: Status = Needs review, Draft Total');
check(mail.body.attachments?.[0]?.filename.endsWith('.pdf') && Buffer.from(mail.body.attachments[0].content, 'base64').subarray(0, 4).toString() === '%PDF', 'proposal PDF attached: ' + mail.body.attachments?.[0]?.filename);
writeFileSync(new URL('./quote-preview.html', import.meta.url), mail.body.html);
writeFileSync(new URL('./proposal-preview.pdf', import.meta.url), Buffer.from(mail.body.attachments[0].content, 'base64'));

// Claude failure -> admins get a "needs manual quote" email
calls.length = 0;
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url: String(url), body: opts.body ? JSON.parse(opts.body) : null });
  if (String(url).includes('anthropic')) return new Response('overloaded', { status: 529 });
  return Response.json({ routes: [{ distanceMeters: 1, duration: '60s' }] });
};
await handler(new Request('https://x/', { method: 'POST', headers: { 'x-quote-secret': triggerSecret() }, body: JSON.stringify({ inquiry, recordId: 'recABC' }) }));
check(calls.some((c) => c.url.includes('resend') && /failed/.test(c.body.subject)), 'if Claude fails, admins get a "needs manual quote" email');

// Full production: 12% planning fee replaces admin, sourced items at cost × 2 (50% margin), rentals +10%.
{
  const prodPlan = { job_type: 'full_production', base_fee_days: 1,
    shifts: [{ label: 'Install', kind: 'install', team_size: 4, depart_hq: '8:00am', back_hq: '6:00pm' }],
    vehicles: [], sourced_items: [{ label: '12 disco balls + greenery', cost: 3000 }], additional_rentals: [{ label: 'Scissor lift', amount: 500 }] };
  const pp = priceQuote(prodPlan, { business: 'Test Planner', production: true });
  const sourcing = pp.lines.find((l) => l.section === 'Sourcing');
  const lift = pp.lines.find((l) => l.label === 'Scissor lift');
  check(sourcing.amount === 6000 && lift.amount === 550, 'production: sourced items at cost × 2 = 50% margin ($3,000 → $6,000), rentals + 10% ($500 → $550)');
  check(pp.adminPct === 0.12 && pp.feeLabel === 'Production planning fee' && pp.admin === Math.round(pp.subtotal * 12) / 100, 'production: 12% planning fee replaces the 8% admin fee');
  check(pp.subtotal === 2600 + 6000 + 550 + 300 && pp.warnings.some((w) => /typical full production/.test(w)), 'production: labor + base unchanged; under $15k flagged: ' + pp.subtotal);
  const normal = priceQuote({ ...prodPlan, job_type: 'full_service' }, { business: 'Test Planner' });
  check(normal.adminPct === 0.08 && normal.lines.find((l) => l.label === 'Scissor lift').amount === 500, 'crew jobs keep 8% admin + rentals at cost');
}

console.log(ok ? '\nAll quote checks passed. Email preview: test/quote-preview.html' : '\nSome checks failed.');
process.exit(ok ? 0 : 1);
