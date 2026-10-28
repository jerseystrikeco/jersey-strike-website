// Sends website inquiries (and Claude's draft proposal for each) into the Jersey Strike Hub (hub.jerseystrike.com).
// Netlify > Site configuration > Environment variables:
//   HUB_URL            https://hub.jerseystrike.com
//   HUB_INTAKE_TOKEN   the long random token (mark it secret). The hub only lets this token create inquiries
//                      and attach draft proposals; it can't read anything.
// If these aren't set, nothing is sent and the email + Airtable steps carry on as before.
const ready = () => !!(process.env.HUB_URL && process.env.HUB_INTAKE_TOKEN);

async function post(path, body) {
  if (!ready()) return null;
  const r = await fetch(`${process.env.HUB_URL.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.HUB_INTAKE_TOKEN}` },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`hub ${path} ${r.status}: ${data.error || ''}`);
  return data;
}

export async function sendInquiryToHub(q, details, subject) {
  const { raw, lists, ...inquiry } = q;
  return post('/api/intake', { inquiry: { ...inquiry, subject, raw: { full_event_budget: raw?.full_event_budget || '', production_budget: raw?.production_budget || '' } }, details });
}

export async function sendProposalToHub(inquiry, { pdf, filename, total, leadId }) {
  return post('/api/proposal', { leadId, inquiryId: inquiry.id, total, filename, pdfBase64: Buffer.isBuffer(pdf) ? pdf.toString('base64') : pdf, by: 'Claude (website quote)' });
}
