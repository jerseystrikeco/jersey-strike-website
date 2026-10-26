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
import { planQuote } from './lib/claude.mjs';
import { priceQuote } from './lib/pricing.mjs';
import { renderQuoteEmail, renderQuoteText, renderFlagsText, quoteSubject } from './lib/quote-render.mjs';
import { triggerSecret } from './lib/trigger.mjs';
import { subjectFor, inquiryMessageId } from './submission-created.mjs';
import { proposalPdf, proposalFilename } from './lib/proposal-pdf.mjs';

// Airtable columns for the draft. Add these to the Inquiries table (see LAUNCH-GUIDE.md).
const DEFAULT_TABLE = 'tblvthafdL2XhCDZt'; // EVENT INQUIRIES + LEADS (same as submission-created)
export const QF = {
  status: process.env.AIRTABLE_STATUS_FIELD || 'Status',
  draft: 'Draft Quote', // Long text
  total: 'Draft Total', // Currency
  flags: 'Quote Notes', // Long text
};

const truckish = (inq) =>
  (inq.vehicles || []).some((v) => /box truck|ft/i.test(v)) || (inq.teamNeeds || []).some((v) => /box truck/i.test(v));

export async function draftQuote(inquiry) {
  const routes = await planRoutes(inquiry, { truck: truckish(inquiry) }).catch((e) => ({ available: false, notes: [`Routing failed: ${e.message}`] }));
  const { plan, docNotes, model } = await planQuote(inquiry, routes);
  const priced = priceQuote(plan, inquiry);
  return { routes, plan, docNotes, priced, model };
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
  const { inquiry, recordId } = body || {};
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
  // Client-ready proposal PDF (Trellis layout) for the admin team to review/forward.
  let attachments;
  try {
    const pdf = await proposalPdf({ inquiry, plan: result.plan, priced: result.priced });
    attachments = [{ filename: proposalFilename(inquiry), content: pdf.toString('base64') }];
  } catch (e) {
    console.error('[quote] proposal PDF failed:', e.message);
  }
  const steps = await Promise.allSettled([
    // Threaded under the original inquiry email (internal only: no client address anywhere).
    sendEmail({ subject: `Re: ${subjectFor(inquiry)}`, html: renderQuoteEmail(args), text: `${quoteSubject(inquiry, result.priced)}\n\n` + renderQuoteText(args) + '\n\n' + renderFlagsText(args),
      headers: { 'In-Reply-To': inquiryMessageId(inquiry), References: inquiryMessageId(inquiry) }, attachments }),
    recordId ? updateAirtable(recordId, args) : Promise.reject(new Error('no Airtable record id (Phase 1 save failed)')),
  ]);
  steps.forEach((r, i) => {
    const step = i === 0 ? 'email' : 'airtable';
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
  };
}

async function updateAirtable(recordId, args) {
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
  let r = await patch(quoteFields(args));
  if (r.status === 422) {
    // A quote column is missing: at least flag the row so it isn't lost.
    const err = await r.text();
    console.error('[quote] Airtable columns missing, saving status only:', err);
    r = await patch({ [QF.status]: 'Needs review' });
  }
  if (!r.ok) throw new Error(`Airtable ${r.status}: ${await r.text()}`);
}
