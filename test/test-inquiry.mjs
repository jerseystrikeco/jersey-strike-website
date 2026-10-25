// Local test for the inquiry automation. Run: npm test
// Sends a sample submission through the function with fake email/Airtable
// endpoints, checks what would be sent, and writes a preview of the email
// to test/email-preview.html. Nothing real is emailed or saved.
import { writeFileSync } from 'node:fs';
import handler, { normalize, airtableFields, subjectFor, renderEmail } from '../netlify/functions/submission-created.mjs';

const sample = {
  payload: {
    form_name: 'inquiry',
    id: 'test-123',
    created_at: '2026-10-24T15:30:00.000Z',
    data: {
      business: 'Wile Events',
      contact_name: 'Jordan Wile',
      email: 'jordan@example.com',
      phone: '(555) 010-2030',
      event_date: '2027-06-12',
      venue: 'Turning Stone Resort Casino, Verona NY',
      studio_address: '12 Studio Lane, Red Bank, NJ',
      services: 'Install + strike crew, Custom fabrication',
      team_size: '8',
      team_needs: 'Designers, High ladder work, Box truck driving',
      vehicles: '26ft Box Truck, 1 Van',
      scope: 'Ceremony arch + suspended floral ceiling.\nLoad-in 9am, strike by midnight.',
      source_page: '/inquire/',
      document_1: { url: 'https://example.com/files/run-of-show.pdf', filename: 'run-of-show.pdf', size: 1200 },
      document_2: '',
    },
  },
};

let ok = true;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) ok = false; };

const q = normalize(sample.payload);
check(q.services.length === 2 && q.teamNeeds.includes('High ladder work'), 'multi-selects split into lists');
check(q.files.length === 1 && q.files[0].filename === 'run-of-show.pdf', 'uploaded files picked up, empty ones skipped');
check(subjectFor(q) === 'New Inquiry: June 12, 2027 at Turning Stone Resort Casino, Verona NY · Wile Events', 'subject line: ' + subjectFor(q));

const f = airtableFields(q);
check(f['Business Name'] === 'Wile Events' && f['Studio Location'] && f['EVENT DATE'] === '2027-06-12' && f['INQUIRY DATE'] === '2026-10-24', 'Airtable core columns match your table');
check(f['Phone Number'] && f['Estimated Team Size'] === 8 && f['Vehicle Needed'].length === 2 && f['Documents'].length === 1, 'detail columns match your new column names');
check(f['Fabrication Build'] === true && f['Notes'].includes('High ladder work') && f['Notes'].includes('run-of-show.pdf'), 'Fabrication Build checked + full details in Notes');

const html = renderEmail(q);
check(!/undefined|null/.test(html) && html.includes('High ladder work') && html.includes('mailto:jordan@example.com'), 'email renders all sections');
writeFileSync(new URL('./email-preview.html', import.meta.url), html);

// Full run with fake endpoints.
const calls = [];
globalThis.fetch = async (url, opts) => { calls.push({ url, body: JSON.parse(opts.body) }); return new Response('{}', { status: 200 }); };
Object.assign(process.env, { RESEND_API_KEY: 'test', AIRTABLE_TOKEN: 'test', AIRTABLE_BASE_ID: 'appTEST', INQUIRY_TO: 'inquire@jerseystrike.com' }); delete process.env.AIRTABLE_TABLE;
const res = await handler(new Request('https://x/', { method: 'POST', body: JSON.stringify(sample) }));
check(res.status === 200 && calls.length === 2, 'handler sends one email and one Airtable record');
const email = calls.find((c) => c.url.includes('resend'));
check(email && email.body.reply_to === 'jordan@example.com' && email.body.to[0] === 'inquire@jerseystrike.com', 'reply-to is the client, sent to inquiries inbox');
const at = calls.find((c) => c.url.includes('airtable'));
check(at && at.url.endsWith('/appTEST/tblvthafdL2XhCDZt'), 'Airtable record goes to EVENT INQUIRIES + LEADS');

// Optional columns that don't exist are skipped, not fatal.
calls.length = 0; let n = 0;
globalThis.fetch = async (url, opts) => { const body = JSON.parse(opts.body); calls.push({ url, body });
  if (url.includes('airtable') && n++ < 2) { const f = Object.keys(body.records[0].fields).find(k => ['Email','Phone Number','Venue','Scope of Work'].includes(k));
    return new Response(JSON.stringify({ error: { type: 'UNKNOWN_FIELD_NAME', message: `Unknown field name: "${f}"` } }), { status: 422 }); }
  return new Response('{}', { status: 200 }); };
await handler(new Request('https://x/', { method: 'POST', body: JSON.stringify(sample) }));
check(calls.filter(c => c.url.includes('airtable')).length === 3, 'missing optional columns are skipped and the record still saves');

// A list sent to a plain-text column is retried as text.
calls.length = 0; let m = 0;
globalThis.fetch = async (url, opts) => { const body = JSON.parse(opts.body); calls.push({ url, body });
  if (url.includes('airtable') && m++ === 0) return new Response(JSON.stringify({ error: { type: 'INVALID_VALUE_FOR_COLUMN', message: 'Field "Services" cannot accept the provided value' } }), { status: 422 });
  return new Response('{}', { status: 200 }); };
await handler(new Request('https://x/', { method: 'POST', body: JSON.stringify(sample) }));
const last = calls.filter(c => c.url.includes('airtable')).pop();
check(last.body.records[0].fields['Services'] === 'Install + strike crew, Custom fabrication', 'list retried as text for a text column');

// Other forms are ignored.
calls.length = 0;
await handler(new Request('https://x/', { method: 'POST', body: JSON.stringify({ payload: { form_name: 'other', data: {} } }) }));
check(calls.length === 0, 'non-inquiry forms are ignored');

console.log(ok ? '\nAll checks passed. Email preview: test/email-preview.html' : '\nSome checks failed.');
process.exit(ok ? 0 : 1);
