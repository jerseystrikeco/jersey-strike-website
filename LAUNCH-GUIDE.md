# Jersey Strike website: launch guide

This folder is the complete new jerseystrike.com: six pages, the build library, the inquiry form, and the automation that emails each inquiry to you and adds it to Airtable.

Plan on about an hour, done in this order. Nothing changes on your current site until step 6.

---

## What's in the folder

| Folder / file | What it is |
|---|---|
| `public/` | The website itself: pages, photos, styles |
| `netlify/functions/submission-created.mjs` | The automation. Runs on every inquiry: sends the formatted email + creates the Airtable row |
| `netlify.toml` | Tells Netlify where everything is |
| `public/_redirects` | Keeps old Showit links working (e.g. /staffing-solutions → /staffing/) and points /holiday to your holiday site |
| `Inquiries-template.csv` | Column headers for the new Airtable tab |
| `test/` | A check you (or a developer) can run with `npm test`. Not needed to launch |

---

## Step 1: Airtable (10 min)

Inquiries go into your existing **EVENT INQUIRIES + LEADS** table (base `appOFYb2Oi3LIQ4HO`). No new tab needed.

Each website inquiry fills in:

| Your column | From the form |
|---|---|
| Business Name | Business name |
| Contact Name | Point of contact |
| Studio Location | Studio pickup / delivery address |
| INQUIRY DATE | The day it was submitted |
| EVENT DATE | Event date |
| Fabrication Build | Checked if they picked Custom fabrication |
| Notes | Everything else: email, phone, venue, services, team size, team needs, vehicles, scope of work, document links |

**Recommended:** add these columns (exact names) so details land in their own fields instead of only in Notes. Any you skip are simply left out; nothing breaks.

| Column name | Type |
|---|---|
| Email | Email |
| Phone Number | Phone number |
| Venue | Single line text |
| Services | Multiple select |
| Estimated Team Size | Number |
| Team Needs | Multiple select |
| Vehicle Needed | Multiple select |
| Scope of Work | Long text |
| Documents | Attachment (**strongly recommended**: file links in emails/Notes can expire, attachments are kept) |

**Personal access token**: airtable.com/create/tokens → Create token → scopes `data.records:read` and `data.records:write` → access: this base only → copy the token (starts with `pat`). Never paste it in chat; it goes into Netlify in step 3.

(`Inquiries-template.csv` in this folder is no longer needed. You can delete it.)

---

## Step 2: Set up Resend for the inquiry email (10 min)

1. Create a free account at resend.com.
2. **Domains → Add domain → jerseystrike.com.** Resend shows a few DNS records (they live on a `send.` subdomain). Add them wherever your domain's DNS is managed (GoDaddy, Squarespace Domains, Google, Cloudflare, etc.). **They do not affect your existing inquire@ email.**
3. Wait for the domain to show **Verified**.
4. **API Keys → Create API key** (Sending access) → copy it (starts with `re_`).

---

## Step 3: Put the site on Netlify (15 min)

The email + Airtable automation needs Netlify to *build* the site, so use GitHub rather than drag-and-drop (drag-and-drop skips the automation).

1. Create a free GitHub account if you don't have one, then **New repository** → name it `jersey-strike-website` → Private → Create.
2. On the new repo page, click **uploading an existing file** and drag in **everything inside this folder** (public, netlify, netlify.toml, etc.). Commit.
3. In Netlify: **Add new site → Import an existing project → GitHub →** pick `jersey-strike-website`. Leave the build settings as they are (they come from netlify.toml) → **Deploy**.
4. In the new site: **Site configuration → Environment variables → Add** these:

| Key | Value |
|---|---|
| `RESEND_API_KEY` | your `re_…` key |
| `INQUIRY_TO` | `inquire@jerseystrike.com` (add more, comma-separated, e.g. your admin team) |
| `INQUIRY_FROM` | `Jersey Strike Website <inquiries@jerseystrike.com>` |
| `AIRTABLE_TOKEN` | your `pat…` token |
| `AIRTABLE_BASE_ID` | `appOFYb2Oi3LIQ4HO` |

5. **Deploys → Trigger deploy → Deploy site** so the settings take effect.
6. **Forms → Enable form detection** if Netlify asks, then deploy once more. The **inquiry** form should appear under Forms.

---

## Step 4: Test it on the Netlify address (5 min)

Open the `…netlify.app` address Netlify gave you → **Get a quote** → submit a test inquiry with your own email and a small PDF.

Within a minute you should see:
- the formatted email in inquire@ (hit **Reply** and it goes to the email you entered),
- a new row in Airtable's EVENT INQUIRIES + LEADS table with the details (and the PDF, if you added a Documents column),
- the submission under Netlify → Forms.

If the email or Airtable row doesn't arrive: Netlify → **Logs → Functions → submission-created** shows exactly what went wrong (usually a typo in a key or a column name).

---

## Step 5: Holiday link

Done. The homepage banner, button and footer link go to https://holiday.jerseystrike.com, and jerseystrike.com/holiday redirects there too. Make sure the holiday site is connected to that subdomain in its own Netlify project (Domain management → add holiday.jerseystrike.com).

---

## Step 6: Switch jerseystrike.com to Netlify (10 min + waiting)

1. Netlify → **Domain management → Add a domain → jerseystrike.com**. Add **www.jerseystrike.com** too.
2. Netlify shows the DNS records to use. At your DNS provider, change **only the website records** (the `A` record for `@` and the `CNAME` for `www`) to what Netlify shows.
3. **Do not touch MX or other email records.** That's what keeps inquire@ working.
4. Wait for DNS to update (minutes to a few hours). Netlify adds HTTPS automatically.
5. Visit jerseystrike.com, check a few pages, and send one more test inquiry.

---

## Step 7: Cancel Showit

Once the new site has run cleanly for a few days, export anything you want to keep from Showit, then cancel. If Showit is also your domain registrar, transfer the domain out *before* cancelling.

---

## Everyday use

- **Change text or photos:** edit the files in GitHub (or ask Claude to). Netlify republishes automatically.
- **Add someone to inquiry emails:** add their address to `INQUIRY_TO` in Netlify and redeploy.
- **Plan limits:** Netlify and Resend free plans cap monthly form submissions, file uploads and emails. Check the current limits on their pricing pages, and upgrade if inquiry volume grows. Uploads are limited to 3 files per inquiry. The form suggests a Dropbox/Drive link for big decks.
- **Spam:** Netlify filters spam automatically, and the form has a hidden spam trap. Only clean submissions trigger the email and Airtable row.
