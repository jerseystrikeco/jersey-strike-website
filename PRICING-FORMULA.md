# Jersey Strike pricing formula (Phase 2, in progress)

Billing is portal to portal: the clock runs from crew departure at HQ until the crew is back at HQ.

Price = total timeline hours × team size × $65/hr, + vehicles, + infrastructure/rentals.
Minimums: $1,500 strike · $5,000 full-service day-of. These are all-in totals, INCLUDING the 8% admin fee. Drafts FLAG jobs under the minimum but don't bump them; the admin team decides (many past small jobs went out under).

## Line items
- Base fee: $300 per service day on site at the venue (establishes the floor). Install and strike on different days = $600. An install early in the day and the strike that same night (even if the strike starts at or runs past midnight) are ONE service day = $300 (Alyssa, 10/27/26).
  - Exceptions: no extra base fee when a split or next-day delivery is for our benefit (our schedule, team safety or convenience), e.g. a late-night strike where we deliver back to the studio the next morning. The draft flags these for admin review and doesn't add a base fee.
- Labor: $65/hr per person for ALL labor types (design planning, set up/install, strike, flips, returns); hours = portal-to-portal timeline × team size
- Fuel: vans $1/mile per van (two vans = double the miles); box trucks (incl. U-Haul) $1/mile per round trip, capped at $200 per round trip (short local trips don't burn a full tank; install trip and strike trip each count as one). Trellis note: by mile or flat $100–$200 per event depending on scope; our fuel cost ≈ $0.70/mile
- U-Haul rental as needed: price it both ways and use whichever is LESS expensive for the client while still profitable for us (billed U-Haul lines ≥ 1.5× our actual cost — floor TO CONFIRM)
  - Method A (Trellis / Wile): $135/day + $2.99/mile, + fuel + management. Our cost: $87.50/day, $1.99/mile. Wile 26ft: 3 days $405 + 200 mi $598 + fuel $200 + mgmt $200 = $1,403 (cost $800.50, 1.79× markup).
  - Method B: (U-Haul cost + 20% taxes/fees) × 2.5, + fuel + management.
  - If the real U-Haul cost can't be looked up, estimate cost at $87.50/day (Trellis) or U-Haul's posted rate, + $1.99/mile round trip.
  - Always at least 2 days: pick up the day before, return the day after the event is over.
  - Install and strike on different dates: keep one rental through both if the dates are consecutive or it saves mileage (bulk U-Haul rate with mileage included); otherwise price two separate rentals. Draft shows which it chose and why.
  - Draft shows both methods' math and which one it picked.
- Truck management fee: $1/mile round trip. Per Trellis note, applies whether we supply the U-Haul or drive the client's truck; $200 minimum when it's the client's truck. (TO CONFIRM vs. earlier 'client's truck only')
- Ladders: $50 per ladder; the Skyscraper (12–24 ft) is $150 (inventory below)
- Rigging tool kit: $100 flat
- Any additional rental costs
- Destination job = not safe for the team to drive home: more than 12 hours worked on site AND more than 2 hours' drive home. The draft also flags back-to-back days far from HQ (e.g. late strike, then early install the next day) as a possible hotel night for admin to decide.
- Hotel (destination jobs): pass-through at cost for a nice-enough place nearby; draft estimates and flags for admin to book/confirm
- Meal allowance (destination jobs): $50 per day per person
- Studio days (processing, prep, reset): flat $450 per person per day
- Admin fee: 8% of everything else (applied last, on the full subtotal)

## Full production (Full Production page inquiries, or any job where we produce the whole build)
Modeled on Social Supply (DC), who charge a 15% design fee up front, a 50% deposit and a $10k minimum.
- job_type = full_production. Typical full production: $15k–$55k+. Drafts FLAG anything under $15,000 (maybe a crew job instead), never bump.
- Labor, team, trucking, vehicles, equipment, base fee, travel: priced exactly as above (same rates).
- Sourced items (chandeliers, greenery, disco balls, lanterns, decor, hardware we buy for the job): our cost × 2 = 50% margin (same as fabrication materials). Claude estimates our cost; confirm real prices before quoting.
- Outside vendor rentals / pass-throughs (lift, truss, tent add-ons): our cost + 10% handling.
- Custom fabrication: same as below (materials × 2 + shop hours × $65).
- Production planning fee: 12% of the full subtotal, INSTEAD of the 8% admin fee (covers the producer: scoping call, walkthrough, production plan, vendor coordination, close-out report).
- Terms: the 12% planning fee is invoiced at booking, due before planning begins and non-refundable if the event is cancelled; then a 50% deposit on the remainder holds the date. (Replaces the 15% retainer for productions.)

## Margin target (internal)
Aim for **50% gross profit on every job**. Cost = team pay $30/hr (all jobs; $45 on major holidays; overtime after 40 hrs clocked in a week) × (portal-to-portal hours + each person's drive between home and HQ, ~1 hr round trip assumed) + studio days (8 hrs × $30) + fuel ~$0.70/mi + U-Haul actual cost + fab materials/shop time + pass-throughs (rentals, hotel, meals, tolls). Each draft shows the margin, flags anything under 50% and gives the total that would hit 50%. Under 40% = "not viable as quoted".
Payroll taxes, workers' comp and insurance are NOT in the cost: the 50% gross margin leaves room for the net to work out.
Exceptions: a job clearing $2,000+ gross profit has room to run under 50% (flagged as "under 50% but worth it", not "not viable"). Wile Events is judged on gross-profit dollars, not %: their average project value is much higher than a standard $1,500 strike (often $5k+ net).

## Premium labor ($75 / $85)
Standard is $65/hr. A crew call gets +$10/hr per trigger, max +$20 ($85), only on that call; major holidays are time and a half on top:
- **major_holiday**: time and a half on the whole rate ($65 → $97.50, as charged the day after Christmas 2025; team paid $45/hr): Thanksgiving / Black Friday weekend (Wed–Sun), the whole Dec 23 – Jan 2 holiday season, July 4
  - Team pay on major holidays: $45/hr (billed $97.50, so the labor margin holds).
- **holiday**: +$10: Memorial/Labor Day weekends, Valentine's/Mother's Day weeks for floral work. All of these (and the major holidays) also get a red flag: staffing is hard, line up the team early. Other US holidays (MLK, Presidents' Day, Easter, Father's Day, Juneteenth, July 4th weekend, Columbus Day, Halloween, Veterans Day) are noted for traffic/availability but carry no premium.
- **nyc_difficult**: Manhattan/Brooklyn/Queens with no dock, street parking/permits, security check-in, freight elevator/union rules, long carries
- **short_notice**: inquiry less than 7 days out
- **extreme_access**: ladders over 20 ft, scissor lift, heavy hung structures/grids over a dance floor
- **difficult_scope**: the team will clearly be working beyond a reasonable expectation (very heavy/awkward pieces, huge piece counts for the window, many long carries/stairs, multiple flips, punishing conditions)
(Recommended by Claude from past $75–85 quotes; Alyssa to confirm.)

## Custom fabrication
Claude estimates every custom build (materials cost + shop hours) from past fab jobs. Price = materials × 2 + shop hours × $65 (multiplier TO CONFIRM with Larry). Install/strike of the build goes in the normal crew calls. Any draft with fabrication gets "[Alyssa: check fab with Larry]" in the email subject and a section with Claude's flags + questions for Larry. If JS already owns something that fits (wooden chuppah rental $950, arch rental, white plinths $75, pole urn + plinth, stage backdrop), the draft suggests renting it instead.

## Solo shifts
Team of 1 only with a very strong team member AND a very easy job AND daytime AND an easy drive. Night strikes and ladder work: minimum 2.

## Price the real effort
Quote what the job actually takes (team + hours from the sizing method), not what we guess the client will accept. Repeat clients like Floralaine pay full quotes; under-quoting just eats margin and burns out the crew. Use the leaner option to offer choices, never to quietly shrink the team.

## First-time clients
Many first-time inquirers haven't budgeted for us yet; they often book on the 3rd–5th inquiry or when they're in a pinch. Drafts check the client's history, keep the real quote honest, and suggest a leaner option to offer.

## Grandfathered clients
- Wile Events (VIP): install/design labor by EVENT DATE: 2026 dates $50/hr, 2027 dates $55/hr (Alyssa, 10/28/26); 5% admin fee (grandfathered). Alyssa steps this up each year toward the $65/hr market rate; the new year's rate is set in the November rate review and updated here (Alyssa, 10/28/26). Strikes and everything else at standard rates. Wile is the ONLY client below $65; everyone else is $65. Their jobs typically run $10k+ from volume, so still profitable.
- A Petal to Peddle (Christa Quigley, Jersey City): no strike or full-service minimum; charged actual job + 8% admin. Her jobs are small.
- Floralaine (Taylor Diglio, Glen Ridge): repeat, very organized, pays full quotes (would have paid ~$2,800 for Cooper Hewitt). Quote straight.
- A Lily Among Thorns (Isabel Garcia, Bergenfield): 25% family discount off the total, taken after the 8% admin fee. Draft checks the business name against this list and notes when an old rate applies.
- Garden in the Pines (GITP, Alyssa's floral studio, 1404 Circle Dr, Forked River): Jersey Strike's sister company. Its studio IS the Forked River HQ, so a job for GITP ends when the unload at the studio is done: no extra drive back to HQ. Not a first-time client, so skip the first-time / lean-option talk. The $1,500 strike / $5,000 full-service minimums still get flagged for GITP like everyone else.

## Vehicles, ladders + gear we own (build rentals into the quote)
Every draft lists what the job pulls from our stock and flags anything we don't have, so the rental gets priced in up front.
- **Vans (2 only):** VANessa, extended cargo van, 12 ft interior rear doors to dash, **2 seats only**, with a **ladder roof rack** (long ladders ride on top, about 4 at a time). MINIvan, 10 ft interior rear doors to dash: **2 seats up front when it carries a load** (deliveries); **4–6 people** (back + front) only when the job doesn't need it to carry anything (crew transport only).
- **Seats / riding together:** the crew rides from HQ together, so match vehicles to crew size: VANessa 2, MINIvan 2 when loaded or 4–6 when it only moves crew, U-Haul/box truck cab ~3. Staffing says who drives what (TRUCK DRIVER for trucks) and who rides where. Not enough seats → more in MINIvan, another vehicle, or mileage for a separate car (flagged). Anything beyond what these two hold, a third vehicle, or a ladder too long for the van = rental (U-Haul cargo van or box truck), priced in the quote.
- **Ladders** (reach; most compact length for transport = the low end of the ladder's size range, e.g. 12–24 ft → 12 ft):
  - (1) Skyscraper 12–24 ft extension: 24 ft reach; 12 ft compact → VANessa (roof rack or inside) or a truck only. $150
  - (4) Podium ladders, 12–14 ft reach; 12 ft compact → VANessa (roof rack or inside) or a truck, not MINIvan. $50 each
  - (1) 12 ft A-frame, 15 ft reach; 12 ft compact → VANessa (roof rack or inside) or a truck only. $50
  - (1) Little Giant 8–12 ft, max 15 ft reach; 8 ft compact. $50
  - (1) Little Giant 5–10 ft, max 13–14 ft reach; 5 ft compact. $50
  - (1) Little Giant 4–8 ft, max 10–12 ft reach; 4 ft compact. $50
  - (2) Standard 6 ft ladders, max 8–10 ft reach; 6 ft compact. $50 each
  - (2) Step ladders, 6–7 ft reach; 6 ft compact. $50 each
  - 3+ long ladders (10 ft+ compact) take most of a van floor: use VANessa's roof rack, check the rest fit with the client's load, or add a U-Haul.
- **Carts:** (4) hand trucks/carts, (3) folding wagons, (1) XL lawn cart, (3) furniture dollies, (1) kitchen push cart, (1) small Gorilla push cart (lives in North Jersey). No charge.
- **Kits:** (4) standard strike kits (floral snips, trash bags, band-aids, ratchet straps, paper towels, moving blankets, etc.), one per crew call. (1) rigging essentials kit (cable, carabiners) $100, with (1) electric winch.
- Needs more than we own (5 podiums, 5 hand trucks, 3 vans) → rent/buy the gap and add it to the quote; the draft flags it.
- Other events on the calendar the same day → the draft flags it: confirm the vans, ladders and kits aren't already going out (Airtable doesn't track gear per event yet).

## Ceiling, tent pole + overhead installs: reach note required
Any ceiling, tent pole, hung, suspended or overhead install ALWAYS gets a reach note in the draft:
- Ceiling or tent pole height (floor to attachment point) and the working height
- Where the number came from (client, venue doc, past job, or assumed)
- Which ladders reach it (reach must cover the working height)
- Height not given → first question to the client, plus a red flag. Over 20 ft = extreme access (premium labor, Skyscraper, rigging-trained crew). Over 24 ft = beyond anything we own: lift rental, priced in.

## HQ (start and end of every timeline)
- South Jersey jobs: 1404 Circle Dr, Forked River, NJ 08731
- North Jersey + NY events: Montclair, NJ (no street address; route from town center)
- Anywhere else (central NJ, PA, etc.): whichever HQ gives the shorter total route; draft notes which it used.

## Drive times
- Google Maps drive time for every leg (HQ → studio → venue → delivery → HQ), using traffic for the actual day and time.
- Box trucks: use truck-legal routing (e.g. no NY parkways, Garden State Parkway truck restrictions, low clearances), which can be longer than the car route.
- Each leg uses traffic for that day and time, rounded up to the quarter hour. Leaving HQ: no extra buffer (the 15–30 min early arrival covers it; 44 min → 45 min). Every later leg (venue → studio, back to HQ, late at night with a loaded van): +15 min, rounded up (44 min → 1 hr). New York legs (NYC, Westchester, Long Island) always get extra cushion: +30 min on later legs and +15 min on the drive out, and box trucks can't use NY parkways (Hutchinson, Saw Mill, Bronx River, etc.), so truck legs run longer than Google's car route. Drive time to and from HQ is always a 1 hr minimum, whichever HQ we leave from: leave HQ at least 1 hr before the first start (studio load or venue), and the drive back to HQ is at least 1 hr. Otherwise leave HQ = start time minus (drive + 15–30 min early arrival). Don't pad beyond that.

## Install timeline
1. Crew departs HQ (leave = start − drive − 15 min buffer; 1 hr minimum)
2. Arrive at studio 15 min before start
3. Start / load at studio → done loading
4. Depart, drive to venue
5. Arrive at venue 15 min early minimum (30–45 min if parking/dock logistics are difficult)
6. Start → unload → setup schedule
7. Backload → flip → truck organized → done
8. Depart, drive back to HQ

## Strike timeline
1. Depart HQ, drive to venue (leave = strike start − drive − 15–30 min buffer; 1 hr minimum)
2. Arrive 15–30 min early to prep for strike
3. Extra time if we have to reset the client's truck to prep for strike
4. Strike
5. Extra time to pack the truck organized, strapped and secured so nothing breaks
6. Depart to delivery location
7. Delivery arrival → unload / organize
8. Depart, drive back to HQ

Example (Alyssa's own, GITP strike at Park Loft, 10:30pm start, 11:30pm hard out, ~45 min drive, return to studio):
- 9:30pm depart HQ
- 10:15pm arrive / prep
- 10:30pm strike starts
- 11:30pm strike done, van backloaded + organized
- 11:45pm depart for studio
- 12:45am back at studio, unload
- 1:00am done (GITP's studio is HQ; for any other client, add the drive from their studio back to HQ)
= 3.5 hrs portal to portal. With a hard out, strike + backload runs right up to the hard out (not earlier); depart ~15 min after. Return drive = Google + 15 min, rounded up (about an hour here). Unload is its own step, sized to the vehicle and how full it is: ~15 min for a van; 30–60 min for a smaller box truck or U-Haul; up to 1.5 hrs for a full 26 ft box truck (less with a bigger crew or a light load).

## Billing actual overtime
When a job runs past the quoted timeline (and the client approved it), keep the quoted start time and bill the extra time as its own "Timeline extension" line, in completed quarter hours (not rounded up): quoted back 8:00PM, actual back 10:47PM = +2.75 hrs per person. Show quoted vs actual.

## Quote footer
This is a preliminary estimate based on the information provided. Additional hours or team members will be billed if the scope changes, including timeline changes or extensions, collection list changes or additional delivery locations.

## Typical durations
- Load a 26ft box truck: 1–1.25 hr with a team of 3–4 (1.5 hr for holiday installs)
- Smaller vehicles scale down from that; unload/backload ≈ same as loading unless the dock/parking is difficult

## Team size: zones
- Treat every task area as a zone staffed by 1–2 people (e.g. ceremony altar + aisle, cocktail hour, reception tables, bars/sweetheart/cake, entry/lanterns, flips).
- Size the team so every zone is done inside the client's window (load-in → photo ready), with the flip handled by the people freed up after ceremony photo ready.
- Team roles on the timeline: Designer, Detail Muscle (as in past quotes).
- Strike crew sized the same way: zones vs. breakdown start → departure, usually fewer people than install.
- Reference job: past-jobs/2026-10-24-wile-jamie-greg.md

## Quote layout (match the existing proposal template)
Event header (dates, venues, addresses, florist + contact) → TIMELINE per day/shift with team size and roles → TASK LIST / scope → QUOTE BREAKDOWN line items (team, hours × rate) → Subtotal → Base Service → Admin Fee → Total → scope-change footer. Retainer 15% via Dubsado.

## Defaults until told otherwise
- Overtime / late night: no surcharge (late strikes are already priced through the $65 rate and base fee)
- Setup / strike duration with no run of show: estimate from zones (1–2 people per zone) and compare to the closest past job; flag as an estimate
- Tolls: estimated from the route, listed as a pass-through
- Minimums ($1,500 strike / $5,000 full-service day-of) are all-in incl. admin; drafts flag, don't bump
- U-Haul profit floor: 1.5× actual cost

## Admin review
- claude@jerseystrike.com is internal only: it emails jerseystrike.com addresses only (inquire@, alyssa@, mikaela@, joel@) and never contacts clients. Client replies are drafts for the team. See CLAUDE-EMAIL-RULES.md.
- Draft quotes email to inquire@jerseystrike.com (goes to all admins); no client reply-to on the review email

## Still to fill in
- Past jobs folder location (10–20 jobs)
