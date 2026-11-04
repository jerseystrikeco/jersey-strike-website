// Sends website inquiries (and Claude's draft proposal for each) into the Jersey Strike Hub (hub.jerseystrike.com).
// Netlify > Site configuration > Environment variables:
//   HUB_URL            https://hub.jerseystrike.com
//   HUB_INTAKE_TOKEN   the long random token (mark it secret). The hub only lets this token create inquiries
//                      and attach draft proposals, and read the public-facing services + rental catalog
//                      (names, sizes, rental prices, photos) for the proposal pages. Nothing else.
// If these aren't set, nothing is sent and the email + Airtable steps carry on as before.
const ready = () => !!(process.env.HUB_URL && process.env.HUB_INTAKE_TOKEN);

async function post(path, body) {
  if (!ready()) throw new Error('not sent: HUB_URL and/or HUB_INTAKE_TOKEN missing in this site\'s Netlify environment variables (add them, then redeploy)');
  const r = await fetch(`${process.env.HUB_URL.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.HUB_INTAKE_TOKEN}` },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`hub ${path} ${r.status}: ${data.error || ''}`);
  return data;
}

// Our services + rental catalog from the hub (Settings wording + Library → Inventory with photos), for the last
// pages of every proposal. Never blocks a quote: on any problem it returns null and the PDF goes out without them
// (the hub then adds the pages itself when the proposal arrives).
export async function fetchCatalog() {
  if (!ready()) return null;
  try {
    const r = await fetch(`${process.env.HUB_URL.replace(/\/$/, '')}/api/catalog`, { headers: { authorization: `Bearer ${process.env.HUB_INTAKE_TOKEN}` }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`hub /api/catalog ${r.status}`);
    const c = await r.json();
    return { services: c.services || [], rentals: (c.rentals || []).map((x) => ({ ...x, img: x.img ? Buffer.from(x.img, 'base64') : null })) };
  } catch (e) { console.error('[quote] catalog not loaded:', e.message); return null; }
}

export async function sendInquiryToHub(q, details, subject) {
  const { raw, lists, ...inquiry } = q;
  return post('/api/intake', { inquiry: { ...inquiry, subject, raw: { full_event_budget: raw?.full_event_budget || '', production_budget: raw?.production_budget || '' } }, details });
}

// plan = Claude's structured quote plan, so the hub's quote editor can open the draft and tweak it.
export async function sendProposalToHub(inquiry, { pdf, filename, total, leadId, plan, version = 1, catalogIncluded = false }) {
  const q = inquiry || {};
  const draft = plan ? { plan, inquiry: { business: q.business || '', contact: q.contact || '', phone: q.phone || '', email: q.email || '', eventDate: q.eventDate || '', venue: q.venue || '', studio: q.studio || '', production: !!q.production } } : undefined;
  return post('/api/proposal', { leadId, inquiryId: q.id, total, filename, pdfBase64: Buffer.isBuffer(pdf) ? pdf.toString('base64') : pdf, by: 'Claude (website quote)', catalogIncluded, ...(draft ? { draft: { ...draft, version } } : {}) });
}
