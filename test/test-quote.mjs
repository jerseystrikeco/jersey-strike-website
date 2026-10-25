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
check(bat.itemsSubtotal === 863.75 && bat.total === 1256.85 && bat.warnings.length === 1, 'Battello-size strike for a standard client: $1,256.85 + minimum flag');
const aptp = priceQuote({ job_type: 'strike_only', base_fee_days: 1, shifts: [{ label: 'Strike', kind: 'strike', team_size: 3, depart_hq: '9:45pm', back_hq: '2:00am' }], vehicles: [{ kind: 'van', label: 'JS van', round_trip_miles: 35 }] }, { business: 'A Petal To Peddle' });
check(aptp.total === 1256.85 && !aptp.warnings.length, 'A Petal to Peddle grandfathered: no minimum flag');
const lily = priceQuote({ job_type: 'strike_only', base_fee_days: 1, shifts: [{ label: 'Strike', kind: 'strike', team_size: 3, depart_hq: '9:30pm', back_hq: '3:45am' }], vehicles: [{ kind: 'van', label: 'Van', round_trip_miles: 70 }] }, { business: 'A Lily Among Thorns' });
check(lily.subtotal === 1588.75 && lily.admin === 127.1 && lily.discount.amount === -428.96 && lily.total === 1286.89, `A Lily Among Thorns: 8% admin then 25% family discount = $${lily.total}`);
check(priceUhaul({ days: 1, miles: 50 }).days === 2, 'U-Haul minimum 2 days');
const ct = priceQuote({ vehicles: [{ kind: 'client_truck', label: 'Client truck', round_trip_miles: 120, trips: 2 }] }, {});
check(ct.lines[0].amount === 400, 'client truck management: $200 minimum per round trip');

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
check(mail.body.subject.startsWith('Draft quote $10,056.90'), 'subject: ' + mail.body.subject);
check(/Method A/.test(mail.body.html) && /Red flags/i.test(mail.body.html) && /preliminary estimate/.test(mail.body.html), 'email has math, red flags and the scope-change footer');
const at = calls.find((c) => c.url.includes('airtable') && c.method === 'PATCH');
check(at && at.url.endsWith('/tblvthafdL2XhCDZt/recABC') && at.body.fields.Status === 'Needs review' && at.body.fields['Draft Total'] === 10056.9,
  'Airtable row updated: Status = Needs review, Draft Total');
writeFileSync(new URL('./quote-preview.html', import.meta.url), mail.body.html);

// Claude failure -> admins get a "needs manual quote" email
calls.length = 0;
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url: String(url), body: opts.body ? JSON.parse(opts.body) : null });
  if (String(url).includes('anthropic')) return new Response('overloaded', { status: 529 });
  return Response.json({ routes: [{ distanceMeters: 1, duration: '60s' }] });
};
await handler(new Request('https://x/', { method: 'POST', headers: { 'x-quote-secret': triggerSecret() }, body: JSON.stringify({ inquiry, recordId: 'recABC' }) }));
check(calls.some((c) => c.url.includes('resend') && /failed/.test(c.body.subject)), 'if Claude fails, admins get a "needs manual quote" email');

console.log(ok ? '\nAll quote checks passed. Email preview: test/quote-preview.html' : '\nSome checks failed.');
process.exit(ok ? 0 : 1);
