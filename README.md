# Jersey Strike Co. website

Static site in `public/`, deployed on Netlify. Inquiry form uses Netlify Forms; `netlify/functions/submission-created.mjs` emails each inquiry (Resend) and creates an Airtable record.

- Launch steps: see LAUNCH-GUIDE.md
- Test the automation locally (no real emails sent): `npm test`, then open test/email-preview.html
