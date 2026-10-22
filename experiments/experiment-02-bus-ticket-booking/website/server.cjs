'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const PORT = Number(process.env.PORT || 4817);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('PORT must be a valid TCP port.');
const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const DATA_DIR = path.resolve(process.env.SWIFTBUS_DATA_DIR || path.join(ROOT, '.data'));
const DATA_FILE = path.join(DATA_DIR, 'swiftbus.json');
const CITIES = ['Bengaluru', 'Mysuru', 'Chennai', 'Hyderabad'];
const SEATS = Array.from({ length: 6 }, (_, i) => ['A', 'B', 'C', 'D'].map(c => `${i + 1}${c}`)).flat();
const SESSION_MS = 12 * 60 * 60 * 1000;
const sessions = new Map();
const authAttempts = new Map();
let state;
let writeQueue = Promise.resolve();

class ApiError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
const fail = (status, message, code) => { throw new ApiError(status, message, code); };
const id = () => crypto.randomUUID();
const textValue = value => typeof value === 'string' ? value.trim() : '';
const emailValue = value => textValue(value).toLowerCase();
const validEmail = value => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validPhone = value => /^[6-9]\d{9}$/.test(value);
const nameValue = value => {
  const name = textValue(value);
  if (name.length < 2 || name.length > 70 || /[\u0000-\u001f\u007f]/.test(name)) fail(400, 'Enter a name between 2 and 70 characters.');
  return name;
};
const passwordValue = value => {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) fail(400, 'Use a password between 8 and 128 characters.');
  return value;
};
const publicUser = user => ({ id: user.id, name: user.name, email: user.email, phone: user.phone });
const publicBooking = booking => {
  const { userId, idempotencyKey, requestFingerprint, ...safe } = booking;
  return safe;
};
const today = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
};
function validateRoute(from, to) {
  if (!CITIES.includes(from) || !CITIES.includes(to) || from === to) fail(400, 'Choose two different supported cities.');
  return { from, to };
}
function validateSearch(input) {
  const from = textValue(input.from), to = textValue(input.to), date = textValue(input.date);
  validateRoute(from, to);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(400, 'Choose a valid travel date.');
  const stamp = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== date) fail(400, 'Choose a valid travel date.');
  const current = Date.parse(today() + 'T00:00:00Z');
  if (stamp < current || stamp > current + 180 * 86400000) fail(400, 'Travel dates must be today through the next 180 days.');
  const passengers = Number(input.passengers === undefined ? 1 : input.passengers);
  if (!Number.isInteger(passengers) || passengers < 1 || passengers > 6) fail(400, 'Choose between 1 and 6 passengers.');
  return { from, to, date, passengers };
}
function validatePassengers(input, seats) {
  if (!Array.isArray(input) || input.length !== seats.length || new Set(input.map(p => p && p.seat)).size !== seats.length) fail(400, 'Provide passenger details for every selected seat.');
  return seats.map(seat => {
    const p = input.find(item => item && item.seat === seat);
    if (!p) fail(400, 'Provide passenger details for every selected seat.');
    const name = nameValue(p.name), age = p.age;
    if (typeof age !== 'number' || !Number.isInteger(age) || age < 1 || age > 100) fail(400, 'Passenger age must be a whole number between 1 and 100.');
    if (!['Male', 'Female', 'Other'].includes(p.gender)) fail(400, 'Choose a valid passenger gender.');
    return { seat, name, age, gender: p.gender };
  });
}
function validateContact(input) {
  const contact = { email: emailValue(input && input.email), phone: textValue(input && input.phone) };
  if (!validEmail(contact.email) || !validPhone(contact.phone)) fail(400, 'Enter a valid contact email and 10-digit mobile number.');
  return contact;
}
function validateReview(body) {
  const rating = body.rating, title = textValue(body.title), comment = textValue(body.comment);
  if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) fail(400, 'Choose a whole-number rating from 1 to 5.');
  if (title.length < 3 || title.length > 100 || /[\u0000-\u001f\u007f]/.test(title)) fail(400, 'Use a review title between 3 and 100 characters.');
  if (comment.length < 10 || comment.length > 2000 || comment.includes('\u0000')) fail(400, 'Write a review between 10 and 2000 characters.');
  return { rating, title, comment };
}
function publicReview(review, viewerId, data = state) {
  const { userId, ...safe } = review;
  return {
    ...safe, busName: buses[review.busId].name,
    author: data.users.find(user => user.id === userId)?.name || 'Traveller',
    mine: userId === viewerId,
    verifiedBooking: data.bookings.some(booking => booking.userId === userId && booking.busId === review.busId && booking.status === 'confirmed')
  };
}
const routes = {
  'Bengaluru|Mysuru': [195, 649], 'Mysuru|Bengaluru': [200, 649],
  'Bengaluru|Chennai': [370, 1190], 'Chennai|Bengaluru': [380, 1190],
  'Bengaluru|Hyderabad': [570, 1590], 'Hyderabad|Bengaluru': [580, 1590],
  'Mysuru|Chennai': [550, 1449], 'Chennai|Mysuru': [560, 1449],
  'Mysuru|Hyderabad': [720, 1849], 'Hyderabad|Mysuru': [730, 1849],
  'Chennai|Hyderabad': [680, 1799], 'Hyderabad|Chennai': [690, 1799]
};
const buses = {
  rajdhani: { name: 'Rajdhani Express', rating: 4.8, departure: '06:30', type: 'AC Seater', tags: ['ac', 'seater', 'early'], extra: 0, baseline: ['1B', '2D', '4A', '5C'] },
  greenline: { name: 'Greenline Travels', rating: 4.6, departure: '12:45', type: 'AC Sleeper', tags: ['ac', 'sleeper', 'afternoon'], extra: 150, baseline: ['1A', '3B', '5D'] },
  kaveri: { name: 'Kaveri Roadways', rating: 4.7, departure: '21:00', type: 'AC Sleeper', tags: ['ac', 'sleeper', 'night'], extra: 250, baseline: ['2A', '2B', '4C', '6D'] }
};
const stops = {
  Bengaluru: ['Majestic Bus Station', 'Silk Board Junction', 'Electronic City'],
  Mysuru: ['KSRTC Bus Stand', 'Suburban Bus Stand', 'Ring Road Stop'],
  Chennai: ['Koyambedu Bus Terminal', 'Guindy Metro Stop', 'Tambaram Bus Stop'],
  Hyderabad: ['MGBS Bus Station', 'Lakdi-ka-pul Stop', 'Gachibowli Junction']
};
function clock(minutes) {
  const days = Math.floor(minutes / 1440);
  const value = `${String(Math.floor((minutes % 1440) / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  return value + (days ? ` (+${days} day)` : '');
}
function tripFor(search, busId, data = state) {
  if (typeof busId !== 'string' || !Object.hasOwn(buses, busId)) fail(400, 'Choose a valid bus.');
  const bus = buses[busId];
  const [minutes, price] = routes[search.from + '|' + search.to];
  const departureMinutes = Number(bus.departure.slice(0, 2)) * 60 + Number(bus.departure.slice(3));
  const clockParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const currentMinutes = Number(clockParts.find(part => part.type === 'hour').value) * 60 + Number(clockParts.find(part => part.type === 'minute').value);
  const departed = search.date === today() && departureMinutes <= currentMinutes;
  const booked = new Set(bus.baseline);
  for (const booking of data.bookings) {
    if (booking.status === 'confirmed' && booking.from === search.from && booking.to === search.to && booking.date === search.date && booking.busId === busId) booking.seats.forEach(seat => booked.add(seat));
  }
  const bookedSeats = SEATS.filter(seat => booked.has(seat));
  return {
    id: busId, name: bus.name, rating: bus.rating, departure: bus.departure, arrival: clock(departureMinutes + minutes),
    duration: `${Math.floor(minutes / 60)}h ${minutes % 60}m`, type: bus.type, tags: bus.tags, price: price + bus.extra,
    capacity: 24, availableSeats: departed ? 0 : 24 - bookedSeats.length, bookedSeats, departed,
    boardingPoints: stops[search.from].map((label, i) => ({ id: `board-${i}`, label, time: clock(departureMinutes + i * 15) })),
    droppingPoints: stops[search.to].map((label, i) => ({ id: `drop-${i}`, label, time: clock(departureMinutes + minutes + i * 15) })),
    amenities: ['Air conditioning', 'Charging points', 'Bottled water', 'Reading lights', 'Luggage storage']
  };
}
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return { salt, hash: key.toString('hex') };
}
async function verifyPassword(password, user) {
  if (typeof password !== 'string' || password.length > 128 || !user) return false;
  const key = await scrypt(password, user.password.salt, 64);
  const expected = Buffer.from(user.password.hash, 'hex');
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}
async function persist(data) {
  const temp = path.join(DATA_DIR, `swiftbus-${crypto.randomBytes(8).toString('hex')}.tmp`);
  try {
    await fs.writeFile(temp, JSON.stringify(data, null, 2), { mode: 0o600, flag: 'wx' });
    await fs.rename(temp, DATA_FILE);
  } catch (error) {
    await fs.unlink(temp).catch(() => {});
    throw error;
  }
}
function transaction(mutator) {
  const operation = writeQueue.then(async () => {
    const next = structuredClone(state);
    const result = await mutator(next);
    await persist(next);
    state = next;
    return result;
  });
  writeQueue = operation.catch(() => {});
  return operation;
}
function cookieToken(req) {
  const match = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith('swiftbus_session='));
  const token = match ? match.slice('swiftbus_session='.length) : '';
  return /^[a-f0-9]{64}$/.test(token) ? crypto.createHash('sha256').update(token).digest('hex') : '';
}
function sessionFor(req) {
  const key = cookieToken(req), session = sessions.get(key);
  if (!session || session.expires <= Date.now()) {
    if (session) sessions.delete(key);
    return null;
  }
  const user = state.users.find(item => item.id === session.userId);
  return user ? { key, user } : null;
}
function requireUser(req) {
  const session = sessionFor(req);
  if (!session) fail(401, 'Please log in to continue.', 'LOGIN_REQUIRED');
  return session.user;
}
function issueSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(crypto.createHash('sha256').update(token).digest('hex'), { userId, expires: Date.now() + SESSION_MS });
  res.setHeader('Set-Cookie', `swiftbus_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}`);
}
function clearSession(req, res) {
  sessions.delete(cookieToken(req));
  res.setHeader('Set-Cookie', 'swiftbus_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
}
function authLimit(req) {
  const key = req.socket.remoteAddress || 'local';
  const now = Date.now(), previous = authAttempts.get(key);
  const bucket = previous && previous.expires > now ? previous : { count: 0, expires: now + 15 * 60 * 1000 };
  bucket.count++;
  authAttempts.set(key, bucket);
  if (bucket.count > 60) fail(429, 'Too many sign-in attempts. Please try again in 15 minutes.');
}
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
function bodyJson(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) fail(415, 'Send application/json for this request.');
  const max = 64 * 1024;
  if (Number(req.headers['content-length'] || 0) > max) { req.resume(); fail(413, 'Request is too large.'); }
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [], rejected = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > max) {
        if (!rejected) { rejected = true; chunks = []; reject(new ApiError(413, 'Request is too large.')); }
      } else if (!rejected) chunks.push(chunk);
    });
    req.on('end', () => {
      if (rejected) return;
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'Send a valid JSON object.');
        resolve(value);
      } catch (error) { reject(error instanceof ApiError ? error : new ApiError(400, 'Send valid JSON.')); }
    });
    req.on('error', reject);
  });
}
function requestSecurity(req, res) {
  const host = req.headers.host;
  const allowedHosts = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
  if (!allowedHosts.has(host)) fail(403, 'This testing app accepts local requests only.');
  if (req.headers.origin && !new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]).has(req.headers.origin)) fail(403, 'Cross-origin requests are not allowed.');
  if (!['GET', 'HEAD'].includes(req.method) && req.headers['sec-fetch-site'] === 'cross-site') fail(403, 'Cross-site requests are not allowed.');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; font-src 'self' https:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
}
function ownedBooking(data, userId, bookingId) {
  const booking = data.bookings.find(item => item.id === bookingId && item.userId === userId);
  if (!booking) fail(404, 'Booking not found.');
  return booking;
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function ticketLines(booking) {
  return [
    `PNR: ${booking.pnr}  |  Status: ${booking.status.toUpperCase()}`,
    `${booking.from} to ${booking.to}`,
    `Travel date: ${booking.date}  |  Departure: ${booking.departure}`,
    `Bus: ${booking.busName} (${booking.busType})`,
    `Arrival: ${booking.arrival}  |  Duration: ${booking.duration}`,
    `Seats: ${booking.seats.join(', ')}`,
    `Boarding: ${booking.boarding.label} - ${booking.boarding.time}`,
    `Drop-off: ${booking.dropping.label} - ${booking.dropping.time}`,
    '', 'PASSENGERS',
    ...booking.passengers.map(p => `Seat ${p.seat}: ${p.name}, age ${p.age}, ${p.gender}`),
    '', `Contact: ${booking.contact.email} | ${booking.contact.phone}`,
    '', 'FARE SUMMARY',
    `Base fare: INR ${booking.pricing.baseFare}  |  Discount: INR ${booking.pricing.discount}`,
    `Tax: INR ${booking.pricing.tax}  |  Booking fee: INR ${booking.pricing.fee}`,
    `Total: INR ${booking.pricing.total}`,
    `Payment method: ${booking.paymentMethod.toUpperCase()} - SIMULATED`,
    ...(booking.status === 'cancelled' ? [`Cancellation: ${booking.cancelledAt}`, `Refund: INR ${booking.refund} - SIMULATED`] : []),
    '', `Booking created: ${booking.createdAt}`,
    'No money was charged. This ticket cannot be used for travel.'
  ];
}
function pdfTicket(booking) {
  // Standard PDF fonts keep this generator dependency-free. Printable HTML retains all Unicode names.
  const ascii = value => String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '?');
  const literal = value => ascii(value).replace(/[\\()]/g, '\\$&');
  const widths = { ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667, "'": 191, '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015, '[': 278, '\\': 278, ']': 278, '^': 469, '_': 556, '`': 333, '{': 334, '|': 260, '}': 334, '~': 584 };
  [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].forEach((char, i) => { widths[char] = [667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611][i]; });
  [...'abcdefghijklmnopqrstuvwxyz'].forEach((char, i) => { widths[char] = [556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500][i]; });
  const wrapped = ticketLines(booking).flatMap(value => {
    let remaining = ascii(value), lines = [];
    while (remaining) {
      let count = 0, width = 0;
      while (count < remaining.length && width + (widths[remaining[count]] || 556) * 0.01 <= 515) { width += (widths[remaining[count]] || 556) * 0.01; count++; }
      if (count >= remaining.length) { lines.push(remaining); break; }
      const lastSpace = remaining.lastIndexOf(' ', count);
      if (lastSpace > count / 2) count = lastSpace;
      lines.push(remaining.slice(0, count)); remaining = remaining.slice(count).trimStart();
    }
    return lines.length ? lines : [''];
  });
  const leading = Math.min(17, 648 / Math.max(wrapped.length - 1, 1)).toFixed(2);
  const commands = [
    '0.27 0.24 0.85 rg 34 782 527 30 re f',
    '1 1 1 rg BT /F1 12 Tf 44 792 Td (DEMO TICKET - NOT VALID FOR TRAVEL) Tj ET',
    '0.10 0.12 0.20 rg BT /F1 24 Tf 40 746 Td (SwiftBus) Tj ET',
    `BT /F1 10 Tf 40 716 Td ${leading} TL`,
    ...wrapped.flatMap((line, i) => [`${i ? 'T* ' : ''}(${literal(line)}) Tj`]),
    'ET', '0.45 0.45 0.50 rg BT /F1 8 Tf 40 32 Td (Local testing only. Use Print ticket for full Unicode names.) Tj ET'
  ].join('\n');
  const stream = Buffer.from(commands, 'latin1');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`), stream, Buffer.from('\nendstream')]),
    `<< /Title (SwiftBus Demo Ticket ${literal(booking.pnr)}) /Producer (SwiftBus local testing) >>`
  ];
  const chunks = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')], offsets = [0];
  let offset = chunks[0].length;
  objects.forEach((object, i) => {
    offsets.push(offset);
    const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), Buffer.isBuffer(object) ? object : Buffer.from(object), Buffer.from('\nendobj\n')]);
    chunks.push(chunk); offset += chunk.length;
  });
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${offset}\n%%EOF\n`));
  return Buffer.concat(chunks);
}
function htmlTicket(booking, nonce) {
  const e = escapeHtml;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SwiftBus ticket ${e(booking.pnr)}</title><style>body{margin:0;background:#f4f5fa;color:#171a35;font:15px Arial,sans-serif}.ticket{max-width:760px;margin:36px auto;padding:36px;background:white;border-radius:16px}.demo{background:#4f46e5;color:white;padding:14px;border-radius:8px;font-weight:bold}h1{margin:25px 0 8px}h2{font-size:21px}h3{font-size:14px;letter-spacing:1px;margin-top:28px}p{line-height:1.6}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:11px 7px;border-bottom:1px solid #e8e8f1}.status{font-weight:bold;color:${booking.status === 'cancelled' ? '#b42318' : '#15803d'}}button{border:0;background:#4f46e5;color:white;border-radius:8px;padding:12px 22px;cursor:pointer;margin-top:18px}.note{font-size:12px;color:#5e637d}@media print{body{background:white}.ticket{margin:0;padding:15px;max-width:none}button{display:none}.demo{border:2px solid #4f46e5;background:white;color:#4f46e5}h3{margin-top:18px}}@media(max-width:550px){.ticket{padding:22px;margin:12px}.grid{grid-template-columns:1fr}}</style></head><body><main class="ticket"><div class="demo">DEMO TICKET · NOT VALID FOR TRAVEL</div><h1>SwiftBus</h1><p>PNR <strong>${e(booking.pnr)}</strong> · <span class="status">${e(booking.status.toUpperCase())}</span></p><h2>${e(booking.from)} → ${e(booking.to)}</h2><div class="grid"><p><strong>${e(booking.date)} · ${e(booking.departure)}</strong><br>${e(booking.busName)} · ${e(booking.busType)}<br>Arrival ${e(booking.arrival)} · ${e(booking.duration)}</p><p><strong>Seats ${e(booking.seats.join(', '))}</strong><br>Board: ${e(booking.boarding.label)} · ${e(booking.boarding.time)}<br>Drop: ${e(booking.dropping.label)} · ${e(booking.dropping.time)}</p></div><h3>PASSENGERS</h3><table><thead><tr><th>Seat</th><th>Name</th><th>Age</th><th>Gender</th></tr></thead><tbody>${booking.passengers.map(p => `<tr><td>${e(p.seat)}</td><td>${e(p.name)}</td><td>${e(p.age)}</td><td>${e(p.gender)}</td></tr>`).join('')}</tbody></table><p>Contact: ${e(booking.contact.email)} · ${e(booking.contact.phone)}</p><h3>FARE SUMMARY</h3><table><tbody><tr><td>Base fare</td><td>INR ${booking.pricing.baseFare}</td></tr><tr><td>Discount</td><td>− INR ${booking.pricing.discount}</td></tr><tr><td>Tax</td><td>INR ${booking.pricing.tax}</td></tr><tr><td>Booking fee</td><td>INR ${booking.pricing.fee}</td></tr><tr><th>Total</th><th>INR ${booking.pricing.total}</th></tr></tbody></table><p>Payment: ${e(booking.paymentMethod.toUpperCase())} · <strong>SIMULATED</strong></p>${booking.status === 'cancelled' ? `<p class="status">Cancelled ${e(booking.cancelledAt)}<br>Simulated refund: INR ${booking.refund}</p>` : ''}<p class="note">Created ${e(booking.createdAt)}. No money was charged. This ticket cannot be used for travel.</p><button id="print" type="button">Print ticket</button></main><script nonce="${nonce}">document.getElementById('print').addEventListener('click',()=>window.print());</script></body></html>`;
}

async function api(req, res, url) {
  const pathname = url.pathname, method = req.method;
  if (pathname === '/api/session' && method === 'GET') {
    const session = sessionFor(req);
    return json(res, 200, { user: session ? publicUser(session.user) : null });
  }
  if (pathname === '/api/search' && method === 'GET') {
    const search = validateSearch(Object.fromEntries(url.searchParams));
    return json(res, 200, { search, trips: Object.keys(buses).map(busId => tripFor(search, busId)) });
  }
  if (pathname === '/api/trip' && method === 'GET') {
    const search = validateSearch(Object.fromEntries(url.searchParams));
    return json(res, 200, { trip: tripFor(search, url.searchParams.get('busId')) });
  }
  if (pathname === '/api/reviews' && method === 'GET') {
    const busId = url.searchParams.get('busId');
    if (busId !== null && (typeof busId !== 'string' || !Object.hasOwn(buses, busId))) fail(400, 'Choose a valid bus.');
    const viewerId = sessionFor(req)?.user.id;
    const reviews = state.reviews.filter(review => busId === null || review.busId === busId).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return json(res, 200, { reviews: reviews.map(review => publicReview(review, viewerId)) });
  }
  if (pathname === '/api/auth/register' && method === 'POST') {
    authLimit(req);
    const body = await bodyJson(req), name = nameValue(body.name), email = emailValue(body.email), password = passwordValue(body.password), phone = textValue(body.phone);
    if (!validEmail(email)) fail(400, 'Enter a valid email address.');
    if (phone && !validPhone(phone)) fail(400, 'Enter a valid 10-digit mobile number.');
    const passwordHash = await hashPassword(password);
    const user = await transaction(data => {
      if (data.users.some(item => item.email === email)) fail(409, 'An account already exists for this email. Please log in.');
      const user = { id: id(), name, email, phone, password: passwordHash, createdAt: new Date().toISOString() };
      data.users.push(user); return user;
    });
    clearSession(req, res); issueSession(res, user.id);
    return json(res, 201, { user: publicUser(user) });
  }
  if (pathname === '/api/auth/login' && method === 'POST') {
    authLimit(req);
    const body = await bodyJson(req), email = emailValue(body.email);
    const user = state.users.find(item => item.email === email);
    if (!validEmail(email) || !(await verifyPassword(body.password, user))) fail(401, 'Email or password is incorrect.');
    clearSession(req, res); issueSession(res, user.id);
    return json(res, 200, { user: publicUser(user) });
  }
  if (pathname === '/api/auth/logout' && method === 'POST') {
    await bodyJson(req); clearSession(req, res);
    return json(res, 200, { ok: true });
  }
  const user = requireUser(req);
  if (pathname === '/api/account' && method === 'PATCH') {
    const body = await bodyJson(req);
    if (!Object.keys(body).length || Object.keys(body).some(key => !['name', 'email', 'phone'].includes(key))) fail(400, 'Choose name, email or phone details to update.');
    const updated = await transaction(data => {
      const userRecord = data.users.find(item => item.id === user.id);
      const name = nameValue(body.name === undefined ? userRecord.name : body.name), email = emailValue(body.email === undefined ? userRecord.email : body.email), phone = textValue(body.phone === undefined ? userRecord.phone : body.phone);
      if (!validEmail(email)) fail(400, 'Enter a valid email address.');
      if (phone && !validPhone(phone)) fail(400, 'Enter a valid 10-digit mobile number.');
      if (data.users.some(item => item.id !== user.id && item.email === email)) fail(409, 'An account already uses this email address.');
      userRecord.name = name; userRecord.email = email; userRecord.phone = phone; return userRecord;
    });
    return json(res, 200, { user: publicUser(updated) });
  }
  if (pathname === '/api/account/password' && method === 'POST') {
    authLimit(req);
    const body = await bodyJson(req), newPassword = passwordValue(body.newPassword);
    const password = await hashPassword(newPassword);
    await transaction(async data => {
      const userRecord = data.users.find(item => item.id === user.id);
      if (!(await verifyPassword(body.currentPassword, userRecord))) fail(400, 'Current password is incorrect.');
      userRecord.password = password;
    });
    for (const [key, session] of sessions) if (session.userId === user.id) sessions.delete(key);
    issueSession(res, user.id);
    return json(res, 200, { ok: true });
  }
  if (pathname === '/api/bookings' && method === 'GET') return json(res, 200, { bookings: state.bookings.filter(item => item.userId === user.id).slice().reverse().map(publicBooking) });
  if (pathname === '/api/bookings' && method === 'POST') {
    const body = await bodyJson(req);
    const key = textValue(body.idempotencyKey);
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(key)) fail(400, 'Use a valid booking request identifier.');
    const requestFingerprint = crypto.createHash('sha256').update(JSON.stringify({
      from: textValue(body.from), to: textValue(body.to), date: textValue(body.date), busId: body.busId,
      seats: body.seats, boardingId: body.boardingId, droppingId: body.droppingId,
      passengers: Array.isArray(body.passengers) ? body.passengers.map(p => p && ({ seat: p.seat, name: textValue(p.name), age: p.age, gender: p.gender })) : body.passengers,
      contact: { email: emailValue(body.contact && body.contact.email), phone: textValue(body.contact && body.contact.phone) },
      paymentMethod: body.paymentMethod, coupon: textValue(body.coupon).toUpperCase()
    })).digest('hex');
    const result = await transaction(data => {
      const previous = data.bookings.find(item => item.userId === user.id && item.idempotencyKey === key);
      if (previous) {
        if (previous.requestFingerprint !== requestFingerprint) fail(409, 'This request identifier was already used for different booking details. Please restart checkout.', 'IDEMPOTENCY_CONFLICT');
        return { booking: previous, existing: true };
      }
      if (!Array.isArray(body.seats) || body.seats.length < 1 || body.seats.length > 6 || new Set(body.seats).size !== body.seats.length || body.seats.some(seat => !SEATS.includes(seat))) fail(400, 'Choose between 1 and 6 different valid seats.');
      const search = validateSearch({ ...body, passengers: body.seats.length });
      const trip = tripFor(search, body.busId, data);
      if (trip.departed) fail(409, 'This bus has already departed. Please choose a later trip.', 'TRIP_DEPARTED');
      if (body.seats.some(seat => trip.bookedSeats.includes(seat))) fail(409, 'One or more selected seats have just been booked. Please choose available seats.', 'SEAT_UNAVAILABLE');
      const boarding = trip.boardingPoints.find(point => point.id === body.boardingId), dropping = trip.droppingPoints.find(point => point.id === body.droppingId);
      if (!boarding || !dropping) fail(400, 'Choose valid boarding and dropping points.');
      const passengers = validatePassengers(body.passengers, body.seats);
      const contact = validateContact(body.contact);
      if (!['upi', 'card', 'netbanking'].includes(body.paymentMethod)) fail(400, 'Choose a valid simulated payment method.');
      const coupon = textValue(body.coupon).toUpperCase();
      if (body.coupon !== undefined && typeof body.coupon !== 'string') fail(400, 'Enter a valid coupon code or leave it empty.');
      if (coupon && coupon !== 'SWIFT10') fail(400, 'Coupon not recognized. Try SWIFT10 or remove the coupon.');
      const baseFare = trip.price * body.seats.length, discount = coupon ? Math.round(baseFare * 0.1) : 0, tax = Math.round((baseFare - discount) * 0.05), fee = 29;
      let pnr;
      do { pnr = 'SB' + crypto.randomBytes(5).toString('hex').toUpperCase(); } while (data.bookings.some(item => item.pnr === pnr));
      const booking = { id: id(), pnr, userId: user.id, idempotencyKey: key, requestFingerprint, status: 'confirmed', createdAt: new Date().toISOString(), from: search.from, to: search.to, date: search.date, busId: trip.id, busName: trip.name, busType: trip.type, departure: trip.departure, arrival: trip.arrival, duration: trip.duration, seats: body.seats.slice(), boarding, dropping, passengers, contact, paymentMethod: body.paymentMethod, pricing: { baseFare, discount, tax, fee, total: baseFare - discount + tax + fee } };
      data.bookings.push(booking);
      return { booking, existing: false };
    });
    return json(res, result.existing ? 200 : 201, { booking: publicBooking(result.booking) });
  }
  const bookingMatch = /^\/api\/bookings\/([a-f0-9-]{36})(?:\/(cancel|ticket\.pdf|ticket\.html))?$/.exec(pathname);
  if (bookingMatch) {
    const [, bookingId, action] = bookingMatch;
    if (method === 'PATCH' && !action) {
      const body = await bodyJson(req);
      if (!Object.keys(body).length || Object.keys(body).some(key => !['passengers', 'contact', 'boardingId', 'droppingId'].includes(key))) fail(400, 'Only passenger, contact, boarding and dropping details can be edited.');
      const booking = await transaction(data => {
        const booking = ownedBooking(data, user.id, bookingId);
        if (booking.status !== 'confirmed' || booking.date < today()) fail(409, 'Only confirmed bookings for a trip that has not departed can be edited.', 'BOOKING_LOCKED');
        const trip = tripFor({ from: booking.from, to: booking.to, date: booking.date }, booking.busId, data);
        if (trip.departed) fail(409, 'This bus has already departed. Booking details can no longer be edited.', 'TRIP_DEPARTED');
        const passengers = body.passengers === undefined ? booking.passengers : validatePassengers(body.passengers, booking.seats);
        const contact = body.contact === undefined ? booking.contact : validateContact(body.contact);
        const boarding = trip.boardingPoints.find(point => point.id === (body.boardingId === undefined ? booking.boarding.id : body.boardingId));
        const dropping = trip.droppingPoints.find(point => point.id === (body.droppingId === undefined ? booking.dropping.id : body.droppingId));
        if (!boarding || !dropping) fail(400, 'Choose valid boarding and dropping points.');
        booking.passengers = passengers; booking.contact = contact; booking.boarding = boarding; booking.dropping = dropping; booking.updatedAt = new Date().toISOString();
        return booking;
      });
      return json(res, 200, { booking: publicBooking(booking) });
    }
    if (method === 'POST' && action === 'cancel') {
      await bodyJson(req);
      const booking = await transaction(data => {
        const booking = ownedBooking(data, user.id, bookingId);
        if (booking.status !== 'cancelled') { booking.status = 'cancelled'; booking.cancelledAt = new Date().toISOString(); booking.refund = booking.pricing.total; }
        return booking;
      });
      return json(res, 200, { booking: publicBooking(booking) });
    }
    if (method === 'GET') {
      const booking = ownedBooking(state, user.id, bookingId);
      if (!action) return json(res, 200, { booking: publicBooking(booking) });
      if (action === 'ticket.pdf') {
        const pdf = pdfTicket(booking);
        res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="SwiftBus-${booking.pnr}.pdf"`, 'Content-Length': pdf.length, 'Cache-Control': 'no-store' });
        return res.end(pdf);
      }
      if (action === 'ticket.html') {
        const nonce = crypto.randomBytes(16).toString('base64');
        res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'`);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(htmlTicket(booking, nonce));
      }
    }
  }
  if (pathname === '/api/reviews' && method === 'POST') {
    const body = await bodyJson(req), busId = body.busId;
    if (typeof busId !== 'string' || !Object.hasOwn(buses, busId)) fail(400, 'Choose a valid bus.');
    const values = validateReview(body);
    const review = await transaction(data => {
      if (data.reviews.some(review => review.userId === user.id && review.busId === busId)) fail(409, 'You already reviewed this bus. Edit your existing review instead.', 'REVIEW_EXISTS');
      const timestamp = new Date().toISOString();
      const review = { id: id(), userId: user.id, busId, ...values, createdAt: timestamp, updatedAt: timestamp };
      data.reviews.push(review); return review;
    });
    return json(res, 201, { review: publicReview(review, user.id) });
  }
  const reviewMatch = /^\/api\/reviews\/([a-f0-9-]{36})$/.exec(pathname);
  if (reviewMatch && ['PATCH', 'DELETE'].includes(method)) {
    const body = await bodyJson(req);
    const values = method === 'PATCH' ? validateReview(body) : null;
    const review = await transaction(data => {
      const index = data.reviews.findIndex(review => review.id === reviewMatch[1] && review.userId === user.id);
      if (index < 0) fail(404, 'Review not found.');
      const review = data.reviews[index];
      if (method === 'DELETE') data.reviews.splice(index, 1);
      else { Object.assign(review, values); review.updatedAt = new Date().toISOString(); }
      return review;
    });
    return json(res, 200, method === 'DELETE' ? { ok: true } : { review: publicReview(review, user.id) });
  }
  if (pathname === '/api/saved-routes' && method === 'GET') return json(res, 200, { routes: state.savedRoutes.filter(route => route.userId === user.id).map(({ userId, ...route }) => route) });
  if (pathname === '/api/saved-routes' && method === 'POST') {
    const body = await bodyJson(req), from = textValue(body.from), to = textValue(body.to);
    validateRoute(from, to);
    const route = await transaction(data => {
      const existing = data.savedRoutes.find(route => route.userId === user.id && route.from === from && route.to === to);
      if (existing) return existing;
      const route = { id: id(), userId: user.id, from, to }; data.savedRoutes.push(route); return route;
    });
    const { userId, ...safe } = route;
    return json(res, 200, { route: safe });
  }
  const routeMatch = /^\/api\/saved-routes\/([a-f0-9-]{36})$/.exec(pathname);
  if (routeMatch && method === 'DELETE') {
    await bodyJson(req);
    await transaction(data => {
      const index = data.savedRoutes.findIndex(route => route.id === routeMatch[1] && route.userId === user.id);
      if (index < 0) fail(404, 'Saved route not found.');
      data.savedRoutes.splice(index, 1);
    });
    return json(res, 200, { ok: true });
  }
  if (pathname === '/api/support' && method === 'GET') return json(res, 200, { requests: state.support.filter(request => request.userId === user.id).slice().reverse().map(({ userId, ...request }) => request) });
  if (pathname === '/api/support' && method === 'POST') {
    const body = await bodyJson(req), subject = textValue(body.subject), message = textValue(body.message);
    if (subject.length < 5 || subject.length > 120 || message.length < 10 || message.length > 2000 || /[\u0000-\u001f\u007f]/.test(subject) || message.includes('\u0000')) fail(400, 'Use a subject of 5–120 characters and a message of 10–2000 characters.');
    const request = await transaction(data => {
      const request = { id: id(), userId: user.id, subject, message, status: 'Open (local)', createdAt: new Date().toISOString() };
      data.support.push(request); return request;
    });
    const { userId, ...safe } = request;
    return json(res, 201, { request: safe });
  }
  fail(404, 'API endpoint not found.');
}
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };
async function handle(req, res) {
  try {
    requestSecurity(req, res);
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (!['GET', 'HEAD'].includes(req.method)) fail(405, 'Method not allowed.');
    let decoded;
    try { decoded = decodeURIComponent(url.pathname); } catch { fail(400, 'Invalid URL.'); }
    const filename = path.resolve(DIST, '.' + (decoded === '/' ? '/index.html' : decoded));
    if (!filename.startsWith(DIST + path.sep) || decoded.includes('\0') || path.relative(DIST, filename).split(path.sep).some(part => part.startsWith('.'))) fail(404, 'File not found.');
    let data;
    try { data = await fs.readFile(filename); } catch (error) { if (['ENOENT', 'EISDIR'].includes(error.code)) fail(404, 'File not found.'); throw error; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filename).toLowerCase()] || 'application/octet-stream', 'Content-Length': data.length, 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    if (status === 500) console.error('SwiftBus request failed:', error.message);
    if (!res.headersSent) json(res, status, { error: status === 500 ? 'Something went wrong. Please try again.' : error.message, ...(error.code && error instanceof ApiError ? { code: error.code } : {}) });
    else res.end();
  }
}
async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  try {
    state = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
    if (state.version !== 1 || !['users', 'bookings', 'savedRoutes', 'support'].every(key => Array.isArray(state[key]))) throw new Error('Unsupported data file. Your existing data has been preserved.');
    if (state.reviews === undefined) { state.reviews = []; await persist(state); }
    else if (!Array.isArray(state.reviews)) throw new Error('Unsupported reviews data. Your existing data has been preserved.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    state = { version: 1, users: [], bookings: [], savedRoutes: [], support: [], reviews: [] };
    await persist(state);
  }
  const server = http.createServer(handle);
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.on('error', error => { console.error(`SwiftBus could not start: ${error.message}`); process.exitCode = 1; });
  server.listen(PORT, '127.0.0.1', () => console.log(`SwiftBus local testing ready: http://127.0.0.1:${PORT}\nAccounts and bookings stay in ${DATA_DIR}\nDemo payments only. No money is charged.`));
  const housekeeping = setInterval(() => {
    const now = Date.now();
    for (const [key, session] of sessions) if (session.expires <= now) sessions.delete(key);
    for (const [key, bucket] of authAttempts) if (bucket.expires <= now) authAttempts.delete(key);
  }, 60000);
  housekeeping.unref();
  const shutdown = () => { server.close(() => writeQueue.finally(() => process.exit(0))); setTimeout(() => process.exit(0), 5000).unref(); };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
}
main().catch(error => { console.error(`SwiftBus could not start: ${error.message}`); process.exitCode = 1; });
