# Phase 2 brief: AI-drafted preliminary quotes

Paste this into a new chat to pick up where we left off.

## Context
Jersey Strike Co. (jerseystrike.com): event production partner for florists, planners and venues (install + strike crews, custom fabrication, rentals). New site is built on Netlify; project folder: ~/Claude/jersey-strike-website.

Phase 1 (built): the inquiry form on the site uses Netlify Forms. `netlify/functions/submission-created.mjs` emails a formatted inquiry to inquire@jerseystrike.com (via Resend) and creates a row in the Airtable "Inquiries" tab (base appOFYb2Oi3LIQ4HO) with Status = New.

Inquiry fields: business, contact, email, phone, event date, venue, studio pickup/delivery address, services (multi), estimated team size, team needs (multi, incl. high ladder work, rigging, box truck driving), vehicles (1 Van, 2 Vans, 10/15/20/26ft box truck), scope of work, up to 3 documents (proposal, design deck, run of show, floor plan, task lists, inventory report with photos).

## Goal for Phase 2
When an inquiry arrives, Claude drafts a preliminary quote for the admin team to review (never sent to the client automatically):
1. Draft quote: crew size, hours, team mix, vehicles, infrastructure/rentals, priced with our formula; apply minimums.
2. Line-by-line math.
3. Logistics notes: truck sizing, load-in/strike timing, travel.
4. Reasoning, red flags and missing info.
5. Similar past jobs from Airtable.
Save to the Airtable row (Status = Needs review) and email the admin team the inquiry + analysis.

## Known pricing facts
- $65/hr per team member (base; every job is custom-quoted with our formula)
- $1,500 strike minimum; $5,000 full-service day-of minimum
- Formula inputs: hourly rate, team size, vehicle needs, infrastructure needs, timeline, travel/venue requirements

## Still needed from Alyssa
- The full pricing formula (multipliers, overtime/late-night, travel, vehicle and infrastructure rates)
- Admin team emails for review emails
- Anthropic API key
- 10–20 past jobs with run of show + what was charged
