// Dry run for test inquiries: node test/run-plan.mjs test/runs/<name>
// Reads <dir>/inquiry.json + <dir>/plan.json (the plan Claude produced), prices it
// with the real engine and writes <dir>/draft.html (the admin email) + draft.txt.
import { readFileSync, writeFileSync } from 'node:fs';
import { priceQuote, fmt } from '../netlify/functions/lib/pricing.mjs';
import { renderQuoteEmail, renderQuoteText, renderFlagsText, quoteSubject } from '../netlify/functions/lib/quote-render.mjs';

const dir = process.argv[2].replace(/\/$/, '');
const inquiry = JSON.parse(readFileSync(`${dir}/inquiry.json`, 'utf8'));
const plan = JSON.parse(readFileSync(`${dir}/plan.json`, 'utf8'));
const routes = { available: false, notes: ['Dry run: drive times estimated by Claude (no Google key).'] };
const priced = priceQuote(plan, inquiry);
const args = { inquiry, plan, priced, routes, docNotes: [], recordUrl: '' };
writeFileSync(`${dir}/draft.html`, renderQuoteEmail(args));
writeFileSync(`${dir}/draft.txt`, `${quoteSubject(inquiry, priced)}\n\n${renderQuoteText(args)}\n\n${renderFlagsText(args)}\n`);
console.log(quoteSubject(inquiry, priced));
for (const l of priced.lines) console.log(`  ${l.label.padEnd(44)} ${fmt(l.amount).padStart(11)}  ${l.math}`);
for (const c of priced.charges) console.log(`  ${c.label.padEnd(44)} ${fmt(c.amount).padStart(11)}  ${c.math}`);
console.log(`  Subtotal ${fmt(priced.subtotal)} · admin ${fmt(priced.admin)}${priced.discount ? ` · discount ${fmt(priced.discount.amount)}` : ''} · TOTAL ${fmt(priced.total)}`);
console.log(`  Margin ${priced.margin.pct}% (${priced.margin.verdict}) · cost ${fmt(priced.margin.cost)}`);
for (const w of priced.warnings) console.log(`  ! ${w}`);
