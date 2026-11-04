// Copy of the hub's src/lib/proposalServices.js (the starting wording; the hub's Settings wording comes in with the catalog).
// The "Our services" page printed in every proposal (Settings → Proposal pages edits the wording; owner only).
// Shared by the hub (Settings) and the server that builds the proposal PDF.
export const DEFAULT_SERVICES = [
  ['Strike + breakdown', 'Late-night teardown, careful packing and load-out by the venue hard-out, with your pieces back to the studio.'],
  ['Install + day-of setup', 'Extra hands for installs, ceremony structures, hanging pieces and placing centerpieces on time.'],
  ['Flips', 'Ceremony-to-reception turns, fast and quiet, so the room is ready when guests walk in.'],
  ['Floral processing + studio days', 'Processing, prep, packing and loading in your studio before the big day.'],
  ['Delivery + transport', 'Our vans, U-Haul and box-truck runs, or we drive your truck, door to door.'],
  ['Rigging + heights', 'Ladders, ceiling installs, installation grids and suspended pieces, done safely.'],
  ['Custom fabrication', 'Structures, mechanics and builds from our shop, made for your design.'],
  ['Full production', 'Sourcing, prep, delivery, install and strike, planned and run end to end.'],
  ['Rentals', 'Arches, chuppahs, staging, plinths and floral mechanics from our catalog (next pages).'],
  ['Destination events', 'We travel: driving or flying, anywhere in the US and internationally, plus multi-day installs. In 2026 our crews worked in Florida, North Carolina, DC, Maryland, Connecticut, Massachusetts and upstate New York.'],
];
// "Title: description" per line (or "Title - description") → [[title, text]]
export function parseServices(text) {
  const rows = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const m = l.match(/^(.{2,60}?)\s*(?::|\s[-–—]\s)\s*(.+)$/); return m ? [m[1], m[2]] : [l, '']; });
  return rows.length ? rows : DEFAULT_SERVICES;
}
export const servicesText = (list = DEFAULT_SERVICES) => list.map(([t, d]) => (d ? `${t}: ${d}` : t)).join('\n');
