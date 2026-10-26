// Renders the draft quote: an HTML email for the admin team and a plain-text
// version saved to the Airtable row.
import { fmt, RATES } from './pricing.mjs';

// Logo is hosted on the Netlify site (jerseystrike.com itself is on Showit).
const SITE = (process.env.URL && !/jerseystrike\.com/.test(process.env.URL) ? process.env.URL : 'https://jersey-strike.netlify.app').replace(/\/$/, '');
export const FOOTER =
  'This is a preliminary estimate based on the information provided. Additional hours or team members will be billed if the scope changes, including timeline changes or extensions, collection list changes or additional delivery locations.';

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pct = (p) => `${Math.round(p * 1000) / 10}%`;

function prettyDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return iso || 'Date TBD';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function quoteSubject(q, priced) {
  const when = prettyDate(q.eventDate).replace(/^\w+, /, '');
  const fab = priced.fabs?.length ? '[Alyssa: check fab with Larry] ' : '';
  return `${fab}Draft quote ${fmt(priced.total)}: ${q.business || q.contact || 'New inquiry'} · ${when}`;
}

function fabSection(priced) {
  if (!priced.fabs?.length) return '';
  return priced.fabs.map((f) => `<div style="margin:0 0 14px;padding:12px;border:1px solid #D8B46A;border-radius:10px;background:#FBF4E2">
<div style="font-weight:700">${esc(f.label)} · ${fmt(f.amount)} <span style="font-weight:400;color:#7A6F55">(${esc(f.confidence)} confidence)</span></div>
${f.description ? `<div style="margin-top:4px">${esc(f.description)}</div>` : ''}
<div style="margin-top:6px;font-size:13px;color:#5C574A">Materials ~${fmt(f.materials_cost)}${f.materials_breakdown ? ` (${esc(f.materials_breakdown)})` : ''} · ${esc(f.shop_hours)} shop hrs${f.comparable ? ` · Comparable: ${esc(f.comparable)}` : ''}</div>
${f.flags?.length ? `<div style="margin-top:8px"><b>My flags:</b><ul style="margin:4px 0 0;padding-left:18px">${f.flags.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
${f.questions_for_larry?.length ? `<div style="margin-top:8px"><b>Questions for Larry:</b><ul style="margin:4px 0 0;padding-left:18px">${f.questions_for_larry.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
${f.reusable ? `<div style="margin-top:8px"><b>Keep as a rental?</b> ${esc(f.reusable)}</div>` : ''}
</div>`).join('') + '<div style="font-size:13px;color:#5C574A">Let me know what you and Larry think. Reply with corrections and I\'ll fold them into future fab estimates.</div>';
}

function staffHtml(plan, staff, esc, list) {
  if (!plan.staffing?.length) return `<span style="color:#A8A391">${esc(staff?.available === false ? (staff.notes || []).join(' ') || 'Staff list not available.' : 'No crew suggested.')}</span>`;
  const cal = staff?.calendar;
  const top = cal ? `<div style="margin-bottom:8px;color:#5C574A">${cal.peak_day ? '<b style="color:#8A2E1F">PEAK DAY.</b> ' : ''}${cal.other_events_same_day.length} other event(s) that day; ${cal.already_booked_that_day} of ${cal.active_staff} active staff already booked.</div>` : '';
  return top + plan.staffing.map((s) => `<div style="margin:0 0 10px"><b>${esc(s.shift || 'Crew')}</b>${list((s.crew || []).map((c) => ({ html: `<b>${esc(c.name)}</b>${c.role ? ` · ${esc(c.role)}` : ''}${c.why ? `: ${esc(c.why)}` : ''}` })))}${s.backups?.length ? `<div style="color:#5C574A">Backups: ${esc(s.backups.join(', '))}</div>` : ''}${s.flags?.length ? list(s.flags, '#8A2E1F') : ''}</div>`).join('');
}

export function renderQuoteEmail({ inquiry: q, plan, priced, routes, docNotes = [], recordUrl = '', staff = null }) {
  const gold = '#9A7838';
  const section = (title, body) =>
    `<tr><td style="padding:22px 28px 6px"><div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;font-weight:700;color:${gold}">${esc(title)}</div>` +
    `<div style="border-top:1px solid #E2D9C4;margin-top:8px;padding-top:10px;font-size:14px;line-height:1.55">${body}</div></td></tr>`;
  // Items are escaped unless already-built HTML is passed as { html }.
  const list = (arr, color = '#0A100D') =>
    arr?.length ? `<ul style="margin:0;padding-left:18px;color:${color}">${arr.map((x) => `<li style="margin:0 0 6px">${x && x.html ? x.html : esc(x)}</li>`).join('')}</ul>` : '<span style="color:#A8A391">None</span>';
  const td = 'padding:7px 6px;border-bottom:1px solid #EFE9DC;vertical-align:top';
  const money = (n, bold) => `<td style="${td};text-align:right;white-space:nowrap${bold ? ';font-weight:700' : ''}">${fmt(n)}</td>`;

  const lineRows = priced.lines.map((l) =>
    `<tr><td style="${td}"><div style="font-weight:700">${esc(l.label)}</div><div style="color:#5C574A;font-size:12px">${esc(l.math)}${l.roles ? ` · ${esc(l.roles)}` : ''}</div></td>${money(l.amount)}</tr>`).join('');
  const chargeRows = priced.charges.map((c) =>
    `<tr><td style="${td}"><div style="font-weight:700">${esc(c.label)}</div><div style="color:#5C574A;font-size:12px">${esc(c.math)}</div></td>${money(c.amount)}</tr>`).join('');
  const totals =
    `<tr><td style="${td};text-align:right">Items subtotal</td>${money(priced.itemsSubtotal)}</tr>` + chargeRows +
    `<tr><td style="${td};text-align:right;font-weight:700">Subtotal</td>${money(priced.subtotal, true)}</tr>` +
    `<tr><td style="${td};text-align:right">Admin fee ${pct(priced.adminPct)}</td>${money(priced.admin)}</tr>` +
    (priced.discount ? `<tr><td style="${td};text-align:right">${esc(priced.discount.label)} −${pct(priced.discount.pct)}</td>${money(priced.discount.amount)}</tr>` : '') +
    `<tr><td style="padding:10px 6px;text-align:right;font-size:16px;font-weight:700">Total</td><td style="padding:10px 6px;text-align:right;font-size:16px;font-weight:700">${fmt(priced.total)}</td></tr>`;

  const timeline = (plan.shifts || []).map((s) =>
    `<div style="margin:0 0 14px"><div style="font-weight:700">${esc([s.date, s.label].filter(Boolean).join(' · '))}</div>` +
    `<div style="color:#5C574A;font-size:13px">JS Team of ${esc(s.team_size)}${s.roles ? ` (${esc(s.roles)})` : ''}</div>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:4px;font-size:13px">${(s.steps || []).map((st) =>
      `<tr><td style="padding:1px 12px 1px 0;white-space:nowrap;color:${gold}">${esc(st.time)}</td><td style="padding:1px 0">${esc(st.label)}</td></tr>`).join('')}</table></div>`).join('');

  const zones = (plan.zones || []).map((z) =>
    `<tr><td style="${td};font-weight:700">${esc(z.name)}</td><td style="${td}">${esc(z.tasks || '')}${z.notes ? `<div style="color:#5C574A;font-size:12px">${esc(z.notes)}</div>` : ''}</td><td style="${td};text-align:center">${esc(z.team)}</td></tr>`).join('');

  const uhaul = priced.uhauls.map((u) =>
    `<div style="margin-bottom:8px"><b>${esc(u.label)}</b> (${u.days} days, ${u.miles} mi). Our cost: ${esc(u.costMath)}<br>` +
    `Method A ${esc(u.a.math)} = <b>${fmt(u.a.amount)}</b> · Method B ${esc(u.b.math)} = <b>${fmt(u.b.amount)}</b> · Floor ${fmt(u.floor)}<br>` +
    `<span style="color:#5C574A">${esc(u.why)}</span></div>`).join('');

  const legs = routes?.available
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px">${routes.legs.map((l) =>
        `<tr><td style="${td}">${esc(l.from)} → ${esc(l.to)}</td><td style="${td};white-space:nowrap">${l.miles} mi · ${l.minutes} min${l.truckMinutes ? `<br><span style="color:#5C574A">truck: ${l.truckMiles} mi · ${l.truckMinutes} min</span>` : ''}</td></tr>`).join('')}</table>`
    : '';

  const flags = [...(priced.grandfathered ? [priced.grandfathered] : []), ...(plan.red_flags || []), ...priced.warnings];
  const similar = (plan.similar_jobs || []).map((j) => ({ html: `<b>${esc(j.job)}</b>${j.charged ? ` (${esc(j.charged)})` : ''}: ${esc(j.why)}` }));
  const asks = plan.client_questions?.length
    ? `<div style="margin-top:10px;color:#5C574A">Questions to send the client:</div>${list(plan.client_questions)}` : '';
  const mailto = q.email ? `mailto:${esc(q.email)}?subject=${encodeURIComponent(`Your Jersey Strike quote: ${prettyDate(q.eventDate)}`)}` : '';
  const btn = (href, text, dark) => href
    ? `<a href="${href}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 18px;border-radius:999px;${dark ? 'background:#0A100D;color:#F4EEDF' : 'border:1px solid #0A100D;color:#0A100D'};text-decoration:none;font-size:14px;font-weight:700">${text}</a>` : '';

  return `<!doctype html><html><body style="margin:0;padding:0;background:#EFE9DC">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EFE9DC;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:#FFFFFF;border-radius:14px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#0A100D">
<tr><td style="background:#0A100D;padding:22px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td><img src="${SITE}/images/jersey-strike-logo.png" width="120" alt="Jersey Strike" style="display:block;border:0"></td>
<td align="right" style="color:#D8B46A;font-size:11px;letter-spacing:.18em;text-transform:uppercase;font-weight:700">Draft quote · internal</td></tr></table></td></tr>
<tr><td style="background:#FBF4E2;padding:10px 28px;font-size:12px;color:#7A6F55;border-bottom:1px solid #E2D9C4">AI-drafted for admin review. Not sent to the client. Check the timeline, team and flags before quoting.</td></tr>
<tr><td style="padding:24px 28px 4px">
<div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.2">${esc(q.business || q.contact || 'New inquiry')}</div>
<div style="margin-top:6px;font-size:15px;color:#5C574A">${esc(prettyDate(q.eventDate))} · ${esc(q.venue || 'Venue TBD')}</div>
<div style="margin-top:14px;font-size:32px;font-weight:700">${fmt(priced.total)}</div>
<div style="font-size:13px;color:#5C574A">${esc((plan.shifts || []).length)} crew calls · up to ${Math.max(0, ...(plan.shifts || []).map((s) => Number(s.team_size) || 0))} people · ${esc(plan.job_type?.replace('_', ' ') || '')}${routes?.hq ? ` · from ${esc(routes.hq.name)} HQ` : ''}</div>
<div style="margin-top:14px">${btn(recordUrl, 'Open in Airtable', true)}${btn(mailto, `Email ${esc(q.contact || 'client')}`)}</div>
</td></tr>
${section('Summary', esc(plan.summary) + '<div style="margin-top:8px;font-size:13px;color:#5C574A">Client-ready proposal PDF (Trellis layout) attached: review, then forward to the client yourself.</div>')}
${section('Quote breakdown', `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">${lineRows}${totals}</table><div style="margin-top:10px;font-size:12px;color:#7A6F55;font-style:italic">${esc(FOOTER)}</div>`)}
${priced.margin ? section('Margin check (internal)', `<div style="font-size:15px"><b>${priced.margin.pct}% gross margin</b> · ${esc(priced.margin.verdict)} (target ${priced.margin.target}%)</div>
<div style="margin-top:4px;color:#5C574A">Revenue ${fmt(priced.total)} − est. cost ${fmt(priced.margin.cost)} = ${fmt(priced.margin.gp)} gross profit.${priced.margin.pct < priced.margin.target ? ` ${fmt(priced.margin.neededTotal)} would hit 50%.` : ''}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;font-size:12px;color:#5C574A">${priced.margin.costs.map((c) => `<tr><td style="padding:2px 0">${esc(c.what)}</td><td style="padding:2px 0;text-align:right">${fmt(c.amount)}</td></tr>`).join('')}</table>
<div style="margin-top:6px;font-size:12px;color:#7A6F55">Team pay $30/hr ($45 major holidays) incl. ~1 hr home↔HQ drive per person per call; fuel $0.70/mi; pass-throughs at cost. Excludes payroll taxes/insurance (covered by base fee + admin).</div>`) : ''}
${priced.fabs?.length ? section('Fabrication: Alyssa, check with Larry', fabSection(priced)) : ''}
${section('Red flags', list(flags, '#8A2E1F'))}
${section('Missing info', list(plan.missing_info) + asks)}
${section('Timeline', timeline || '<span style="color:#A8A391">None</span>')}
${zones ? section('Zones + team', `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px"><tr><td style="${td};color:${gold}">Zone</td><td style="${td};color:${gold}">Tasks</td><td style="${td};color:${gold};text-align:center">Team</td></tr>${zones}</table>`) : ''}
${section('Logistics', list([...(plan.logistics_notes || []), ...(routes?.notes || [])]) + legs + (uhaul ? `<div style="margin-top:12px">${uhaul}</div>` : ''))}
${section('Reasoning', list([...(plan.reasoning || []), ...(plan.base_fee_note ? [`Base fee: ${plan.base_fee_note}`] : [])]))}
${plan.client_history || plan.lean_option ? section('Client history', `${esc(plan.client_history || '')}${plan.lean_option ? `<div style="margin-top:8px"><b>Leaner option:</b> ${esc(plan.lean_option)}</div>` : ''}`) : ''}
${plan.staffing?.length || staff ? section('Suggested crew (internal)', staffHtml(plan, staff, esc, list)) : ''}
${section('Similar past jobs', list(similar))}
${plan.task_list?.length ? section('Task list', list(plan.task_list)) : ''}
${section('Inquiry', `<b>Contact:</b> ${esc(q.contact)} · ${esc(q.email)} · ${esc(q.phone)}<br><b>Studio:</b> ${esc(q.studio || 'Not provided')}<br><b>Services:</b> ${esc((q.services || []).join(', '))}<br><b>Team size (theirs):</b> ${esc(q.teamSize || '—')} · <b>Needs:</b> ${esc((q.teamNeeds || []).join(', '))}<br><b>Vehicles (theirs):</b> ${esc((q.vehicles || []).join(', '))}<br><b>Scope:</b> ${esc(q.scope).replace(/\n/g, '<br>')}<br><b>Documents:</b> ${(q.files || []).map((f) => `<a href="${esc(f.url)}" style="color:#0A100D">${esc(f.filename)}</a>`).join(', ') || 'None'}${docNotes.length ? `<div style="color:#8A2E1F;margin-top:6px">${docNotes.map(esc).join('<br>')}</div>` : ''}`)}
<tr><td style="padding:22px 28px;font-size:12px;color:#7A6F55;border-top:1px solid #E2D9C4">Rates: ${fmt(RATES.laborPerHour)}/hr labor · ${fmt(RATES.baseFeePerVenueDay)} base per venue day · ${pct(RATES.adminFeePct)} admin. Saved to the Inquiries tab in Airtable with Status = Needs review.</td></tr>
</table></td></tr></table></body></html>`;
}

export function renderQuoteText({ inquiry: q, plan, priced, routes }) {
  const L = [];
  L.push(`DRAFT QUOTE (AI, for admin review): ${fmt(priced.total)}`, '', plan.summary || '', '');
  L.push('QUOTE BREAKDOWN');
  for (const l of priced.lines) L.push(`- ${l.label}: ${fmt(l.amount)}  (${l.math}${l.roles ? `; ${l.roles}` : ''})`);
  L.push(`Items subtotal: ${fmt(priced.itemsSubtotal)}`);
  for (const c of priced.charges) L.push(`- ${c.label}: ${fmt(c.amount)}  (${c.math})`);
  L.push(`Subtotal: ${fmt(priced.subtotal)}`, `Admin fee ${pct(priced.adminPct)}: ${fmt(priced.admin)}`);
  if (priced.discount) L.push(`${priced.discount.label} -${pct(priced.discount.pct)}: ${fmt(priced.discount.amount)}`);
  L.push(`TOTAL: ${fmt(priced.total)}`, '', FOOTER, '');
  L.push('TIMELINE');
  for (const s of plan.shifts || []) {
    L.push(`${[s.date, s.label].filter(Boolean).join(' · ')}: JS Team of ${s.team_size}${s.roles ? ` (${s.roles})` : ''}`);
    for (const st of s.steps || []) L.push(`  ${st.time} - ${st.label}`);
  }
  if (plan.zones?.length) { L.push('', 'ZONES'); for (const z of plan.zones) L.push(`- ${z.name} (${z.team}): ${z.tasks || ''}`); }
  if (priced.margin) L.push('', `MARGIN: ${priced.margin.pct}% gross (${priced.margin.verdict}; target 50%). Cost ~${fmt(priced.margin.cost)}${priced.margin.pct < 50 ? `; ${fmt(priced.margin.neededTotal)} hits 50%` : ''}.`);
  if (priced.uhauls.length) { L.push('', 'U-HAUL'); for (const u of priced.uhauls) L.push(`- ${u.label}: A ${fmt(u.a.amount)} vs B ${fmt(u.b.amount)}. ${u.why}`); }
  if (routes?.hq) L.push('', `Routing: ${routes.hq.name} HQ, ${routes.miles} mi / ${routes.minutes} min loop.`);
  if (plan.staffing?.length) {
    L.push('', 'SUGGESTED CREW (internal)');
    for (const st of plan.staffing) {
      L.push(`${st.shift || 'Crew'}:`);
      for (const c of st.crew || []) L.push(`  - ${c.name}${c.role ? ` (${c.role})` : ''}${c.why ? `: ${c.why}` : ''}`);
      if (st.backups?.length) L.push(`  Backups: ${st.backups.join(', ')}`);
      for (const f of st.flags || []) L.push(`  ! ${f}`);
    }
  }
  if (plan.task_list?.length) { L.push('', 'TASK LIST'); for (const t of plan.task_list) L.push(`- ${t}`); }
  return L.join('\n');
}

export function renderFlagsText({ plan, priced, routes, docNotes = [] }) {
  const sec = (t, arr) => (arr?.length ? [`${t}:`, ...arr.map((x) => `- ${x}`), ''] : []);
  return [
    ...sec('RED FLAGS', [...(priced.grandfathered ? [priced.grandfathered] : []), ...(plan.red_flags || []), ...priced.warnings]),
    ...sec('MISSING INFO', plan.missing_info),
    ...sec('ASK THE CLIENT', plan.client_questions),
    ...sec('LOGISTICS', [...(plan.logistics_notes || []), ...(routes?.notes || []), ...docNotes]),
    ...sec('REASONING', [...(plan.reasoning || []), ...(plan.base_fee_note ? [`Base fee: ${plan.base_fee_note}`] : [])]),
    ...sec('FABRICATION (check with Larry)', (priced.fabs || []).flatMap((f) => [
      `${f.label}: ${fmt(f.amount)} (${f.confidence} confidence). Materials ~${fmt(f.materials_cost)}, ${f.shop_hours} shop hrs.${f.comparable ? ` Comparable: ${f.comparable}.` : ''}`,
      ...(f.flags || []).map((x) => `  flag: ${x}`), ...(f.questions_for_larry || []).map((x) => `  ask Larry: ${x}`), ...(f.reusable ? [`  rental later: ${f.reusable}`] : [])])),
    ...sec('CLIENT HISTORY', [plan.client_history, plan.lean_option && `Leaner option: ${plan.lean_option}`].filter(Boolean)),
    ...sec('SIMILAR PAST JOBS', (plan.similar_jobs || []).map((j) => `${j.job}${j.charged ? ` (${j.charged})` : ''}: ${j.why}`)),
  ].join('\n').trim();
}
