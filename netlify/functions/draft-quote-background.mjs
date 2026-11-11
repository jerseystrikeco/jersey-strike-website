// Jersey Strike Phase 2: AI-drafted preliminary quotes.
//
// Started by submission-created.mjs after each inquiry. Runs as a Netlify
// *background* function (the "-background" name gives it up to 15 minutes,
// enough for Claude to read PDFs). It:
//   1. Works out drive times/miles (Google Maps; HERE for box trucks).
//   2. Has Claude plan the job: timeline, zones, team, vehicles, flags.
//   3. Prices it line by line with our formula (lib/pricing.mjs).
//   4. Saves the draft to the Airtable row and sets Status = Needs review.
//   5. Emails the draft + analysis to the admin team (never to the client).
//
// Environment variables (Netlify > Site configuration > Environment variables):
//   ANTHROPIC_API_KEY     required
//   GOOGLE_MAPS_API_KEY   recommended (drive times, miles, tolls)
//   HERE_API_KEY          optional (truck-legal routes for box trucks)
//   QUOTE_TO              review email recipients, default INQUIRY_TO or inquire@jerseystrike.com
//   ANTHROPIC_MODEL       optional, default claude-opus-4-5
//   + the Phase 1 variables (RESEND_API_KEY, INQUIRY_FROM, AIRTABLE_*)

import { planRoutes } from './lib/routes.mjs';
import { planQuote, researchLocalEvents } from './lib/claude.mjs';
import { staffCandidates } from './lib/staffing.mjs';
import { priceQuote, followPlaybook } from './lib/pricing.mjs';
import { renderQuoteEmail, renderQuoteText, renderFlagsText, quoteSubject } from './lib/quote-render.mjs';
import { triggerSecret } from './lib/trigger.mjs';
import { subjectFor, inquiryMessageId } from './submission-created.mjs';
import { proposalPdf, proposalFilename } from './lib/proposal-pdf.mjs';
import { sendProposalToHub } from './lib/hub.mjs';

// Airtable columns for the draft. Add these to the Inquiries table (see LAUNCH-GUIDE.md).
const DEFAULT_TABLE = 'tblvthafdL2XhCDZt'; // EVENT INQUIRIES + LEADS (same as submission-created)
export const QF = {
  status: process.env.AIRTABLE_STATUS_FIELD || 'Status',
  draft: 'Draft Quote', // Long text
  total: 'Draft Total', // Currency
  flags: 'Quote Notes', // Long text: everything the reviewer needs (flags, missing info, logistics, reasoning)
  redFlags: 'Red Flags', // Long text: just the red flags + scope/staffing risks, easy to scan in grid view
  crew: 'Suggested Crew', // Long text: suggested team per crew call + backups
};

const truckish = (inq) =>
  (inq.vehicles || []).some((v) => /box truck|ft/i.test(v)) || (inq.teamNeeds || []).some((v) => /box truck/i.test(v));

// Two versions (Alyssa, 11/3/26). Version 1 = the standard plan (our in-code event calendar still applies).
// Then the web search runs for EVERY day of that plan (event day, crew calls, studio days, travel in / back);
// if it finds something that could affect us (traffic, closures, parking, a film shoot, another event at the venue),
// Claude drafts Version 2 planned around it, and both drafts note what was found and the price difference.
export async function draftQuote(inquiry) {
  const routes = await planRoutes(inquiry, { truck: truckish(inquiry) }).catch((e) => ({ available: false, notes: [`Routing failed: ${e.message}`] }));
  const staff = await staffCandidates(inquiry, { hq: routes.hq, venue: inquiry.venue }).catch((e) => ({ available: false, notes: [`Staffing not checked: ${e.message}`] }));
  if (staff.notes?.length) console.log('[quote] staffing:', staff.notes.join(' | '));
  const v1note = { notes: 'Not used in Version 1 (the standard plan). After this plan, the web search checks every day of it; if it finds local happenings, a Version 2 is drafted around them.' };
  const { plan, docNotes, model } = await planQuote(inquiry, routes, staff, v1note);
  const research = await researchLocalEvents(inquiry, plan).catch((e) => ({ notes: '', error: e.message }));
  if (research.error) console.log('[quote] local event research:', research.error);
  const ctx = { otherEvents: staff?.calendar?.other_events_same_day || [], hqName: routes?.hq?.name || '', groupByPhase: true, inquiredOn: new Date().toISOString() };
  // Every draft follows the playbook: timing minimums, unload step, strike kits, holiday / short-notice premiums,
  // 2+ on night or ladder calls, fab ballast. Fixed in code, listed so the admin team sees what changed.
  const autoFix = (pl) => { const fixed = followPlaybook(pl, inquiry, ctx); if (fixed.length) pl.logistics_notes = [...(pl.logistics_notes || []), `Playbook rules applied to this draft: ${fixed.join(' | ')}`]; };
  autoFix(plan);
  plan.local_research = research.notes || '';
  const found = !!(research.notes && !research.none);
  let v2 = null;
  if (found) {
    const bullets = research.notes.split('\n').map((x) => x.trim()).filter((x) => /^[-•*]/.test(x)).map((x) => x.replace(/^[-•*]\s*/, ''));
    const hits = bullets.length ? bullets : [research.notes];
    try {
      const r2 = await planQuote(inquiry, routes, staff, { notes: `${research.notes}

VERSION 2: this is the second draft. Version 1 was planned without these findings. Plan this version AROUND every finding above that could affect the job (any crew-call, studio or travel day): add the buffer to every affected drive leg and move departures earlier, plan the approach around closures (other bridge/tunnel/avenue, truck-legal), plan parking and loading (dock, side street, garage, longer carry), and add a parking/garage line if we'd pay for one. Start "assumptions" with one line per finding saying exactly what you changed for it ("Version 2: <finding> -> <change>"). If a finding can't affect this job, say so in that line and change nothing for it.` });
      v2 = { plan: r2.plan, docNotes: r2.docNotes, model: r2.model };
      v2.plan.option_label = 'Version 2';
      v2.plan.local_research = research.notes;
      autoFix(v2.plan);
      v2.priced = priceQuote(v2.plan, inquiry, ctx);
      v2.hits = hits;
    } catch (e) {
      console.error('[quote] Version 2 draft failed:', e.message);
      plan.red_flags = [...(plan.red_flags || []), `Web search found possible local happenings, but the Version 2 draft failed (${e.message}). Plan around these by hand: ${hits.join(' | ')}`];
    }
  }
  const priced = priceQuote(plan, inquiry, ctx);
  if (v2) {
    const diff = Math.round((v2.priced.total - priced.total) * 100) / 100;
    const money = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    plan.option_label = 'Version 1';
    plan.red_flags = [`VERSION 1 of 2 (standard plan). The web search found ${v2.hits.length} possible local happening(s); Version 2 (${money(v2.priced.total)}, ${diff >= 0 ? '+' : ''}${money(diff)}) is planned around them and comes as a separate email: ${v2.hits.join(' | ')}`, ...(plan.red_flags || [])];
    v2.plan.red_flags = [`VERSION 2 of 2: planned around local happenings the web search found (Version 1 standard plan: ${money(priced.total)}; this one ${diff >= 0 ? '+' : ''}${money(diff)}). Found: ${v2.hits.join(' | ')}`, ...(v2.plan.red_flags || [])];
  } else if (!research.error && research.notes) {
    plan.red_flags = [...(plan.red_flags || []), `Local happenings web search: ${research.notes}`];
  }
  return { routes, plan, docNotes, priced, model, staff, v2 };
}

export default async (req) => {
  const secret = triggerSecret();
  let body;
  try {
    body = JSON.parse((await req.text()) || '{}');
  } catch (e) {
    console.error('[quote] stopped: bad JSON body:', e.message);
    return new Response('Bad request', { status: 400 });
  }
  // The secret arrives as a header, with a copy in the body in case the header is dropped.
  const got = req.headers.get('x-quote-secret') || body?.secret || '';
  console.log(`[quote] invoked: method=${req.method}, key set=${!!process.env.ANTHROPIC_API_KEY}, header=${!!req.headers.get('x-quote-secret')}, body secret=${!!body?.secret}, inquiry=${!!body?.inquiry}`);
  if (!secret) {
    console.error('[quote] stopped: ANTHROPIC_API_KEY is not available to this function');
    return new Response('Forbidden', { status: 403 });
  }
  if (got !== secret) {
    console.error(`[quote] stopped: secret mismatch (got ${got.slice(0, 6) || 'nothing'}…, expected ${secret.slice(0, 6)}…)`);
    return new Response('Forbidden', { status: 403 });
  }
  const { inquiry, recordId, hubLeadId } = body || {};
  if (!inquiry) {
    console.error('[quote] stopped: no inquiry in body');
    return new Response('Bad request', { status: 400 });
  }
  console.log(`[quote] drafting for ${inquiry.business || inquiry.contact || 'inquiry'} (record ${recordId || 'none'}), model ${process.env.ANTHROPIC_MODEL || 'default'}`);

  const base = process.env.AIRTABLE_BASE_ID;
  const table = process.env.AIRTABLE_TABLE || DEFAULT_TABLE;
  const recordUrl = base ? `https://airtable.com/${base}${/^tbl/.test(table) ? `/${table}${recordId ? `/${recordId}` : ''}` : ''}` : '';

  let result;
  try {
    result = await draftQuote(inquiry);
  } catch (e) {
    console.error('[quote] draft failed:', e.message);
    await sendEmail({
      subject: `Draft quote failed: ${inquiry.business || inquiry.contact || 'new inquiry'}`,
      text: `Claude couldn't draft a quote for this inquiry, so it needs a manual quote.\n\nError: ${e.message}\n\n${recordUrl}`,
    }).catch((err) => console.error('[quote] failure email failed:', err.message));
    return new Response('Failed', { status: 500 });
  }

  const args = { inquiry, ...result, recordUrl };
  const v2 = result.v2;
  const v2File = () => proposalFilename(inquiry).replace(/\.pdf$/i, ' - Version 2.pdf');
  const v2args = v2 ? { inquiry, ...result, plan: v2.plan, priced: v2.priced, docNotes: v2.docNotes, model: v2.model, recordUrl } : null;
  // Client-ready proposal PDF (Trellis layout) for the admin team to review/forward.
  let attachments; let pdfBytes = null; let pdf2 = null;
  try {
    const pdf = await proposalPdf({ inquiry, plan: result.plan, priced: result.priced });
    pdfBytes = pdf;
    attachments = [{ filename: proposalFilename(inquiry), content: pdf.toString('base64') }];
  } catch (e) {
    console.error('[quote] proposal PDF failed:', e.message);
  }
  if (v2) pdf2 = await proposalPdf({ inquiry, plan: v2.plan, priced: v2.priced }).catch((e) => { console.error('[quote] Version 2 PDF failed:', e.message); return null; });
  const steps = await Promise.allSettled([
    // Threaded under the original inquiry email (internal only: no client address anywhere).
    sendEmail({ subject: `Re: ${subjectFor(inquiry)}`, html: renderQuoteEmail(args), text: `${quoteSubject(inquiry, result.priced)}\n\n` + renderQuoteText(args) + '\n\n' + renderFlagsText(args),
      headers: { 'In-Reply-To': inquiryMessageId(inquiry), References: inquiryMessageId(inquiry) }, attachments }),
    recordId ? updateAirtable(recordId, args) : Promise.reject(new Error('no Airtable record id (Phase 1 save failed)')),
    // The same draft PDF + total on the lead in the hub (the total is owner-only there).
    pdfBytes ? sendProposalToHub(inquiry, { pdf: pdfBytes, filename: proposalFilename(inquiry), total: result.priced.total, leadId: hubLeadId, plan: result.plan }) : Promise.reject(new Error('no proposal PDF')),
    // Version 2 (planned around local happenings): its own email in the same thread + its own draft on the lead.
    v2 ? sendEmail({ subject: `Re: ${subjectFor(inquiry)} · Version 2 (planned around local happenings)`, html: renderQuoteEmail(v2args), text: `${quoteSubject(inquiry, v2.priced)} · Version 2\n\n` + renderQuoteText(v2args) + '\n\n' + renderFlagsText(v2args),
      headers: { 'In-Reply-To': inquiryMessageId(inquiry), References: inquiryMessageId(inquiry) }, attachments: pdf2 ? [{ filename: v2File(), content: pdf2.toString('base64') }] : undefined }) : Promise.resolve('no version 2'),
    v2 && pdf2 ? sendProposalToHub(inquiry, { pdf: pdf2, filename: v2File(), total: v2.priced.total, leadId: hubLeadId, plan: v2.plan, version: 2 }) : Promise.resolve('no version 2'),
  ]);
  steps.forEach((r, i) => {
    const step = ['email', 'airtable', 'hub', 'email v2', 'hub v2'][i];
    if (r.status === 'rejected') console.error(`[quote] ${step} failed:`, r.reason?.message || r.reason);
    else console.log(`[quote] ${step} ok`);
  });
  console.log(`[quote] ${inquiry.business}: ${result.priced.total} (${result.model})`);
  return new Response('OK');
};

async function sendEmail({ subject, html, text, headers, attachments }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const to = (process.env.QUOTE_TO || process.env.INQUIRY_TO || 'inquire@jerseystrike.com').split(',').map((x) => x.trim()).filter(Boolean)
    .filter((x) => /@jerseystrike\.com$/i.test(x)); // internal tool: jerseystrike.com addresses only
  if (!to.length) throw new Error('No @jerseystrike.com recipient configured');
  // No reply_to: replying must never send internal pricing to the client.
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.INQUIRY_FROM || 'Jersey Strike Website <inquiries@jerseystrike.com>', to, subject, ...(html ? { html } : {}), text, ...(headers ? { headers } : {}), ...(attachments?.length ? { attachments } : {}) }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
}

export function quoteFields(args) {
  return {
    [QF.status]: 'Needs review',
    [QF.draft]: renderQuoteText(args).slice(0, 95000),
    [QF.total]: args.priced.total,
    [QF.flags]: renderFlagsText(args).slice(0, 95000),
    [QF.redFlags]: redFlagsText(args).slice(0, 95000),
    [QF.crew]: crewText(args).slice(0, 95000),
  };
}

function redFlagsText({ plan, priced }) {
  const staffFlags = (plan.staffing || []).flatMap((s) => (s.flags || []).map((f) => `Staffing (${s.shift || 'crew'}): ${f}`));
  return [...(priced.grandfathered ? [priced.grandfathered] : []), ...(plan.red_flags || []), ...priced.warnings, ...staffFlags]
    .map((x) => `- ${x}`).join('\n') || 'None';
}

function crewText({ plan, staff }) {
  if (!plan.staffing?.length) return staff?.available === false ? `Not suggested: ${(staff.notes || []).join(' ')}` : 'Not suggested.';
  const cal = staff?.calendar;
  const head = cal ? [`${cal.peak_day ? 'PEAK DAY. ' : ''}${cal.other_events_same_day.length} other event(s) that day; ${cal.already_booked_that_day} of ${cal.active_staff} active staff already booked.`, ''] : [];
  return [...head, ...plan.staffing.flatMap((s) => [
    `${s.shift || 'Crew'}:`,
    ...(s.crew || []).map((c) => `- ${c.name}${c.role ? ` (${c.role})` : ''}${c.why ? `: ${c.why}` : ''}`),
    ...(s.backups?.length ? [`Backups: ${s.backups.join(', ')}`] : []),
    '',
  ])].join('\n').trim();
}

export async function updateAirtable(recordId, args) {
  const token = process.env.AIRTABLE_TOKEN;
  const base = process.env.AIRTABLE_BASE_ID;
  const table = process.env.AIRTABLE_TABLE || DEFAULT_TABLE;
  if (!token || !base) throw new Error('AIRTABLE_TOKEN or AIRTABLE_BASE_ID is not set');
  const patch = (fields) =>
    fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}/${recordId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields, typecast: true }),
    });
  // If a column doesn't exist yet, drop just that one and save the rest.
  let fields = quoteFields(args);
  let r = await patch(fields);
  for (let i = 0; r.status === 422 && i < 6; i++) {
    const err = await r.text();
    const missing = err.match(/Unknown field name: \\?"([^"\\]+)/)?.[1];
    if (!missing || !(missing in fields)) {
      console.error('[quote] Airtable rejected the draft, saving status only:', err);
      r = await patch({ [QF.status]: 'Needs review' });
      break;
    }
    console.error(`[quote] Airtable column "${missing}" is missing; saved the rest. Add it as a Long text column to keep it.`);
    const { [missing]: _drop, ...rest } = fields;
    fields = rest;
    r = await patch(fields);
  }
  if (!r.ok) throw new Error(`Airtable ${r.status}: ${await r.text()}`);
}
