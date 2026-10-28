// Jersey Strike Co. inquiry automation.
//
// Netlify runs this automatically every time someone submits a form on the site
// (the file name "submission-created" is what tells Netlify to do that).
// For the "inquiry" form (and "production", from the Full Production page) it does two things, independently:
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

import { triggerSecret } from './lib/trigger.mjs';
import { sendInquiryToHub } from './lib/hub.mjs';

// Netlify sets URL to the live site address (the netlify.app address now, jerseystrike.com once the domain is connected).
const SITE = (process.env.URL || 'https://jerseystrike.com').replace(/\/$/, '');

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

// Everything else the form asks, grouped the way it reads in the email and in
// Airtable's "Scope of Work" column. [form field, label, kind]. Add a line here
// when you add a question to the form; blank answers are left out.
const DETAILS = [
  ['Event', [
    ['planner_contact', 'Planner / day-of contact'],
    ['guest_count', 'Guests'],
    ['table_count', 'Tables'],
    ['event_budget', 'Floral + decor budget'],
    ['full_event_budget', 'Full event budget'],
  ]],
  ['Full production', [
    ['production_budget', 'Production budget'],
    ['production_days', 'Production days'],
    ['production_scope', 'In scope', 'list'],
  ]],
  ['Installs on site', [
    ['install_count', 'Large installs'],
    ['install_height', 'Tallest install'],
    ['install_attach', 'Attached to', 'list'],
    ['tools_detail', 'Tools left on site'],
  ]],
  ['Strike', [
    ['strike_start', 'Strike can start', 'time'],
    ['hard_out', 'Venue hard out', 'time'],
    ['breakdown', 'Breakdown includes', 'list'],
    ['linens', 'Linens'],
    ['linen_dropoff', 'Linen drop spot'],
    ['linen_bags', 'Linen bags'],
    ['other_rentals', 'Other vendors’ rentals'],
    ['other_rentals_detail', 'Rentals coming back'],
    ['client_staff', 'Their staff on site'],
  ]],
  ['Rigging + ladder work', [
    ['rig_phase', 'Needed for'],
    ['rig_height', 'Working height'],
    ['rig_start', 'Install: on site from', 'time'],
    ['rig_end', 'Install: done by', 'time'],
    ['rig_strike_start', 'Strike can start', 'time'],
    ['rig_hard_out', 'Venue hard out', 'time'],
    ['rig_pieces', 'Pieces'],
    ['rig_weight', 'Heaviest piece'],
    ['rig_points', 'Hanging from', 'list'],
  ]],
  ['Install + set-up', [
    ['load_in', 'Load-in can start', 'time'],
    ['ready_by', 'Must be finished by', 'time'],
    ['flip', 'Room flip'],
    ['flip_window', 'Flip window'],
    ['built', 'Pieces arrive'],
    ['team_needs', 'Team needs', 'list'],
  ]],
  ['Holiday install support', [
    ['holiday_start', 'Install starts', 'date'],
    ['holiday_end', 'Install ends', 'date'],
    ['holiday_sites', 'Sites'],
    ['holiday_property', 'Site type'],
    ['holiday_scope', 'Installing', 'list'],
    ['holiday_height', 'Highest work'],
    ['holiday_deinstall_needed', 'De-install needed'],
    ['holiday_deinstall', 'De-install', 'date'],
  ]],
  ['Trucking + access', [
    ['truck', 'Truck'],
    ['vehicles', 'Vehicles', 'list'],
    ['access', 'Venue access', 'list'],
    ['venue_access_notes', 'Venue loading + parking'],
    ['pickup_type', 'Pickup / return location'],
    ['studio_address', 'Pickup / return address'],
    ['studio_access_notes', 'Pickup loading + parking'],
    ['load_size', 'Rough load'],
  ]],
  ['Fabrication', [
    ['fab_description', 'What to build'],
    ['fab_needed_by', 'Needed by', 'date'],
  ]],
  ['Rentals', [
    ['rental_items', 'Items'],
    ['rental_handoff', 'Pickup / delivery'],
    ['rental_address', 'Delivery address'],
  ]],
  ['Our read (internal)', [
    ['est_crew_hours', 'Crew-hours needed'],
    ['est_window', 'Time window (hrs)'],
    ['est_crew', 'Crew size'],
    ['est_drive', 'Drive each way'],
    ['vehicle_flag', 'Vehicle'],
    ['est_notes', 'Risks + notes'],
  ]],
  ['Links', [
    ['docs_link', 'Files', 'link'],
    ['walkthrough_link', 'Walkthrough video / photos', 'link'],
  ]],
];

function prettyTime(v) {
  const m = /^(\d{1,2}):(\d{2})/.exec(v || '');
  if (!m) return v;
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

// The answered questions, as [{ title, rows: [{ label, value, kind }] }].
export function detailSections(q) {
  return DETAILS.map(([title, fields]) => ({
    title,
    rows: fields
      .map(([key, label, kind]) => {
        const raw = q.raw[key];
        if (kind === 'list') {
          const items = q.lists[key] || [];
          return items.length ? { label, value: items, kind } : null;
        }
        if (!raw) return null;
        const value = kind === 'time' ? prettyTime(raw) : kind === 'date' ? prettyDate(raw) : raw;
        return { label, value, kind };
      })
      .filter(Boolean),
  })).filter((sec) => sec.rows.length);
}

// Plain-text version for Airtable's Scope of Work column and the text email.
export function scopeText(q) {
  const out = [];
  if (q.team) out.push('TEAM ENTRY', `Entered by: ${q.enteredBy || 'team'}`, `Came in by: ${q.inquirySource || 'not noted'}`, '');
  if (q.production) out.push('FULL PRODUCTION INQUIRY (Full Production page): book a scoping call with a producer.', '');
  if (q.team && q.missing.length) out.push('STILL MISSING (follow up)', ...q.missing.map((x) => `• ${x}`), '');
  if (q.services.length) out.push('SERVICES', ...q.services.map((x) => `• ${x}`), '');
  for (const sec of detailSections(q)) {
    out.push(sec.title.toUpperCase());
    for (const r of sec.rows) {
      if (r.kind === 'list') out.push(`${r.label}:`, ...r.value.map((x) => `  • ${x}`));
      else out.push(`${r.label}: ${r.value}`);
    }
    out.push('');
  }
  if (q.scope) out.push(q.team ? 'NOTES' : 'THEIR NOTES', q.scope, '');
  if (q.originalMessage) out.push('THEIR ORIGINAL MESSAGE', q.originalMessage, '');
  if (q.files.length) out.push('DOCUMENTS', ...q.files.map((f) => `${f.filename}: ${f.url}`), '');
  if (q.acknowledged) out.push('Agreed: quote is a preliminary estimate; added hours/team billed if scope changes (timeline, collection list, delivery locations); final details due 14 days out.');
  return out.join('\n').trim();
}

export default async (req) => {
  let payload;
  try {
    payload = (await req.json()).payload;
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  if (!payload || !['inquiry', 'team-quote', 'production'].includes(payload.form_name)) return new Response('Ignored');

  const inquiry = normalize(payload);
  const results = await Promise.allSettled([sendEmail(inquiry), saveToAirtable(inquiry), sendInquiryToHub(inquiry, scopeText(inquiry), subjectFor(inquiry))]);
  results.forEach((r, i) => {
    const step = ['email', 'airtable', 'hub'][i];
    if (r.status === 'rejected') console.error(`[inquiry] ${step} failed:`, r.reason?.message || r.reason);
    else console.log(`[inquiry] ${step} ok`);
  });
  // Phase 2: start the AI-drafted preliminary quote (admin review only, never sent to the client).
  try {
    await startQuoteDraft(inquiry, results[1].status === 'fulfilled' ? results[1].value : null, results[2].status === 'fulfilled' ? results[2].value?.leadId : null);
  } catch (e) {
    console.error('[inquiry] quote draft not started:', e.message);
  }
  return new Response('OK');
};

// Hands the inquiry to draft-quote-background.mjs. Skipped when Phase 2 isn't set up
// (no ANTHROPIC_API_KEY / QUOTE_TRIGGER_SECRET). The quote gets the full formatted scope.
async function startQuoteDraft(q, recordId, hubLeadId) {
  const secret = triggerSecret();
  if (!secret) return;
  const inquiry = { ...q, scope: scopeText(q), clientNotes: q.scope };
  delete inquiry.raw;
  const r = await fetch(`${SITE}/.netlify/functions/draft-quote-background`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-quote-secret': secret },
    body: JSON.stringify({ inquiry, recordId, hubLeadId, secret }),
  });
  if (!r.ok && r.status !== 202) throw new Error(`draft-quote-background ${r.status}`);
  console.log(`[inquiry] quote draft started (${r.status}, ${SITE})`);
}

// ---------- Clean up the raw form data ----------

export function normalize(payload) {
  const d = payload.data || {};
  const s = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
  // Multi-selects arrive as one value joined with "; " (older form versions used ", ").
  const list = (v) =>
    (Array.isArray(v) ? v : s(v).split(s(v).includes(';') ? ';' : ','))
      .map((x) => s(x))
      .filter(Boolean);
  const files = ['document_1', 'document_2', 'document_3', 'document_4', 'document_5', 'document_6']
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
    services: list(d.services).length ? list(d.services) : payload.form_name === 'production' ? ['Full production'] : [],
    teamSize: s(d.team_size),
    teamNeeds: list(d.team_needs),
    vehicles: list(d.vehicles),
    scope: s(d.scope),
    source: s(d.source_page),
    acknowledged: /^(yes|on|true)$/i.test(s(d.acknowledged)),
    // Team worksheet entries (form "team-quote").
    team: payload.form_name === 'team-quote',
    // Full Production page entries (form "production").
    production: payload.form_name === 'production',
    enteredBy: s(d.entered_by),
    inquirySource: s(d.inquiry_source),
    originalMessage: s(d.original_message),
    missing: s(d.missing).split(';').map((x) => x.trim()).filter(Boolean),
    files,
    // Every answer, for the grouped details (see DETAILS).
    raw: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, typeof v === 'object' ? '' : s(v)])),
    lists: Object.fromEntries(DETAILS.flatMap(([, fs]) => fs.filter((x) => x[2] === 'list').map(([k]) => [k, list(d[k])]))),
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

export function inquiryMessageId(q) {
  return `<inquiry-${String(q.id || q.received || Date.now()).replace(/[^\w.-]/g, '')}@jerseystrike.com>`;
}

export function subjectFor(q) {
  const when = prettyDate(q.eventDate).replace(/^\w+, /, '');
  return `${q.team ? 'Team entry' : q.production ? 'Production Inquiry' : 'New Inquiry'}: ${when} at ${q.venue || 'venue TBD'}${q.business ? ` · ${q.business}` : ''}`;
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
      '<div style="margin-top:6px;font-size:12px;color:#7A6F55">Download links may expire. Copies are saved in Airtable (Documents) and Netlify &gt; Forms.</div>'
    : '';
  const scope = q.scope ? esc(q.scope).replace(/\n/g, '<br>') : '';
  const details = detailSections(q);
  const detailRows = (sec) =>
    (sec ? sec.rows : [])
      .map((r) => row(r.label, r.kind === 'list' ? chips(r.value) : r.kind === 'link' ? `<a href="${esc(r.value)}" style="color:#0A100D;word-break:break-all">${esc(r.value)}</a>` : esc(r.value).replace(/\n/g, '<br>')))
      .join('');

  return `<!doctype html><html><body style="margin:0;padding:0;background:#EFE9DC">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EFE9DC;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#FFFFFF;border-radius:14px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#0A100D">
<tr><td style="background:#0A100D;padding:22px 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td><img src="${SITE}/images/jersey-strike-logo.png" width="120" alt="Jersey Strike" style="display:block;border:0"></td>
<td align="right" style="color:#D8B46A;font-size:11px;letter-spacing:.18em;text-transform:uppercase;font-weight:700">${q.team ? `Team entry · ${esc(q.enteredBy)}` : q.production ? 'Full production inquiry' : 'New inquiry'}</td>
</tr></table></td></tr>
<tr><td style="padding:26px 28px 4px">
<div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.2">${esc(q.business || q.contact || 'New inquiry')}</div>
<div style="margin-top:6px;font-size:15px;color:#5C574A">${esc(prettyDate(q.eventDate))} · ${esc(q.venue || 'Venue TBD')}</div>
<div style="margin-top:14px">${q.email ? `<a href="mailto:${esc(q.email)}?subject=${encodeURIComponent('Re: ' + subjectFor(q))}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#0A100D;color:#F4EEDF;text-decoration:none;font-size:14px;font-weight:700">Reply to ${esc(q.contact || 'client')}</a>` : ''}</div>
</td></tr>
${section('Contact', row('Business', esc(q.business)) + row('Point of contact', esc(q.contact)) + row('Email', mail) + row('Phone', tel))}
${section('Event', row('Date', esc(prettyDate(q.eventDate))) + row('Venue / site', esc(q.venue) + map) + detailRows(details.find((x) => x.title === 'Event')))}
${section('Services', `<tr><td style="padding:10px 0 4px">${chips(q.services) || '<span style="color:#A8A391">Not provided</span>'}</td></tr>`)}
${details.filter((x) => x.title !== 'Event').map((sec) => section(sec.title, detailRows(sec))).join('\n')}
${q.team && q.missing.length ? section('Still missing: follow up', `<tr><td style="padding:10px 0;font-size:15px;line-height:1.6;color:#9A2738">${q.missing.map((x) => `• ${esc(x)}`).join('<br>')}</td></tr>`) : ''}
${q.originalMessage ? section('Their original message', `<tr><td style="padding:10px 0;font-size:14px;line-height:1.55;color:#2B2A24">${esc(q.originalMessage).replace(/\n/g, '<br>')}</td></tr>`) : ''}
${section(q.team ? 'Notes' : 'Their notes', `<tr><td style="padding:10px 0;font-size:15px;line-height:1.55">${scope || '<span style="color:#A8A391">Not provided</span>'}</td></tr>`)}
${section('Documents', `<tr><td style="padding:10px 0;font-size:15px;line-height:1.7">${docs || '<span style="color:#A8A391">No files uploaded</span>'}</td></tr>`)}
<tr><td style="padding:24px 28px;font-size:12px;color:#7A6F55;border-top:1px solid #E2D9C4">
${q.acknowledged ? 'Agreed to the preliminary-estimate, scope-change billing and 14-day terms. ' : ''}Submitted ${esc(new Date(q.received).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }))} ET from ${esc(SITE + (q.source || ''))}. Also saved to EVENT INQUIRIES + LEADS in Airtable.
</td></tr>
</table></td></tr></table></body></html>`;
}

export function renderText(q) {
  return [
    subjectFor(q), '',
    `Business: ${q.business}`, `Contact: ${q.contact}`, `Email: ${q.email}`, `Phone: ${q.phone}`, '',
    `Event date: ${prettyDate(q.eventDate)}`, `Venue / site: ${q.venue}`, '',
    scopeText(q),
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
  // Stable Message-ID so the draft quote (draft-quote-background.mjs) threads under this email.
  body.headers = { 'Message-ID': inquiryMessageId(q) };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
}

// ---------- Airtable ----------

function notesText(q) {
  const when = new Date(q.received).toLocaleDateString('en-US', { timeZone: 'America/New_York' });
  if (q.team) return `Entered by ${q.enteredBy || 'team'} from a${/^[aeiou]/i.test(q.inquirySource) ? 'n' : ''} ${(q.inquirySource || 'outside').toLowerCase()} inquiry, ${when}. Full details in Scope of Work.`;
  return `Website ${q.production ? 'full production ' : ''}inquiry ${when}. Full details in Scope of Work.`;
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
    [OPTIONAL.status]: q.team ? (q.missing.length ? 'NEED REPLY' : 'NEED QUOTE') : process.env.AIRTABLE_STATUS_VALUE || 'NEED REPLY',
    [OPTIONAL.email]: q.email,
    [OPTIONAL.phone]: q.phone,
    [OPTIONAL.venue]: q.venue,
    [OPTIONAL.services]: q.services,
    [OPTIONAL.teamNeeds]: q.teamNeeds,
    [OPTIONAL.vehicles]: q.vehicles,
    [OPTIONAL.scope]: scopeText(q),
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
  // accept the value), drop that column and try again.
  for (let attempt = 0; attempt < 12; attempt++) {
    const r = await fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: [{ fields }], typecast: true }),
    });
    if (r.ok) { try { return JSON.parse(await r.text()).records?.[0]?.id || null; } catch { return null; } }
    const text = await r.text();
    let msg = text;
    try { msg = JSON.parse(text).error?.message || text; } catch {}
    const bad = Object.keys(fields).find((k) => !REQUIRED.has(k) && msg.includes(`"${k}"`));
    if (r.status === 422 && bad) {
      // If the column is plain text and we sent a list or number, retry as text first.
      if (Array.isArray(fields[bad]) && bad !== OPTIONAL.documents) { fields[bad] = fields[bad].join(', '); continue; }
      if (typeof fields[bad] === 'number') { fields[bad] = String(fields[bad]); continue; }
      console.log(`[inquiry] skipping Airtable column "${bad}" (${msg.slice(0, 120)})`);
      // Never lose the scope: if that column is missing, put it in Notes instead.
      if (bad === OPTIONAL.scope) fields[F.notes] = `${fields[F.notes]}\n\n${fields[bad]}`;
      delete fields[bad];
      continue;
    }
    throw new Error(`Airtable ${r.status}: ${text}`);
  }
  throw new Error('Airtable: too many retries');
}
