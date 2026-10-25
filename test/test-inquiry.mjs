// Local test for the inquiry automation. Run: npm test
// Sends a sample submission through the function with fake email/Airtable
// endpoints, checks what would be sent, and writes previews of the email and
// the Airtable Scope of Work text to test/. Nothing real is emailed or saved.
import { writeFileSync } from 'node:fs';
import handler, { normalize, airtableFields, subjectFor, renderEmail, scopeText } from '../netlify/functions/submission-created.mjs';

const sample = {
  payload: {
    form_name: 'inquiry',
    id: 'test-123',
    created_at: '2026-10-24T15:30:00.000Z',
    data: {
      business: 'Wile Events', contact_name: 'Jordan Wile', email: 'jordan@example.com', phone: '(555) 010-2030',
      planner_contact: 'Lauren, Ever After Events, (555) 010-4455',
      event_date: '2027-06-12', venue: 'Turning Stone Resort Casino, Verona NY',
      guest_count: '220', table_count: '24', event_budget: '$40k–$75k',
      services: 'Strike crew; Trucking + delivery; Custom fabrication',
      install_count: '4', install_height: '12–20 ft', install_attach: 'Tent poles; Chandeliers / hanging',
      tools_detail: 'Drill + bits, hex key for arch bolts; bridal suite closet',
      strike_start: '22:00', hard_out: '23:30',
      breakdown: 'Leave all flowers in vessels, bring back whole; Dispose of candles; Load your truck',
      linens: 'Bag, count + leave on site', linen_dropoff: 'Venue garage by the dock', linen_bags: 'Rental company bags will be on site',
      other_rentals: 'Yes, leave them in place', client_staff: '2',
      truck: 'Client-provided truck, Jersey Strike drives + loads', vehicles: '26ft Box Truck', studio_address: '12 Studio Lane, Red Bank, NJ',
      access: 'Loading dock; Long push (100 ft+)', venue_access_notes: 'Dock behind kitchen; staff lot', pickup_type: 'Residential / work-from-home florist space', studio_access_notes: 'Driveway fits a van only', load_size: '12 urns, 4 tree frames, largest 14 ft',
      fab_description: 'Suspended hoop, 8 ft diameter', fab_needed_by: '2027-05-30',
      docs_link: 'https://drive.example.com/deck', walkthrough_link: '',
      scope: 'Last time the strike ran long because of the trees.',
      acknowledged: 'Yes', source_page: '/inquire/',
      document_1: { url: 'https://example.com/files/run-of-show.pdf', filename: 'run-of-show.pdf', size: 1200 },
      document_2: '',
      document_5: { url: 'https://example.com/files/flower-order.xlsx', filename: 'flower-order.xlsx', size: 900 },
      // fields from a section they didn't pick are disabled and never sent
    },
  },
};

let ok = true;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) ok = false; };

const q = normalize(sample.payload);
check(normalize({ data: { services: 'Strike crew, Rentals' } }).services.length === 2 && q.services.length === 3 && q.lists.breakdown.length === 3 && q.lists.breakdown[0] === 'Leave all flowers in vessels, bring back whole', 'multi-selects split into lists (old + new separators)');
check(q.files.length === 2 && q.files[1].filename === 'flower-order.xlsx', 'all 6 upload slots read, empty ones skipped');
check(subjectFor(q) === 'New Inquiry: June 12, 2027 at Turning Stone Resort Casino, Verona NY · Wile Events', 'subject line: ' + subjectFor(q));

const text = scopeText(q);
writeFileSync(new URL('./scope-of-work-preview.txt', import.meta.url), text);
check(/^SERVICES\n• Strike crew/.test(text) && text.includes('STRIKE\nStrike can start: 10:00 PM') && text.includes('Venue hard out: 11:30 PM'), 'Scope of Work has headings + 12-hour times');
check(text.includes('Pickup / return location: Residential / work-from-home florist space') && text.includes('Pickup loading + parking: Driveway fits a van only') && text.includes('Venue loading + parking: Dock behind kitchen') && text.includes('Linen drop spot: Venue garage by the dock') && text.includes('TRUCKING + ACCESS') && text.includes('FABRICATION\nWhat to build: Suspended hoop') && text.includes('Needed by: Sun, May 30, 2027'), 'every answered section is included');
check(!text.includes('INSTALL + SET-UP') && !text.includes('RIGGING') && !text.includes('HOLIDAY') && !text.includes('Walkthrough'), 'unanswered sections and blanks left out');
check(text.includes('THEIR NOTES\nLast time') && text.includes('DOCUMENTS\nrun-of-show.pdf') && text.includes('Agreed: quote is a preliminary estimate'), 'notes, documents + agreement included');

const f = airtableFields(q);
check(f['Business Name'] === 'Wile Events' && f['EVENT DATE'] === '2027-06-12' && f['INQUIRY DATE'] === '2026-10-24' && f['Studio Location'], 'Airtable core columns match your table');
check(f['Scope of Work'] === text && f['Status'] === 'NEED REPLY' && f['Fabrication Build'] === true, 'Scope of Work gets the formatted details; Status NEED REPLY');
check(f['Notes'].startsWith('Website inquiry') && f['Notes'].length < 80 && f['Documents'].length === 2, 'Notes stays short; documents attached');

const html = renderEmail(q);
check(!/undefined|null/.test(html) && html.includes('Breakdown includes') && html.includes('Leave all flowers in vessels') && html.includes('10:00 PM') && html.includes('mailto:jordan@example.com'), 'email renders the grouped sections');
writeFileSync(new URL('./email-preview.html', import.meta.url), html);

// Full run with fake endpoints.
const calls = [];
globalThis.fetch = async (url, opts) => { calls.push({ url, body: JSON.parse(opts.body) }); return new Response('{}', { status: 200 }); };
Object.assign(process.env, { RESEND_API_KEY: 'test', AIRTABLE_TOKEN: 'test', AIRTABLE_BASE_ID: 'appTEST', INQUIRY_TO: 'inquire@jerseystrike.com' }); delete process.env.AIRTABLE_TABLE;
const res = await handler(new Request('https://x/', { method: 'POST', body: JSON.stringify(sample) }));
check(res.status === 200 && calls.length === 2, 'handler sends one email and one Airtable record');
const email = calls.find((c) => c.url.includes('resend'));
check(email && email.body.reply_to === 'jordan@example.com' && email.body.to[0] === 'inquire@jerseystrike.com' && email.body.text.includes('STRIKE'), 'reply-to is the client; text email has the details');
const at = calls.find((c) => c.url.includes('airtable'));
check(at && at.url.endsWith('/appTEST/tblvthafdL2XhCDZt'), 'Airtable record goes to EVENT INQUIRIES + LEADS');

// Rigging-only inquiry.
const rig = scopeText(normalize({ data: { services: 'Rigging + ladder work only', rig_phase: 'Install + strike', rig_height: 'Over 20 ft / lift needed', rig_start: '08:00', rig_hard_out: '23:30', rig_points: 'Truss (from draping partner); Beams or rafters' } }));
check(rig.includes('RIGGING + LADDER WORK\nNeeded for: Install + strike') && rig.includes('Install: on site from: 8:00 AM') && rig.includes('Venue hard out: 11:30 PM') && rig.includes('  • Beams or rafters'), 'rigging-only inquiry formats correctly');

// Team worksheet entry.
const tq = normalize({ form_name: 'team-quote', created_at: '2026-10-25T15:00:00Z', data: {
  entered_by: 'Michaela', inquiry_source: 'Email', original_message: 'Hi! Need 3 strikers and a van.',
  business: 'True Floral', contact_name: 'Kate', email: 'kate@example.com', venue: 'Inn at Perry Cabin', event_date: '2027-10-17',
  services: 'Strike crew', est_crew_hours: '9', est_window: '1', est_crew: '9', vehicle_flag: 'VANessa (E350) or a 15ft box truck required: 15–24 ft work needs ladders over 10 ft, which don’t fit in MINIvan.',
  missing: 'Your proposal or design deck; How each install is attached (freestanding, tent poles, ceiling, hanging)' } });
const tt = scopeText(tq), tf = airtableFields(tq);
check(tq.team && tq.missing.length === 2 && tt.startsWith('TEAM ENTRY\nEntered by: Michaela') && tt.includes('STILL MISSING (follow up)\n• Your proposal') && tt.includes('THEIR ORIGINAL MESSAGE\nHi! Need 3 strikers'), 'team entry: who, gaps + original message in Scope of Work');
check(tt.includes('OUR READ (INTERNAL)\nCrew-hours needed: 9') && tt.includes('Vehicle: VANessa') && !tt.includes('Agreed:'), 'team entry: our read + vehicle flag, no client agreement line');
check(tf.Status === 'NEED REPLY' && tf.Notes.startsWith('Entered by Michaela from an email inquiry') && subjectFor(tq).startsWith('Team entry:'), 'team entry: status, notes + subject');
check(airtableFields(normalize({ form_name: 'team-quote', data: { business: 'X', services: 'Rentals' } })).Status === 'NEED QUOTE', 'team entry with nothing missing goes to NEED QUOTE');
check(renderEmail(tq).includes('Still missing: follow up') && renderEmail(tq).includes('Team entry · Michaela'), 'team entry email shows the gap list');

// Phase 2 hand-off: with ANTHROPIC_API_KEY set, the quote draft is started with the record id.
calls.length = 0;
globalThis.fetch = async (url, opts) => { calls.push({ url, body: JSON.parse(opts.body), headers: opts.headers });
  return new Response(url.includes('airtable') ? JSON.stringify({ records: [{ id: 'recABC' }] }) : '{}', { status: url.includes('draft-quote') ? 202 : 200 }); };
process.env.ANTHROPIC_API_KEY = 'test-key';
await handler(new Request('https://x/', { method: 'POST', body: JSON.stringify(sample) }));
const qd = calls.find((c) => c.url.includes('draft-quote-background'));
check(qd && qd.body.recordId === 'recABC' && qd.headers['x-quote-secret'] && qd.body.inquiry.scope.includes('STRIKE\nStrike can start: 10:00 PM') && qd.body.inquiry.business === 'Wile Events', 'quote draft started with record id + full scope');
delete process.env.ANTHROPIC_API_KEY;

// Missing optional columns are skipped; a missing Scope of Work column moves the details into Notes.
calls.length = 0; let n = 0;
globalThis.fetch = async (url, opts) => { const body = JSON.parse(opts.body); calls.push({ url, body });
  if (url.includes('airtable') && n++ < 2) { const k = ['Email', 'Scope of Work'][n - 1];
    return new Response(JSON.stringify({ error: { type: 'UNKNOWN_FIELD_NAME', message: `Unknown field name: "${k}"` } }), { status: 422 }); }
  return new Response('{}', { status: 200 }); };
await handler(new Request('https://x/', { method: 'POST', body: JSON.stringify(sample) }));
const lastAt = calls.filter(c => c.url.includes('airtable')).pop().body.records[0].fields;
check(calls.filter(c => c.url.includes('airtable')).length === 3 && !lastAt['Scope of Work'] && lastAt['Notes'].includes('STRIKE'), 'missing columns skipped; details fall back into Notes');

// A list sent to a plain-text column is retried as text.
calls.length = 0; let m = 0;
globalThis.fetch = async (url, opts) => { const body = JSON.parse(opts.body); calls.push({ url, body });
  if (url.includes('airtable') && m++ === 0) return new Response(JSON.stringify({ error: { type: 'INVALID_VALUE_FOR_COLUMN', message: 'Field "Services" cannot accept the provided value' } }), { status: 422 });
  return new Response('{}', { status: 200 }); };
await handler(new Request('https://x/', { method: 'POST', body: JSON.stringify(sample) }));
const last = calls.filter(c => c.url.includes('airtable')).pop();
check(last.body.records[0].fields['Services'] === 'Strike crew, Trucking + delivery, Custom fabrication', 'list retried as text for a text column');

// Other forms are ignored.
calls.length = 0;
await handler(new Request('https://x/', { method: 'POST', body: JSON.stringify({ payload: { form_name: 'other', data: {} } }) }));
check(calls.length === 0, 'other forms are ignored');

console.log(ok ? '\nAll checks passed. Previews: test/email-preview.html, test/scope-of-work-preview.txt' : '\nSome checks failed.');
process.exit(ok ? 0 : 1);
