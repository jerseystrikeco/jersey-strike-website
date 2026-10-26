// Client-facing proposal in the Jersey Strike Trellis layout (cover, intro, how we build,
// event details, timeline + task list, quote breakdown, what happens next, best practices).
// Rendered to PDF for the admin team to review/forward. Never sent to clients automatically.
import { fmt } from './pricing.mjs';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (n) => fmt(n).replace('$', '');
const prettyLong = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return iso || 'Date TBD';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};
const short = (iso) => { const m = (iso || '').match(/^\d{2}(\d{2})-(\d{2})-(\d{2})$/); return m ? `${+m[2]}/${+m[3]}/${m[1]}` : iso || ''; };

export function proposalHtml({ inquiry: q, plan, priced, logoDataUri = '', fontCss = '', createdDate = new Date() }) {
  const created = createdDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
  const hdr = `<div class="hdr">${logoDataUri ? `<img class="logo" src="${logoDataUri}">` : '<div class="wm">JERSEY STRIKE</div>'}<div class="tag">EVENT STAFFING + LOGISTICS</div></div>`;
  const title = `${short(q.eventDate)} | ${q.business || q.contact} | ${(q.venue || '').split(',')[0]}`;
  const tl = (plan.shifts || []).map((s) => `${esc([s.label, s.date].filter(Boolean).join(' – '))}<br>JS Team of ${esc(s.team_size)}${s.roles ? ` (${esc(s.roles)})` : ''}<br>${(s.steps || []).map((st) => `${esc(st.time)} - ${esc(st.label)}`).join('<br>')}<br>${priced.lines.find((l) => l.label.startsWith(s.label))?.hours ?? ''}hrs`).join('<br><br>');
  const desc = (l) => l.team && l.hours
    ? [`TEAM OF ${l.team}${l.roles ? ` (${l.roles})` : ''}`, `${l.hours} hours @ ${l.rate}/hour`]
    : [l.math.replace(/\(estimate; Larry to confirm\)/, '')];
  const items = priced.lines.map((l) => `<div class="item"><div class="q">1</div><div><b>${esc(l.section === 'Labor' ? l.label.toUpperCase().replace(/ \| (\w+ \d+\/\d+\/\d+)$/i, (m) => m.replace(/^.*?\| /, ' | ').replace(/[A-Z]+/g, (w) => w[0] + w.slice(1).toLowerCase())) : l.label)} &nbsp;| &nbsp;${num(l.amount)}</b><br>${desc(l).map(esc).join('<br>')}</div></div><hr class="sep">`).join('');
  const charges = priced.charges.map((c) => `<tr><td class="bs">${c.label === 'Base Service' ? 'Jersey Strike aims to be as prepared as possible for every event. Our base service fee takes into account the costs associated with operating an efficient and reliable niche staffing company including but not limited to: insurance needs, vehicle maintenance, upgraded supplies &amp; tooling, as well as internal management and production systems that make for a seamless communicative and operational experience with Jersey Strike Co.' : ''}</td><td class="lab">${esc(c.label)}<br><span class="sm">${esc(c.math)}</span></td><td class="v">${num(c.amount)}</td></tr>`).join('');
  const chargeSum = priced.charges.reduce((a, c) => a + c.amount, 0);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss}
@page { size: Letter; margin: 0.45in 0.6in 0.7in; }
body { font-family: Roboto, Helvetica, Arial, sans-serif; color:#111; font-size:12pt; line-height:1.5; margin:0; }
.hdr { text-align:center; border-bottom:1px solid #9a9a9a; padding:6px 0 18px; margin-bottom:34px; }
.logo { width:330px; } .wm { font-size:44pt; font-weight:900; letter-spacing:.02em; } .tag { letter-spacing:.42em; font-size:9.5pt; font-weight:700; margin-top:6px; }
.page { page-break-after:always; }
.date { text-align:center; font-size:17pt; margin-top:90px; } .cv hr { width:80%; border:0; border-top:1px solid #e2dcc8; margin:22px auto; }
.c { text-align:center; } .c1 { font-size:14.5pt; } .c2 { font-size:12.5pt; } .c3 { font-size:9.5pt; line-height:1.6; }
.intro { text-align:center; font-size:11.5pt; } h3 { font-size:12.5pt; margin:0 0 16px; } h2 { font-size:17pt; margin:0 0 4px; }
.it { font-style:italic; margin:0 0 0 40px; font-size:11.5pt; } hr.div { width:68%; border:0; border-top:1px solid #e2dcc8; margin:24px auto 30px; }
.qb { font-size:17pt; font-weight:700; margin:10px 0 30px; }
.item { display:flex; margin-left:40px; page-break-inside:avoid; font-size:11.5pt; } .item .q { width:26px; flex:none; }
hr.sep { width:68%; border:0; border-top:1px solid #e8e8e8; margin:26px auto; }
table.tot { width:100%; border-collapse:collapse; font-size:11.5pt; page-break-inside:avoid; } table.tot td { padding:2px 6px; vertical-align:top; }
.lab { text-align:right; white-space:nowrap; } .v { text-align:right; width:80px; } .b { font-weight:700; } .bs { text-align:right; font-size:11pt; width:60%; } .sm { font-size:9pt; color:#555; font-weight:400; }
.note { font-size:10.5pt; margin:22px 0 0 40px; } .bp li { text-transform:uppercase; font-size:10.5pt; margin-bottom:16px; }
</style></head><body>
<div class="page cv">${hdr}<div class="date">${esc(prettyLong(createdDate.toISOString().slice(0, 10)))}</div><hr>
<div class="c c1">EVENT STAFFING/ PRODUCTION</div><div class="c c2">JERSEY STRIKE CO</div>
<div class="c c3">INSTAGRAM: @JERSEYSTRIKECO<br>EMAIL: TEAM@JERSEYSTRIKE.COM<br>CONTACT: (732) 759-4003</div></div>
<div class="page">${hdr}<div class="intro"><p>VENDOR PARTNERSHIPS THAT MAKE MAGIC HAPPEN</p>
<p>At Jersey Strike Co., we specialize in supporting event professionals with reliable, behind-the-scenes staffing and logistics that keep the show running smoothly—without the stress. Founded by industry pros who saw a critical need for dependable event-day support, we've built a trusted reputation helping florists, planners, venues, and rental companies bring their events to life with teams that feel in-house.</p>
<p>Whether it's floral processing, luxury installs, transportation, flips, or late-night strikes, our crew is trained to step in exactly where you need us—so you can focus on your clients, your craft, and your creative vision.</p>
<p>This proposal outlines how Jersey Strike Co. can support your team through seamless operational logistics, exceptional service, and a partnership rooted in reliability, respect, and shared success.</p></div></div>
<div class="page">${hdr}<h3>How We Build Your Proposal</h3>
<p>At Jersey Strike Co., no two events are the same—and neither are our proposals. Each quote is carefully crafted based on the unique details of your project. We take into account the specific logistics, timeline, and labor needs to ensure we assign the right number of team members with the right skill sets to support your event from start to strike.</p>
<p><b>When preparing your custom quote, we consider:</b></p><ul><li>The scope of support requested (e.g., floral processing, install assistance, strike, transport,etc.)</li><li>The complexity of the design and logistics</li><li>Load-in and load-out timelines</li><li>Specialty skill requirements (rigging, heavy lifting, delicate handling, etc.)</li><li>Vehicle and equipment needs (box trucks, tools, supplies)</li><li>Venue restrictions, access, loading, and labor coordination</li><li>The size of the crew needed to work efficiently and safely</li><li>Time windows for setup, flips, and strikes</li></ul>
<p>Our goal is to seamlessly fill the gaps in your production team and provide exactly the level of support you need— no less. With thoughtful planning and an experienced, reliable crew, we make sure you're never left short-handed when it matters most.</p></div>
<div class="page">${hdr}<h2>${esc(title)}</h2>
<div>Date: ${esc(prettyLong(q.eventDate))}<br>Venue: ${esc(q.venue)}</div><br>
<div>Florist: ${esc(q.business)}<br>${q.studio ? `Florist Address: ${esc(q.studio)}<br>` : ''}Florist Contact: ${esc(q.contact)}${q.phone ? ` ${esc(q.phone)}` : ''}</div></div>
<div class="page"><p class="it"><b>TIMELINE</b><br>${tl}</p><br>
<p class="it"><b>TASK LIST</b><br>${(plan.task_list || []).map(esc).join('<br>')}</p><hr class="div">
<div class="qb">QUOTE BREAKDOWN</div>${items}
<table class="tot"><tr><td></td><td class="lab b">Subtotal</td><td class="v b">${num(priced.itemsSubtotal)}</td></tr>${charges}
<tr><td></td><td class="lab b">Charges</td><td class="v b">${num(chargeSum)}</td></tr>
<tr><td></td><td class="lab b">Subtotal</td><td class="v b">${num(priced.subtotal)}</td></tr>
<tr><td></td><td class="lab">${priced.production ? 'Production Planning Fee' : 'Admin Fee'} &nbsp; ${Math.round(priced.adminPct * 100)}%</td><td class="v">${num(priced.admin)}</td></tr>
${priced.discount ? `<tr><td></td><td class="lab">${esc(priced.discount.label)} &nbsp; -${Math.round(priced.discount.pct * 100)}%</td><td class="v">${num(priced.discount.amount)}</td></tr>` : ''}
<tr><td></td><td class="lab b">Total</td><td class="v b">${num(priced.total)}</td></tr></table>
<div class="note">*This is a preliminary estimate based on the information provided. Additional hours or team members will be billed if the scope changes, including timeline changes or extensions, collection list changes or additional delivery locations.</div></div>
<div class="page">${hdr}<h3>WHAT HAPPENS NEXT?</h3>
<p>1. Inform us if you'd like to move forward with reserving your event on our team calendar.</p>
${priced.production ? `<p>2. Our event success manager will email over our service agreement and invoice: the ${Math.round(priced.adminPct * 100)}% PRODUCTION PLANNING FEE (due before planning begins; non-refundable if the event is cancelled) plus a 50% DEPOSIT on the remainder to reserve our team and hold your date.</p>` : `<p>2. Our event success manager will email over our service agreement and invoice (15% RETAINER) to reserve our team and hold your date.</p>`}
<p>3. Submit the service agreement and retainer online through your client portal via Dubsado</p>
<p>4. Keep an eye on your email inbox, add us to your contact list, and we will confirm the details with you approximately 2-weeks before the event to confirm the scope of work, timeline, inventory + task lists, etc. Don't hesitate to reach out if you have any questions or updates you'd like to discuss.</p></div>
<div>${hdr}<h3>BEST PRACTICES:</h3><ul class="bp">
<li>Reach out to our event success manager during your proposal process so you can build in our team to your future event estimates. We'll happily mock up a quote for you based on your current details to ensure you're able to maintain your ideal margins for profitability without missing any major logistic considerations.</li>
<li>Utilize an event recipe system (like Trellis) to keep your margins for profitability when detailing proposals and updating recipes. This will create a seamless production experience because you can print reports for your designer and set up team, submit orders easily to your vendors, and print your inventory + breakdown list for our team easily</li>
<li>Organize your packing/ loading situation. Photos and labels on bins or boxes are incredibly helpful for an efficient breakdown experience and allows our team to save you some time organizing decor back in the studio when we're able to pack into the correct boxes. We have so many recommendations.</li>
<li>Take photos + videos of your event production set up (and loading details) so you can send them over to our breakdown team. This shows them how mechanics are put together and allows our team to arrive prepared (tooling, hand-trucks + dollies, proper vehicle sizing if there's last minute changes, etc).</li></ul></div>
</body></html>`;
}
