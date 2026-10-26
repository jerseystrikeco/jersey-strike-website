// Client-ready proposal PDF in the Jersey Strike Trellis layout, built with PDFKit
// (pure JS, no browser needed). Attached to the internal draft-quote email for the
// admin team to review and forward. Never sent to clients automatically.
import PDFDocument from 'pdfkit';
import { LOGO_PNG_BASE64 } from './logo.generated.mjs';

const money = (n) => (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const longDate = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return iso || 'Date TBD';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};
const shortDate = (iso) => { const m = (iso || '').match(/^\d{2}(\d{2})-(\d{2})-(\d{2})$/); return m ? `${+m[2]}/${+m[3]}/${m[1]}` : iso || ''; };

const INTRO = [
  'VENDOR PARTNERSHIPS THAT MAKE MAGIC HAPPEN',
  "At Jersey Strike Co., we specialize in supporting event professionals with reliable, behind-the-scenes staffing and logistics that keep the show running smoothly—without the stress. Founded by industry pros who saw a critical need for dependable event-day support, we've built a trusted reputation helping florists, planners, venues, and rental companies bring their events to life with teams that feel in-house.",
  "Whether it's floral processing, luxury installs, transportation, flips, or late-night strikes, our crew is trained to step in exactly where you need us—so you can focus on your clients, your craft, and your creative vision.",
  'This proposal outlines how Jersey Strike Co. can support your team through seamless operational logistics, exceptional service, and a partnership rooted in reliability, respect, and shared success.',
];
const HOW_P1 = 'At Jersey Strike Co., no two events are the same—and neither are our proposals. Each quote is carefully crafted based on the unique details of your project. We take into account the specific logistics, timeline, and labor needs to ensure we assign the right number of team members with the right skill sets to support your event from start to strike.';
const HOW_BULLETS = ['The scope of support requested (e.g., floral processing, install assistance, strike, transport,etc.)', 'The complexity of the design and logistics', 'Load-in and load-out timelines', 'Specialty skill requirements (rigging, heavy lifting, delicate handling, etc.)', 'Vehicle and equipment needs (box trucks, tools, supplies)', 'Venue restrictions, access, loading, and labor coordination', 'The size of the crew needed to work efficiently and safely', 'Time windows for setup, flips, and strikes'];
const HOW_P2 = "Our goal is to seamlessly fill the gaps in your production team and provide exactly the level of support you need— no less. With thoughtful planning and an experienced, reliable crew, we make sure you're never left short-handed when it matters most.";
const BASE_TEXT = 'Jersey Strike aims to be as prepared as possible for every event. Our base service fee takes into account the costs associated with operating an efficient and reliable niche staffing company including but not limited to: insurance needs, vehicle maintenance, upgraded supplies & tooling, as well as internal management and production systems that make for a seamless communicative and operational experience with Jersey Strike Co.';
const NEXT = [
  "1. Inform us if you'd like to move forward with reserving your event on our team calendar.",
  '2. Our event success manager will email over our service agreement and invoice (15% RETAINER) to reserve our team and hold your date.',
  '3. Submit the service agreement and retainer online through your client portal via Dubsado',
  "4. Keep an eye on your email inbox, add us to your contact list, and we will confirm the details with you approximately 2-weeks before the event to confirm the scope of work, timeline, inventory + task lists, etc. Don't hesitate to reach out if you have any questions or updates you'd like to discuss.",
];
const BEST = [
  "REACH OUT TO OUR EVENT SUCCESS MANAGER DURING YOUR PROPOSAL PROCESS SO YOU CAN BUILD IN OUR TEAM TO YOUR FUTURE EVENT ESTIMATES. WE'LL HAPPILY MOCK UP A QUOTE FOR YOU BASED ON YOUR CURRENT DETAILS TO ENSURE YOU'RE ABLE TO MAINTAIN YOUR IDEAL MARGINS FOR PROFITABILITY WITHOUT MISSING ANY MAJOR LOGISTIC CONSIDERATIONS.",
  'UTILIZE AN EVENT RECIPE SYSTEM (LIKE TRELLIS) TO KEEP YOUR MARGINS FOR PROFITABILITY WHEN DETAILING PROPOSALS AND UPDATING RECIPES. THIS WILL CREATE A SEAMLESS PRODUCTION EXPERIENCE BECAUSE YOU CAN PRINT REPORTS FOR YOUR DESIGNER AND SET UP TEAM, SUBMIT ORDERS EASILY TO YOUR VENDORS, AND PRINT YOUR INVENTORY + BREAKDOWN LIST FOR OUR TEAM EASILY',
  "ORGANIZE YOUR PACKING/ LOADING SITUATION. PHOTOS AND LABELS ON BINS OR BOXES ARE INCREDIBLY HELPFUL FOR AN EFFICIENT BREAKDOWN EXPERIENCE AND ALLOWS OUR TEAM TO SAVE YOU SOME TIME ORGANIZING DECOR BACK IN THE STUDIO WHEN WE'RE ABLE TO PACK INTO THE CORRECT BOXES. WE HAVE SO MANY RECOMMENDATIONS.",
  "TAKE PHOTOS + VIDEOS OF YOUR EVENT PRODUCTION SET UP (AND LOADING DETAILS) SO YOU CAN SEND THEM OVER TO OUR BREAKDOWN TEAM. THIS SHOWS THEM HOW MECHANICS ARE PUT TOGETHER AND ALLOWS OUR TEAM TO ARRIVE PREPARED (TOOLING, HAND-TRUCKS + DOLLIES, PROPER VEHICLE SIZING IF THERE'S LAST MINUTE CHANGES, ETC).",
];

function itemLines(l) {
  if (l.team && l.hours) return [`TEAM OF ${l.team}${l.roles ? ` (${l.roles})` : ''}`, `${l.hours} hours @ ${l.rate}/hour`];
  return [String(l.math || '').replace(/\s*\(estimate; Larry to confirm\)/, '')];
}
function itemTitle(l) {
  if (l.section !== 'Labor') return l.label;
  const [name, date] = l.label.split(' | ');
  return date ? `${name.toUpperCase()} | ${date}` : name.toUpperCase();
}

export function proposalFilename(q) {
  const safe = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, '-').trim();
  return `${shortDate(q.eventDate).replace(/\//g, '-')} ${safe(q.business || q.contact)} - ${safe((q.venue || '').split(',')[0])}.pdf`;
}

// Returns Promise<Buffer>.
export function proposalPdf({ inquiry: q, plan, priced, created = new Date() }) {
  const title = `${shortDate(q.eventDate)} | ${q.business || q.contact} | ${(q.venue || '').split(',')[0]}`;
  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 34, bottom: 60, left: 50, right: 50 }, bufferPages: true, info: { Title: title, Author: 'Jersey Strike Co' } });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((res) => doc.on('end', () => res(Buffer.concat(chunks))));
  const logo = Buffer.from(LOGO_PNG_BASE64, 'base64');
  const W = doc.page.width, L = 50, R = W - 50, CW = R - L, BOTTOM = doc.page.height - 75;
  const F = 'Helvetica', FB = 'Helvetica-Bold', FI = 'Helvetica-Oblique', FBI = 'Helvetica-BoldOblique';
  const IT = L + 30, ITW = CW - 30;

  const header = () => {
    const lw = 240, lh = lw * (126 / 427);
    doc.image(logo, (W - lw) / 2, 30, { width: lw });
    doc.font(FB).fontSize(8.5).fillColor('#111').text('EVENT STAFFING + LOGISTICS', L, 30 + lh + 6, { width: CW, align: 'center', characterSpacing: 3.2 });
    const y = doc.y + 10;
    doc.moveTo(L, y).lineTo(R, y).lineWidth(0.8).strokeColor('#9a9a9a').stroke();
    doc.x = L; doc.y = y + 26;
  };
  const ensure = (h) => { if (doc.y + h > BOTTOM) { doc.addPage(); doc.x = L; doc.y = 50; } };
  const softRule = (w = CW * 0.68, color = '#e6e6e6') => { const y = doc.y; doc.moveTo(L + (CW - w) / 2, y).lineTo(L + (CW + w) / 2, y).lineWidth(0.6).strokeColor(color).stroke(); };

  // 1. Cover
  header();
  doc.y += 70;
  doc.font(F).fontSize(17).text(longDate(created.toISOString().slice(0, 10)), L, doc.y, { width: CW, align: 'center' });
  doc.y += 16; softRule(CW * 0.8, '#e2dcc8'); doc.y += 20;
  doc.fontSize(14).text('EVENT STAFFING/ PRODUCTION', L, doc.y, { width: CW, align: 'center' });
  doc.fontSize(12).text('JERSEY STRIKE CO', L, doc.y, { width: CW, align: 'center' });
  doc.fontSize(9);
  ['INSTAGRAM: @JERSEYSTRIKECO', 'EMAIL: TEAM@JERSEYSTRIKE.COM', 'CONTACT: (732) 759-4003'].forEach((t) => doc.text(t, L, doc.y, { width: CW, align: 'center' }));

  // 2. Intro
  doc.addPage(); header();
  doc.font(F).fontSize(11.5);
  INTRO.forEach((p) => { doc.text(p, L, doc.y, { width: CW, align: 'center', lineGap: 3 }); doc.moveDown(0.9); });

  // 3. How we build
  doc.addPage(); header();
  doc.font(FB).fontSize(12.5).text('How We Build Your Proposal', L, doc.y); doc.moveDown(0.8);
  doc.font(F).fontSize(11.5).text(HOW_P1, L, doc.y, { width: CW, lineGap: 3 }); doc.moveDown(0.9);
  doc.font(FB).text('When preparing your custom quote, we consider:', L, doc.y); doc.moveDown(0.5);
  doc.font(F).list(HOW_BULLETS, L + 14, doc.y, { width: CW - 20, lineGap: 3, bulletRadius: 2 }); doc.moveDown(0.9);
  doc.text(HOW_P2, L, doc.y, { width: CW, lineGap: 3 });

  // 4. Event details
  doc.addPage(); header();
  doc.font(FB).fontSize(17).text(title, L, doc.y, { width: CW });
  doc.font(F).fontSize(12);
  doc.text(`Date: ${longDate(q.eventDate)}`, L, doc.y).text(`Venue: ${q.venue || 'TBD'}`, L, doc.y); doc.moveDown(1);
  doc.text(`Florist: ${q.business || ''}`, L, doc.y);
  if (q.studio) doc.text(`Florist Address: ${q.studio}`, L, doc.y);
  doc.text(`Florist Contact: ${[q.contact, q.phone].filter(Boolean).join(' ')}`, L, doc.y);

  // 5. Timeline + task list
  doc.addPage(); doc.x = L; doc.y = 50;
  doc.font(FBI).fontSize(11.5).text('TIMELINE', IT, doc.y);
  for (const s of plan.shifts || []) {
    const line = priced.lines.find((x) => x.label.startsWith(s.label));
    ensure(40);
    doc.font(FI).fontSize(11.5).text([s.label, s.date].filter(Boolean).join(' – '), IT, doc.y, { width: ITW });
    doc.text(`JS Team of ${s.team_size}${s.roles ? ` (${s.roles})` : ''}`, IT, doc.y, { width: ITW });
    for (const st of s.steps || []) { ensure(16); doc.text(`${st.time} - ${st.label}`, IT, doc.y, { width: ITW }); }
    if (line?.hours) doc.text(`${line.hours}hrs`, IT, doc.y);
    doc.moveDown(0.8);
  }
  if (plan.task_list?.length) {
    ensure(40);
    doc.font(FBI).text('TASK LIST', IT, doc.y);
    doc.font(FI);
    for (const t of plan.task_list) { ensure(16); doc.text(t, IT, doc.y, { width: ITW }); }
  }
  doc.moveDown(1.2); ensure(90); softRule(CW * 0.68, '#e2dcc8'); doc.moveDown(1.6);

  // Quote breakdown
  ensure(80);
  doc.font(FB).fontSize(17).text('QUOTE BREAKDOWN', L, doc.y); doc.moveDown(1.2);
  doc.fontSize(11.5);
  for (const l of priced.lines) {
    const desc = itemLines(l);
    ensure(36 + desc.length * 15);
    const y0 = doc.y;
    doc.font(F).text('1', IT, y0);
    doc.font(FB).text(`${itemTitle(l)}  |  ${money(l.amount)}`, IT + 18, y0, { width: ITW - 18 });
    doc.font(F); desc.forEach((d) => doc.text(d, IT + 18, doc.y, { width: ITW - 18 }));
    doc.moveDown(1.1); softRule(); doc.moveDown(1.3);
  }

  // Totals
  const row = (label, value, { bold = false, sub = '' } = {}) => {
    ensure(20);
    const y = doc.y;
    doc.font(bold ? FB : F).fontSize(11.5).fillColor('#111').text(label, L + CW * 0.55, y, { width: CW * 0.3 - 8, align: 'right' });
    const yl = doc.y;
    doc.text(value, L + CW * 0.85, y, { width: CW * 0.15, align: 'right' });
    doc.y = yl;
    if (sub) doc.font(F).fontSize(8.5).fillColor('#555').text(sub, L + CW * 0.55, doc.y, { width: CW * 0.3 - 8, align: 'right' }).fillColor('#111');
    doc.moveDown(0.25);
  };
  ensure(230);
  row('Subtotal', money(priced.itemsSubtotal), { bold: true });
  for (const c of priced.charges) {
    if (c.label === 'Base Service') {
      const y = doc.y;
      doc.font(F).fontSize(10).fillColor('#111').text(BASE_TEXT, L, y, { width: CW * 0.52, align: 'right', lineGap: 1.5 });
      const yEnd = doc.y; doc.y = y;
      row('Base Service', money(c.amount), { sub: c.math });
      doc.y = Math.max(doc.y, yEnd) + 6;
    } else row(c.label, money(c.amount), { sub: c.math });
  }
  row('Charges', money(priced.charges.reduce((a, c) => a + c.amount, 0)), { bold: true });
  row('Subtotal', money(priced.subtotal), { bold: true });
  row(`Admin Fee   ${Math.round(priced.adminPct * 100)}%`, money(priced.admin));
  if (priced.discount) row(`${priced.discount.label}   -${Math.round(priced.discount.pct * 100)}%`, money(priced.discount.amount));
  row('Total', money(priced.total), { bold: true });
  doc.moveDown(1.2); ensure(50);
  doc.font(F).fontSize(10).text('*This is a preliminary estimate based on the information provided. Additional hours or team members will be billed if the scope changes, including timeline changes or extensions, collection list changes or additional delivery locations.', IT, doc.y, { width: ITW, lineGap: 1.5 });

  // What happens next
  doc.addPage(); header();
  doc.font(FB).fontSize(12.5).text('WHAT HAPPENS NEXT?', L, doc.y); doc.moveDown(0.9);
  doc.font(F).fontSize(11.5); NEXT.forEach((p) => { doc.text(p, L, doc.y, { width: CW, lineGap: 3 }); doc.moveDown(0.9); });

  // Best practices
  doc.addPage(); header();
  doc.font(FB).fontSize(12.5).text('BEST PRACTICES:', L, doc.y); doc.moveDown(0.9);
  doc.font(F).fontSize(10.5).list(BEST, L + 14, doc.y, { width: CW - 20, lineGap: 3, bulletRadius: 2, paragraphGap: 14 });

  // Footers
  const c2 = created.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit', timeZone: 'America/New_York' });
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    const keep = doc.page.margins.bottom; doc.page.margins.bottom = 0;
    doc.font(F).fontSize(9.5).fillColor('#111').text(`Created ${c2} • ${i + 1} of ${range.count}`, L, doc.page.height - 40, { width: CW, align: 'right', lineBreak: false });
    doc.page.margins.bottom = keep;
  }
  doc.end();
  return done;
}
