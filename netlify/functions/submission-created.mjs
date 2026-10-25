// Jersey Strike Co. inquiry automation.
//
// Netlify runs this automatically every time someone submits a form on the site
// (the file name "submission-created" is what tells Netlify to do that).
// For the "inquiry" form it does two things, independently:
//   1. Emails a formatted summary to the inquiries inbox (via Resend).
//   2. Adds a row to the "Inquiries" tab in your Airtable base.
// If one of them fails, the other still runs, and Netlify's own copy of the
// submission is always kept in the dashboard as a backup.
//
// Settings live in Netlify > Site configuration > Environment variables:
//   RESEND_API_KEY     API key from resend.com
//   INQUIRY_TO         where inquiries go, e.g. inquire@jerseystrike.com (comma-separate for several)
//   INQUIRY_FROM       sender, e.g. "Jersey Strike Website <inquiries@jerseystrike.com>"
//   AIRTABLE_TOKEN     Airtable personal access token (data.records:write on your base)
//   AIRTABLE_BASE_ID   your base ID, starts with "app"
//   AIRTABLE_TABLE     optional; defaults to your EVENT INQUIRIES + LEADS table

const SITE = 'https://jerseystrike.com';

// Your existing Airtable table: EVENT INQUIRIES + LEADS (table ID below).
// Left side = what the form collects, right side = your column name.
const F = {
  business: 'Business Name',
  contact: 'Contact Name',
  studio: 'Studio Location',
  inquiryDate: 'INQUIRY DATE',
  eventDate: 'EVENT DATE',
  fabrication: 'Fabrication Build',
  notes: 'Notes',
};
// Detail columns you added. If one is renamed or removed, it's skipped automatically.
// If a column doesn't exist, it is skipped automatically (everything is also in Notes).
const OPTIONAL = {
  status: process.env.AIRTABLE_STATUS_FIELD || 'Status',
  email: 'Email',
  phone: 'Phone Number',
  venue: 'Venue',
  services: 'Services',
  teamSize: 'Estimated Team Size',
  teamNeeds: 'Team Needs',
  vehicles: 'Vehicle Needed',
  scope: 'Scope of Work',
  documents: 'Documents',
};
const DEFAULT_TABLE = 'tblvthafdL2XhCDZt';

export default async (req) => {
  let payload;
  try {
    payload = (await req.json()).payload;
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  if (!payload || payload.form_name !== 'inquiry') return new Response('Ignored');

  const inquiry = normalize(payload);
  const results = await Promise.allSettled([sendEmail(inquiry), saveToAirtable(inquiry)]);
  results.forEach((r, i) => {
    const step = i === 0 ? 'email' : 'airtable';
    if (r.status === 'rejected') console.error(`[inquiry] ${step} failed:`, r.reason?.message || r.reason);
    else console.log(`[inquiry] ${step} ok`);
  });
  return new Response('OK');
};

// ---------- Clean up the raw form data ----------

export function normalize(payload) {
  const d = payload.data || {};
  const s = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
  const list = (v) =>
    (Array.isArray(v) ? v : s(v).split(','))
      .map((x) => s(x))
      .filter(Boolean);
  const files = ['document_1', 'document_2', 'document_3']
    .map((k) => d[k])
    .filter((f) => f && (typeof f === 'string' ? f : f.url))
    .map((f) =>
      typeof f === 'string'
        ? { url: f, filename: decodeURIComponent(f.split('/').pop().split('?')[0]) || 'Document' }
        : { url: f.url, filename: f.filename || 'Document', size: f.size },
    );
  return {
    id: payload.id || '',
    received: payload.created_at || new Date().toISOString(),
    business: s(d.business),
    contact: s(d.contact_name),
    email: s(d.email),
    phone: s(d.phone),
    eventDate: s(d.event_date), // yyyy-mm-dd from the date picker
    venue: s(d.venue),
    studio: s(d.studio_address),
    services: list(d.services),
    teamSize: s(d.team_size),
    teamNeeds: list(d.team_needs),
    vehicles: list(d.vehicles),
    scope: s(d.scope),
    source: s(d.source_page),
    files,
  };
}

// ---------- Email ----------

function prettyDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || 'Date TBD';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function subjectFor(q) {
  const when = prettyDate(q.eventDate).replace(/^\w+, /, '');
  return `New Inquiry: ${when} at ${q.venue || 'venue TBD'}${q.business ? ` · ${q.business}` : ''}`;
}

export function renderEmail(q) {
  const row = (label, value) =>
    `<tr><td style="padding:8px 0;width:150px;vertical-align:top;color:#7A6F55;font-size:13px">${esc(label)}</td>` +
    `<td style="padding:8px 0;vertical-align:top;color:#0A100D;font-size:15px">${value || '<span style="color:#A8A391">Not provided</span>'}</td></tr>`;
  const chips = (arr) =>
    arr.length
      ? arr
          .map(
            (x) =>
              `<span style="display:inline-block;margin:0 6px 6px 0;padding:4px 10px;border:1px solid #D8B46A;border-radius:999px;background:#FBF4E2;font-size:13px">${esc(x)}</span>`,
          )
          .join('')
      : '';
  const section = (title, body) =>
    `<tr><td style="padding:22px 28px 6px"><div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;font-weight:700;color:#9A7838">${esc(title)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #E2D9C4;margin-top:8px">${body}</table></td></tr>`;
  const tel = q.phone ? `<a href="tel:${esc(q.phone.replace(/[^\d+]/g, ''))}" style="color:#0A100D">${esc(q.phone)}</a>` : '';
  const mail = q.email ? `<a href="mailto:${esc(q.email)}" style="color:#0A100D">${esc(q.email)}</a>` : '';
  const map = q.venue ? ` · <a href="https://maps.google.com/?q=${encodeURIComponent(q.venue)}" style="color:#9A7838">Map</a>` : '';
  const docs = q.files.length
    ? q.files.map((f) => `<a href="${esc(f.url)}" style="color:#0A100D">${esc(f.filename)}</a>`).join('<br>') +
      '<div style="margin-top:6px;font-size:12px;color:#7A6F55">Download links may expire. Copies are saved in Netlify &gt; Forms (and in Airtable if you add a Documents column).</div>'
    : '';
  const scope = q.scope ? esc(q.scope).replace(/\n/g, '<br>') : '';

  return `<!doctype html><html><body style="margin:0;padding:0;background:#EFE9DC">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EFE9DC;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#FFFFFF;border-radius:14px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#0A100D">
<tr><td style="background:#0A100D;padding:22px 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td><img src="${SITE}/images/jersey-strike-logo.png" width="120" alt="Jersey Strike" style="display:block;border:0"></td>
<td align="right" style="color:#D8B46A;font-size:11px;letter-spacing:.18em;text-transform:uppercase;font-weight:700">New inquiry</td>
</tr></table></td></tr>
<tr><td style="padding:26px 28px 4px">
<div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.2">${esc(q.business || q.contact || 'New inquiry')}</div>
<div style="margin-top:6px;font-size:15px;color:#5C574A">${esc(prettyDate(q.eventDate))} · ${esc(q.venue || 'Venue TBD')}</div>
<div style="margin-top:14px">${q.email ? `<a href="mailto:${esc(q.email)}?subject=${encodeURIComponent('Re: ' + subjectFor(q))}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#0A100D;color:#F4EEDF;text-decoration:none;font-size:14px;font-weight:700">Reply to ${esc(q.contact || 'client')}</a>` : ''}</div>
</td></tr>
${section('Contact', row('Business', esc(q.business)) + row('Point of contact', esc(q.contact)) + row('Email', mail) + row('Phone', tel))}
${section('Event', row('Event date', esc(prettyDate(q.eventDate))) + row('Venue', esc(q.venue) + map) + row('Studio pickup / delivery', esc(q.studio)))}
${section('Scope', row('Services', chips(q.services)) + row('Est. team size', esc(q.teamSize)) + row('Team needs', chips(q.teamNeeds)) + row('Vehicles', chips(q.vehicles)))}
${section('Scope of work', `<tr><td style="padding:10px 0;font-size:15px;line-height:1.55">${scope || '<span style="color:#A8A391">Not provided</span>'}</td></tr>`)}
${section('Documents', `<tr><td style="padding:10px 0;font-size:15px;line-height:1.7">${docs || '<span style="color:#A8A391">No files uploaded</span>'}</td></tr>`)}
<tr><td style="padding:24px 28px;font-size:12px;color:#7A6F55;border-top:1px solid #E2D9C4">
Submitted ${esc(new Date(q.received).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }))} ET from ${esc(SITE + (q.source || ''))}. Also saved to EVENT INQUIRIES + LEADS in Airtable.
</td></tr>
</table></td></tr></table></body></html>`;
}

export function renderText(q) {
  return [
    subjectFor(q), '',
    `Business: ${q.business}`, `Contact: ${q.contact}`, `Email: ${q.email}`, `Phone: ${q.phone}`, '',
    `Event date: ${prettyDate(q.eventDate)}`, `Venue: ${q.venue}`, `Studio pickup/delivery: ${q.studio}`, '',
    `Services: ${q.services.join(', ')}`, `Est. team size: ${q.teamSize}`, `Team needs: ${q.teamNeeds.join(', ')}`, `Vehicles: ${q.vehicles.join(', ')}`, '',
    'Scope of work:', q.scope, '',
    'Documents:', ...q.files.map((f) => `${f.filename}: ${f.url}`),
  ].join('\n');
}

async function sendEmail(q) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const to = (process.env.INQUIRY_TO || 'inquire@jerseystrike.com').split(',').map((x) => x.trim()).filter(Boolean);
  const body = {
    from: process.env.INQUIRY_FROM || 'Jersey Strike Website <inquiries@jerseystrike.com>',
    to,
    subject: subjectFor(q),
    html: renderEmail(q),
    text: renderText(q),
  };
  if (q.email) body.reply_to = q.email;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
}

// ---------- Airtable ----------

function notesText(q) {
  const lines = [
    `Website inquiry ${new Date(q.received).toLocaleDateString('en-US', { timeZone: 'America/New_York' })}`,
    q.email && `Email: ${q.email}`,
    q.phone && `Phone: ${q.phone}`,
    q.venue && `Venue: ${q.venue}`,
    q.services.length && `Services: ${q.services.join(', ')}`,
    q.teamSize && `Est. team size: ${q.teamSize}`,
    q.teamNeeds.length && `Team needs: ${q.teamNeeds.join(', ')}`,
    q.vehicles.length && `Vehicles: ${q.vehicles.join(', ')}`,
    q.scope && `\nScope of work:\n${q.scope}`,
    q.files.length && `\nDocuments:\n${q.files.map((f) => `${f.filename}: ${f.url}`).join('\n')}`,
  ];
  return lines.filter(Boolean).join('\n');
}

export function airtableFields(q) {
  const today = new Date(q.received).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // yyyy-mm-dd
  const f = {
    [F.business]: q.business || q.contact,
    [F.contact]: q.contact,
    [F.studio]: q.studio,
    [F.inquiryDate]: today,
    [F.notes]: notesText(q),
  };
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.eventDate)) f[F.eventDate] = q.eventDate;
  if (q.services.some((s) => /fabrication/i.test(s))) f[F.fabrication] = true;
  const opt = {
    [OPTIONAL.status]: process.env.AIRTABLE_STATUS_VALUE || 'NEED REPLY',
    [OPTIONAL.email]: q.email,
    [OPTIONAL.phone]: q.phone,
    [OPTIONAL.venue]: q.venue,
    [OPTIONAL.services]: q.services,
    [OPTIONAL.teamNeeds]: q.teamNeeds,
    [OPTIONAL.vehicles]: q.vehicles,
    [OPTIONAL.scope]: q.scope,
  };
  const n = parseInt(q.teamSize, 10);
  if (!Number.isNaN(n)) opt[OPTIONAL.teamSize] = n;
  if (q.files.length) opt[OPTIONAL.documents] = q.files.map((x) => ({ url: x.url, filename: x.filename }));
  Object.assign(f, opt);
  for (const k of Object.keys(f)) if (f[k] === '' || f[k] == null || (Array.isArray(f[k]) && !f[k].length)) delete f[k];
  return f;
}

const REQUIRED = new Set(Object.values(F));

async function saveToAirtable(q) {
  const token = process.env.AIRTABLE_TOKEN;
  const base = process.env.AIRTABLE_BASE_ID;
  const table = process.env.AIRTABLE_TABLE || DEFAULT_TABLE;
  if (!token || !base) throw new Error('AIRTABLE_TOKEN or AIRTABLE_BASE_ID is not set');
  const fields = airtableFields(q);
  // Try to save; if Airtable says an optional column doesn't exist (or won't
  // accept the value), drop that column and try again. Notes always has everything.
  for (let attempt = 0; attempt < 12; attempt++) {
    const r = await fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: [{ fields }], typecast: true }),
    });
    if (r.ok) return;
    const text = await r.text();
    let msg = text;
    try { msg = JSON.parse(text).error?.message || text; } catch {}
    const bad = Object.keys(fields).find((k) => !REQUIRED.has(k) && msg.includes(`"${k}"`));
    if (r.status === 422 && bad) {
      // If the column is plain text and we sent a list or number, retry as text first.
      if (Array.isArray(fields[bad]) && bad !== OPTIONAL.documents) { fields[bad] = fields[bad].join(', '); continue; }
      if (typeof fields[bad] === 'number') { fields[bad] = String(fields[bad]); continue; }
      console.log(`[inquiry] skipping Airtable column "${bad}" (${msg.slice(0, 120)})`);
      delete fields[bad];
      continue;
    }
    throw new Error(`Airtable ${r.status}: ${text}`);
  }
  throw new Error('Airtable: too many retries');
}
