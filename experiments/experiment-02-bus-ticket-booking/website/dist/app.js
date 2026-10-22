'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const E = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => '₹' + Number(value || 0).toLocaleString('en-IN');
const dateValue = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const dateLabel = value => new Date(value + 'T12:00:00').toLocaleDateString('en-IN', {weekday:'short',day:'numeric',month:'short',year:'numeric'});
const cities = ['Bengaluru','Mysuru','Chennai','Hyderabad'];
const busCatalog=[{id:'rajdhani',name:'Rajdhani Express'},{id:'greenline',name:'Greenline Travels'},{id:'kaveri',name:'Kaveri Roadways'}];
const key = 'swiftbus-booking-draft-v2';
const readStored = () => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } };
const stored = readStored();
const state = {
  user:null,
  search:stored.search && cities.includes(stored.search.from) && cities.includes(stored.search.to) ? stored.search : {from:'Bengaluru',to:'Mysuru',date:dateValue(2),passengers:1},
  draft:stored.draft || null,
  trips:[], filters:{}, sort:'departure', booking:null, routes:[], requests:[], reviews:[], reviewBus:'all',reviewFormBus:'rajdhani',reviewEditing:null,editBooking:null,editTrip:null,returnTo:sessionStorage.getItem('swiftbus-return-to') || '', authNotice:'', renderId:0, busy:false, purchasing:false
};
if (state.search.date < dateValue() || state.search.date > dateValue(180)) state.search.date = dateValue(2);
state.search.passengers = Math.min(6, Math.max(1, Number(state.search.passengers) || 1));
const persist = () => { try { localStorage.setItem(key, JSON.stringify({search:state.search,draft:state.draft})); } catch { /* Browsers with storage disabled can still finish the current session. */ } };
function toast(message) { const box = $('#toast'); box.textContent = message; box.classList.add('visible'); clearTimeout(toast.timer); toast.timer = setTimeout(() => box.classList.remove('visible'), 4600); }
function errorBox(form, message) { const box = $('.form-error', form); if (box) { box.textContent = message || ''; box.classList.toggle('visible', !!message); if (message) box.scrollIntoView({block:'nearest'}); } else if (message) toast(message); }
async function api(path, options = {}) {
  let response;
  try { response = await fetch(path, {credentials:'same-origin', ...options, headers:{'Content-Type':'application/json', ...options.headers}, body:options.body === undefined ? undefined : JSON.stringify(options.body)}); }
  catch { throw Object.assign(new Error('Could not connect to SwiftBus. Check that the local server is running, then try again.'), {status:0}); }
  let data; try { data = await response.json(); } catch { throw new Error('SwiftBus returned an unexpected response. Please try again.'); }
  if (!response.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Please try again.'), {status:response.status,code:data.code});
  return data;
}
function routeName() { return location.hash.slice(1).split('/')[0] || 'search'; }
function go(route, replace = false) { if (replace) { history.replaceState(null,'','#'+route); render(); } else if (location.hash === '#'+route) render(); else location.hash = route; }
function requireLogin(returnTo, notice = 'Sign in to continue with your account.') { state.user = null; state.returnTo = returnTo; state.authNotice = notice; sessionStorage.setItem('swiftbus-return-to',returnTo); updateIdentity(); go('login',true); }
function updateIdentity() {
  const user = state.user;
  const initials = user ? user.name.trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase() : 'S';
  $('#sidebar-profile').innerHTML = `<span class="avatar">${E(initials)}</span><span><strong>${E(user ? user.name : 'Welcome to SwiftBus')}</strong><small>${E(user ? 'Manage your account' : 'Sign in to your account')}</small></span><b>›</b>`;
  $('#sidebar-profile').href = user ? '#account' : '#login';
  $('#header-account').textContent = user ? user.name.split(' ')[0] + ' · Account' : 'Sign in';
  $('#header-account').href = user ? '#account' : '#login';
}
function protectDraftIdentity(user) {
  if (!user || !state.draft?.ownerId || state.draft.ownerId===user.id) return;
  state.draft.passengers=[];state.draft.contact={};state.draft.idempotencyKey='';state.draft.ownerId=user.id;
  state.booking=null;state.routes=[];state.requests=[];state.reviews=[];state.reviewEditing=null;state.editBooking=null;persist();
}
async function verifyCurrentAccount() {
  const result=await api('/api/session');
  if(!result.user)throw Object.assign(new Error('Your session has ended. Please sign in again.'),{status:401});
  if(result.user.id!==state.user?.id){protectDraftIdentity(result.user);state.user=result.user;updateIdentity();throw Object.assign(new Error('The signed-in account changed in another tab. Please review this page before continuing.'),{code:'ACCOUNT_CHANGED'});}
}
const art = `<svg class="hero-art" viewBox="0 0 350 200" aria-hidden="true"><ellipse cx="190" cy="168" rx="140" ry="15" fill="#121932" opacity=".35"/><path d="M21 165H343" stroke="#8275bc" stroke-dasharray="9 13" opacity=".55"/><circle cx="301" cy="31" r="18" fill="#8b79ce" opacity=".18"/><path d="M45 111V61q0-17 17-17h224q20 0 24 20l10 58v21H45Z" fill="#f4f2ff"/><path d="M56 66q0-10 10-10h200q11 0 14 10l9 38H56Z" fill="#332d60"/><path d="M75 57v46m44-46v46m44-46v46m44-46v46m44-46v46" stroke="#c3bce5" stroke-width="5"/><path d="M281 63h8q9 0 11 11l5 30h-14Z" fill="#52477f"/><path d="M45 116h268v25H45Z" fill="#7865d7"/><path d="M57 122h190" stroke="#d8d1fa" stroke-width="3"/><path d="M284 112v31" stroke="#d5cfed" stroke-width="2"/><rect x="46" y="107" width="8" height="6" rx="2" fill="#f8d57a"/><rect x="305" y="110" width="8" height="9" rx="2" fill="#ffda85"/><circle cx="97" cy="144" r="19" fill="#292743"/><circle cx="97" cy="144" r="9" fill="#c5bddc"/><circle cx="266" cy="144" r="19" fill="#292743"/><circle cx="266" cy="144" r="9" fill="#c5bddc"/><text x="153" y="136" font-family="Arial,sans-serif" font-size="11" fill="white" font-weight="bold" letter-spacing="1">SWIFTBUS</text><path d="M321 72v70" stroke="#9182bb" stroke-width="2"/><path d="M318 75h-8" stroke="#9182bb" stroke-width="2"/><path d="M9 101v52m-6-29h12" stroke="#9c90c8" stroke-width="2" opacity=".5"/></svg>`;
function progress(step) { return `<ol class="progress" aria-label="Booking progress">${['Search','Choose bus','Seats','Travellers','Payment','Ticket'].map((s,i)=>`<li class="${i===step?'active':i<step?'done':''}"><span>${i<step?'✓':i+1}</span>${s}</li>`).join('')}</ol>`; }
const intro = (title, body) => `<div class="page-intro"><h2>${E(title)}</h2><p>${E(body)}</p></div>`;
const empty = (title, body, action = '<a class="button primary" href="#search">Find a journey →</a>', icon = '⌕') => `<div class="empty-state"><div class="empty-icon">${icon}</div><h3>${E(title)}</h3><p>${E(body)}</p>${action}</div>`;
const loading = () => '<div class="loading-panel" role="status"><span class="spinner"></span>Finding the latest information…</div>';
const formError = '<div class="form-error" role="alert"></div>';
function options(list, current) { return list.map(v=>`<option value="${E(v)}" ${v===current?'selected':''}>${E(v)}</option>`).join(''); }
function pricing() { const d = state.draft; const baseFare = d.trip.price*d.seats.length; const discount = d.coupon==='SWIFT10'?Math.round(baseFare*.1):0; const tax = Math.round((baseFare-discount)*.05); return {baseFare,discount,tax,fee:29,total:baseFare-discount+tax+29}; }
function fareRows(p) { return `<div class="fare-row"><span>Base fare</span><b>${money(p.baseFare)}</b></div>${p.discount?`<div class="fare-row discount"><span>SWIFT10 discount</span><b>−${money(p.discount)}</b></div>`:''}<div class="fare-row"><span>Tax (5%)</span><b>${money(p.tax)}</b></div><div class="fare-row"><span>Booking fee</span><b>${money(p.fee)}</b></div><div class="fare-total"><span>Total amount</span><b>${money(p.total)}</b></div>`; }
function summary(button = '', withCoupon = false) {
  const d = state.draft, s = d.search;
  return `<aside class="card summary-card"><p class="summary-label">YOUR JOURNEY</p><div class="summary-route">${E(s.from)} <span>→</span> ${E(s.to)}</div><p class="summary-meta">${E(dateLabel(s.date))}<br>${E(d.trip.name)} · ${E(d.trip.departure)}<br>${E(d.trip.type)} · ${d.seats.length}/${s.passengers} seats selected${d.seats.length?'<br>Seats '+E(d.seats.join(', ')):''}</p><hr class="summary-divider">${withCoupon?`<form class="coupon-form" data-form="coupon"><input aria-label="Promo code" name="coupon" placeholder="Promo code" maxlength="30" value="${E(d.coupon || '')}"><button class="button light small" type="submit">${d.coupon?'Remove':'Apply'}</button></form><p class="coupon-status" id="coupon-status">${d.coupon?'SWIFT10 applied. You saved '+money(pricing().discount)+'.':'Try SWIFT10 for 10% off your base fare.'}</p>`:''}<div id="fare-summary">${fareRows(pricing())}</div>${button}<p class="summary-footnote">The final fare is verified when you book.<br>Payments are simulated for testing.</p></aside>`;
}
function searchPage() {
  const s = state.search;
  return `<section class="hero"><div class="hero-copy"><span class="hero-label">GOOD JOURNEYS START WITH A GOOD SEAT</span><h2>A new destination.<br><span>A smoother journey.</span></h2><p>Compare buses, choose your favourite seat, and make your next trip a little more effortless.</p></div>${art}</section>
  <form class="card search-panel" data-form="search"><label class="field">From<select name="from" id="from-city">${options(cities,s.from)}</select></label><button class="swap" type="button" data-action="swap" aria-label="Swap departure and destination">⇄</button><label class="field">To<select name="to" id="to-city">${options(cities,s.to)}</select></label><label class="field">Travel date<input type="date" name="date" id="travel-date" min="${dateValue()}" max="${dateValue(180)}" value="${E(s.date)}" required></label><label class="field">Passengers<select name="passengers" id="passengers">${[1,2,3,4,5,6].map(n=>`<option value="${n}" ${n===s.passengers?'selected':''}>${n} traveller${n>1?'s':''}</option>`).join('')}</select></label><button type="submit" class="button primary search-button">Search buses <span>→</span></button>${formError}</form>
  <div class="home-lower"><section><div class="section-head"><div><h3>Popular journeys</h3><p>Good places. Great connections.</p></div></div><div class="route-cards">${[['Bengaluru','Mysuru'],['Bengaluru','Chennai'],['Chennai','Hyderabad']].map(([from,to])=>`<button class="card route-card" type="button" data-action="popular" data-from="${from}" data-to="${to}"><div class="route-icon">↗</div><strong>${from} → ${to}</strong><span>Daily departures · Multiple operators</span><b>Explore buses →</b></button>`).join('')}</div></section><aside class="offer-card"><span>✦</span><div><h3>A little extra for your journey.</h3><p>Save 10% on the base fare with this demo offer.</p></div><span class="coupon-label">USE SWIFT10</span></aside></div>
  <div class="trust-row"><div><span>✓</span><div><strong>Your seat, your choice</strong><small>Choose from live seat availability.</small></div></div><div><span>▤</span><div><strong>Everything in one place</strong><small>Bookings, tickets, and saved routes.</small></div></div><div><span>♧</span><div><strong>Clear fares, always</strong><small>Review the full fare before booking.</small></div></div></div>`;
}
function routeSummary() { const s = state.search; return `<div class="card route-summary"><div><strong>${E(s.from)}</strong><small>DEPARTURE</small></div><span class="direction">→</span><div><strong>${E(s.to)}</strong><small>DESTINATION</small></div><span class="route-meta">${E(dateLabel(s.date))} · ${s.passengers} traveller${s.passengers>1?'s':''}</span><button class="button secondary small" data-action="save-route">♡ Save route</button><a class="button light small" href="#search">Modify search</a></div>`; }
function filteredTrips() {
  const types=['ac','sleeper'].filter(k=>state.filters[k]),times=['early','afternoon','night'].filter(k=>state.filters[k]);
  let trips = state.trips.filter(t=>types.every(k=>(t.tags||[]).includes(k)) && (!times.length || times.some(k=>(t.tags||[]).includes(k))));
  const sorter = {price:(a,b)=>a.price-b.price,rating:(a,b)=>Number(b.rating)-Number(a.rating),departure:(a,b)=>a.departure.localeCompare(b.departure)};
  return trips.sort(sorter[state.sort] || sorter.departure);
}
function busCards() {
  const trips = filteredTrips();
  if (!trips.length) return empty('No buses match these filters','Try clearing a filter to see all available operators.', '<button class="button light" data-action="clear-filters">Clear filters</button>', '↗');
  return trips.map(t=>`<article class="card bus-card"><div class="bus-card-main"><div class="operator"><span class="operator-icon">▰</span><div><h3>${E(t.name)}</h3><p>${E(t.type)}</p><span class="rating">★ ${E(t.rating)}</span></div></div><div class="time-line"><div><strong>${E(t.departure)}</strong><small>${E(state.search.from)}</small></div><div class="duration">${E(t.duration)}<span></span>Direct</div><div><strong>${E(t.arrival)}</strong><small>${E(state.search.to)}</small></div></div><div class="bus-price"><strong>${money(t.price)}</strong><small>per traveller</small><button class="button primary" data-action="choose-bus" data-id="${E(t.id)}" ${t.departed || t.availableSeats<state.search.passengers?'disabled':''}>${t.departed?'Departed':t.availableSeats<state.search.passengers?'Not enough seats':'Select seats →'}</button></div></div><div class="bus-card-bottom"><div class="amenities">${(t.amenities||[]).map(a=>`<span>◇ ${E(a)}</span>`).join('')}</div><div class="bus-card-extras"><span class="available">${t.departed?'Departure has passed':t.availableSeats+' seats available'}</span><button class="text-button" data-action="review-bus" data-id="${E(t.id)}">Review this bus</button></div></div></article>`).join('');
}
function resultsPage() {
  return `${progress(1)}${routeSummary()}<div class="results-layout"><aside class="card filters"><div class="filter-head"><h3>Filters</h3><button class="text-button" data-action="clear-filters">Reset</button></div><div class="filter-group"><strong>BUS TYPE</strong>${[['ac','Air conditioned'],['sleeper','Sleeper']].map(([key,label])=>`<label class="check-row"><input type="checkbox" data-filter="${key}" ${state.filters[key]?'checked':''}>${label}</label>`).join('')}</div><div class="filter-group"><strong>DEPARTURE</strong>${[['early','Morning'],['afternoon','Afternoon'],['night','Night']].map(([key,label])=>`<label class="check-row"><input type="checkbox" data-filter="${key}" ${state.filters[key]?'checked':''}>${label}</label>`).join('')}</div></aside><section><div class="results-toolbar"><strong id="result-count">${filteredTrips().length} buses found</strong><label class="sort-control">Sort by<select id="sort-trips" aria-label="Sort buses">${[['departure','Departure time'],['price','Lowest price'],['rating','Highest rating']].map(([value,label])=>`<option value="${value}" ${state.sort===value?'selected':''}>${label}</option>`).join('')}</select></label></div><div id="bus-results">${busCards()}</div></section></div>`;
}
function seatsPage() {
  const d = state.draft, t = d.trip;
  const seatButtons = Array.from({length:6},(_,i)=>['A','B','C','D'].map(c=>`${i+1}${c}`)).flat().map(seat=>{ const booked = t.bookedSeats.includes(seat); const selected = d.seats.includes(seat); return `<button type="button" class="seat ${booked?'booked':selected?'selected':''}" data-action="seat" data-seat="${seat}" aria-label="Seat ${seat}${booked?', unavailable':''}" aria-pressed="${selected}" ${booked || t.departed?'disabled':''}>${seat}</button>`; }).join('');
  return `${progress(2)}${intro('A seat with your name on it.','Choose exactly '+d.search.passengers+' seat'+(d.search.passengers>1?'s':'')+' and your boarding and dropping points.')}<div class="journey-layout"><form class="card seat-section" data-form="seats"><div class="seat-head"><h3>${E(t.name)}</h3><span class="rating">★ ${E(t.rating)} · ${E(t.type)}</span></div><div class="legend"><span><i></i>Available</span><span><i class="chosen"></i>Selected</span><span><i class="booked"></i>Unavailable</span></div><div class="bus-layout"><div class="driver">FRONT OF BUS <span>◉</span></div><div class="seat-grid">${seatButtons}</div></div><p class="selection-note" id="selection-note">${d.seats.length} of ${d.search.passengers} seats selected${d.seats.length?' · '+E(d.seats.join(', ')):''}</p><div class="boarding-grid"><label class="field">Boarding point<select name="boardingId" required>${t.boardingPoints.map(p=>`<option value="${E(p.id)}" ${d.boardingId===p.id?'selected':''}>${E(p.label)} · ${E(p.time)}</option>`).join('')}</select></label><label class="field">Dropping point<select name="droppingId" required>${t.droppingPoints.map(p=>`<option value="${E(p.id)}" ${d.droppingId===p.id?'selected':''}>${E(p.label)} · ${E(p.time)}</option>`).join('')}</select></label></div><div class="form-actions"><a class="text-button" href="#results">← Choose another bus</a><button type="submit" class="button primary" id="continue-seats" ${d.seats.length!==d.search.passengers || t.departed?'disabled':''}>Continue to travellers →</button></div>${formError}</form><div id="journey-summary">${summary()}</div></div>`;
}
function passengerValues() { const d = state.draft; return d.seats.map(seat=>d.passengers.find(p=>p.seat===seat) || {seat,name:'',age:'',gender:''}); }
function passengersPage() {
  const d = state.draft;
  return `${progress(3)}${intro('Who’s coming along?','Add the traveller details and contact information for this booking.')}<div class="journey-layout"><form data-form="passengers"><section class="card panel"><div class="panel-title"><span>1</span><h3>Traveller details</h3></div>${passengerValues().map((p,i)=>`<div class="passenger-panel"><strong>Traveller ${i+1}<span>Seat ${E(p.seat)}</span></strong><div class="form-grid three"><label class="field">Traveller ${i+1} full name<input name="name-${i}" autocomplete="name" minlength="2" maxlength="70" placeholder="Name as on your ID" value="${E(p.name)}" required></label><label class="field">Traveller ${i+1} age<input name="age-${i}" type="number" min="1" max="100" inputmode="numeric" value="${E(p.age)}" placeholder="Age" required></label><label class="field">Traveller ${i+1} gender<select name="gender-${i}" required><option value="">Select gender</option>${options(['Male','Female','Other'],p.gender)}</select></label></div></div>`).join('')}</section><section class="card panel"><div class="panel-title"><span>2</span><h3>Booking contact</h3></div><div class="form-grid"><label class="field">Contact email<input type="email" name="email" autocomplete="email" maxlength="254" placeholder="you@example.com" value="${E(d.contact.email || state.user?.email || '')}" required></label><label class="field">Contact phone<input type="tel" name="phone" autocomplete="tel" inputmode="numeric" pattern="[6-9][0-9]{9}" minlength="10" maxlength="10" placeholder="10-digit mobile number" title="Enter a 10-digit Indian mobile number starting with 6, 7, 8, or 9." value="${E(d.contact.phone || state.user?.phone || '')}" required></label></div><p class="inline-note">These details appear on your demo ticket. No SMS or email is sent.</p>${formError}<div class="form-actions"><a class="text-button" href="#seats">← Change seats</a><button type="submit" class="button primary">Review & continue →</button></div></section></form>${summary()}</div>`;
}
function paymentPage() {
  const d = state.draft;
  return `${progress(4)}${intro('One last stop before you go.','Review your journey and choose a payment method to simulate your purchase.')}<div class="journey-layout"><form data-form="payment"><div class="info-note">This is a local testing website. Payment is simulated: no bank, UPI, or card details are collected and no money is charged.</div><section class="card panel"><div class="panel-title"><span>✓</span><h3>Review your travellers</h3></div><div class="mini-passengers">${d.passengers.map(p=>`<div><b>${E(p.name)}</b> · ${E(p.age)} years · ${E(p.gender)} · Seat ${E(p.seat)}</div>`).join('')}</div><p class="inline-note">Contact: ${E(d.contact.email)} · ${E(d.contact.phone)}<br>Boarding: ${E(d.trip.boardingPoints.find(p=>p.id===d.boardingId)?.label)}<br>Dropping: ${E(d.trip.droppingPoints.find(p=>p.id===d.droppingId)?.label)}</p><a class="text-button" href="#passengers">Edit traveller details</a></section><section class="card panel"><div class="panel-title"><span>3</span><h3>Choose payment method</h3></div><div class="payment-options">${[['upi','UPI','Instant payment simulation','↗'],['card','Debit / credit card','Card payment simulation','▰'],['netbanking','Net banking','Bank transfer simulation','▤']].map(([id,label,description,icon])=>`<label class="payment-choice ${d.paymentMethod===id?'selected':''}"><input type="radio" name="paymentMethod" value="${id}" ${d.paymentMethod===id?'checked':''} required><span class="payment-icon">${icon}</span><span><strong>${label}</strong><small>${description}</small></span></label>`).join('')}</div>${formError}<div class="form-actions"><a class="text-button" href="#passengers">← Back to travellers</a><button type="submit" class="button primary" id="pay-button">Simulate payment · ${money(pricing().total)}</button></div><p class="inline-note">Confirming creates a saved demo booking and a downloadable ticket.</p></section></form>${summary('',true)}</div>`;
}
const statusPill = b => `<span class="status-pill ${b.status==='cancelled'?'cancelled':''}">${b.status==='cancelled'?'CANCELLED':'CONFIRMED'}</span>`;
function ticketPage(b, confirmed = false) {
  const id = encodeURIComponent(b.id), cancelled = b.status==='cancelled';
  const canEdit=!cancelled && b.date>=dateValue();
  return `${confirmed?progress(5):'<a class="navigation-back" href="#bookings">← My bookings</a>'}${confirmed?`<div class="ticket-success"><div class="success-icon">${cancelled?'↶':'✓'}</div><h2>${cancelled?'Booking cancelled':'You’re all booked!'}</h2><p>${cancelled?'Your simulated refund has been recorded.':'Your journey is confirmed. Your demo ticket is ready below.'}</p></div>`:intro('Your journey, all in one place.','View your booking details, download your ticket, or manage your reservation.')}<article class="ticket"><div class="ticket-top"><div class="ticket-brand">SwiftBus<small>DEMO E-TICKET · NOT VALID FOR TRAVEL</small></div><div class="ticket-pnr"><small>BOOKING PNR</small><strong>${E(b.pnr)}</strong></div></div><div class="ticket-body"><div class="ticket-route"><div><h3>${E(b.from)}</h3><p>${E(b.departure)} · ${E(dateLabel(b.date))}</p></div><span>→</span><div><h3>${E(b.to)}</h3><p>${E(b.arrival)} · ${E(b.duration)}</p></div>${statusPill(b)}</div><div class="ticket-info"><div><small>OPERATOR</small><strong>${E(b.busName)}<br>${E(b.busType)}</strong></div><div><small>BOARDING</small><strong>${E(b.boarding.label)}<br>${E(b.boarding.time)}</strong></div><div><small>DROPPING</small><strong>${E(b.dropping.label)}<br>${E(b.dropping.time)}</strong></div></div><div class="ticket-columns"><section><h3>Traveller details</h3>${b.passengers.map(p=>`<div class="ticket-person"><b>${E(p.seat)}</b><span>${E(p.name)}<br>${E(p.age)} years · ${E(p.gender)}</span></div>`).join('')}<p class="ticket-contact">${E(b.contact.email)}<br>${E(b.contact.phone)}</p><p class="ticket-contact">Payment: ${E({upi:'UPI',card:'Debit / credit card',netbanking:'Net banking'}[b.paymentMethod] || b.paymentMethod)} · Simulated</p></section><section><h3>Fare breakdown</h3>${fareRows(b.pricing)}${cancelled?`<div class="fare-row discount"><span>Simulated refund</span><b>${money(b.refund)}</b></div>`:''}</section></div></div><div class="ticket-bottom"><p>Keep your demo ticket for testing.<br>For names in regional scripts, use Print ticket and save as PDF.</p><div class="booking-actions"><a href="/api/bookings/${id}/ticket.pdf" class="button primary" download>↓ Download PDF</a><a href="/api/bookings/${id}/ticket.html" class="button secondary" target="_blank" rel="noopener">Print ticket</a></div></div></article><div class="ticket-actions">${canEdit?`<a class="button primary" href="#edit/${id}">Edit booking</a>`:''}<button class="button light" data-action="review-bus" data-id="${E(b.busId)}">☆ Review this bus</button><a class="button secondary" href="#bookings">My bookings</a>${!cancelled?`<button class="button secondary" data-action="cancel" data-id="${E(b.id)}">Cancel booking</button>`:''}<button class="button secondary" data-action="change-journey">Book a different journey</button></div><p class="receipt-notice">LOCAL TESTING ONLY · NOT A REAL TRAVEL TICKET</p>`;
}
function bookingsPage(bookings) {
  return `${intro('Your journeys, organised.','All bookings made with your SwiftBus account are saved here.')}<div class="section-head"><h3>${bookings.length} booking${bookings.length===1?'':'s'}</h3><a class="button primary small" href="#search">+ New journey</a></div>${bookings.length?bookings.map(b=>{ const date = new Date(b.date+'T12:00:00'); return `<article class="card booking-card"><div class="booking-date"><strong>${date.getDate()}</strong><span>${date.toLocaleDateString('en-IN',{month:'short'})}</span></div><div class="booking-detail"><h3>${E(b.from)} → ${E(b.to)}</h3><p>${E(b.busName)} · ${E(b.departure)} · Seats ${E(b.seats.join(', '))}<br>PNR ${E(b.pnr)} · ${E(dateLabel(b.date))}</p></div><div class="booking-end"><div>${statusPill(b)}<strong>${money(b.pricing.total)}</strong></div><a class="button secondary small" href="#booking/${encodeURIComponent(b.id)}">View ticket →</a></div></article>`; }).join(''):empty('Your first journey is waiting.','Search for a bus and complete a demo purchase. Your ticket will appear here.',undefined,'▤')}`;
}
function savedPage() {
  return `${intro('Your favourite routes.','Save a route from the search results and come back whenever you’re ready.')}<div class="section-head"><h3>${state.routes.length} saved route${state.routes.length===1?'':'s'}</h3><a class="button primary small" href="#search">Explore journeys</a></div>${state.routes.length?`<div class="saved-grid">${state.routes.map(r=>`<article class="card saved-card"><div class="route-icon">♡</div><h3>${E(r.from)} → ${E(r.to)}</h3><p>Choose your date and find a bus.</p><div class="form-actions"><button class="button light small" data-action="saved-search" data-id="${E(r.id)}">Search route →</button><button class="icon-button" data-action="remove-route" data-id="${E(r.id)}" aria-label="Remove saved route ${E(r.from)} to ${E(r.to)}">×</button></div></article>`).join('')}</div>`:empty('Keep your go-to routes close.','Use “Save route” in the search results to add your favourite journeys.',undefined,'♡')}`;
}
function supportPage() {
  const faqs = [['How do I book a bus ticket?','Search your route and date, choose a bus, select seats, add traveller details, and simulate payment. Create an account or sign in before payment.'],['How do I download or print my ticket?','Open My bookings, select View ticket, and choose Download PDF or Print ticket. Tickets stay available after you sign back in.'],['Can I cancel a booking?','Yes. Open your ticket and select Cancel booking. The simulated refund is recorded immediately and the booked seats become available again.'],['Are payments and travel tickets real?','This app is for local testing. Payment methods simulate a purchase, no money is charged, and every ticket is marked DEMO / NOT VALID FOR TRAVEL.'],['Where are my account and bookings stored?','Your account, bookings, saved routes, and support requests are kept by the local SwiftBus server on this computer. No support message, SMS, or email is sent outside the app.']];
  return `${intro('A little help for the journey.','Find answers below or create a local support request.')}<div class="support-layout"><section class="card faq"><h3>Frequently asked questions</h3>${faqs.map(([q,a],i)=>`<details ${i===0?'open':''}><summary>${E(q)}</summary><p>${E(a)}</p></details>`).join('')}</section><section>${state.user?`<form class="card panel" data-form="support"><div class="panel-title"><span>?</span><h3>Send a support request</h3></div><label class="field">Subject<input name="subject" placeholder="What can we help with?" minlength="5" maxlength="120" required></label><label class="field" style="margin-top:18px">Message<textarea name="message" placeholder="Tell us a little more…" minlength="10" maxlength="2000" required></textarea></label><p class="inline-note">Saved locally for testing. This form does not contact an external support team.</p>${formError}<div class="form-actions"><button type="submit" class="button primary">Create local request →</button></div></form><div class="card panel"><h3>Your requests</h3>${state.requests.length?state.requests.map(r=>`<article class="request-card"><div class="section-head" style="margin:0"><h3>${E(r.subject)}</h3><span class="status-pill">${E(r.status)}</span></div><p>${E(r.message)}</p><small>${E(new Date(r.createdAt).toLocaleString('en-IN'))}</small></article>`).join(''):'<p class="inline-note">No requests yet. A request you submit will appear here.</p>'}</div>`:empty('Sign in for personal support.','Create an account or sign in to save and review your local support requests.','<button class="button primary" data-action="support-login">Sign in →</button>','?')}</section></div>`;
}
function bookingEditPage(b,t) {
  if(b.status!=='confirmed' || t.departed || b.date<dateValue())return empty('This booking can’t be edited.','Only upcoming confirmed bookings can be updated.','<a class="button primary" href="#booking/'+encodeURIComponent(b.id)+'">Back to ticket</a>','▤');
  return `<a class="navigation-back" href="#booking/${encodeURIComponent(b.id)}">← Back to your ticket</a>${intro('Your details, your way.','Update the travellers, contact information, and boarding or dropping points for this booking.')}<div class="journey-layout"><form data-form="edit-booking"><section class="card panel"><div class="panel-title"><span>1</span><h3>Traveller details</h3></div>${b.passengers.map((p,i)=>`<div class="passenger-panel"><strong>Traveller ${i+1}<span>Seat ${E(p.seat)}</span></strong><div class="form-grid three"><label class="field">Traveller ${i+1} full name<input name="name-${i}" minlength="2" maxlength="70" value="${E(p.name)}" required></label><label class="field">Traveller ${i+1} age<input name="age-${i}" type="number" min="1" max="100" value="${E(p.age)}" required></label><label class="field">Traveller ${i+1} gender<select name="gender-${i}" required>${options(['Male','Female','Other'],p.gender)}</select></label></div></div>`).join('')}</section><section class="card panel"><div class="panel-title"><span>2</span><h3>Contact & travel points</h3></div><div class="form-grid"><label class="field">Contact email<input name="email" type="email" maxlength="254" value="${E(b.contact.email)}" required></label><label class="field">Contact phone<input name="phone" type="tel" inputmode="numeric" maxlength="10" pattern="[6-9][0-9]{9}" value="${E(b.contact.phone)}" required></label><label class="field">Boarding point<select name="boardingId" required>${t.boardingPoints.map(p=>`<option value="${E(p.id)}" ${p.id===b.boarding.id?'selected':''}>${E(p.label)} · ${E(p.time)}</option>`).join('')}</select></label><label class="field">Dropping point<select name="droppingId" required>${t.droppingPoints.map(p=>`<option value="${E(p.id)}" ${p.id===b.dropping.id?'selected':''}>${E(p.label)} · ${E(p.time)}</option>`).join('')}</select></label></div><p class="inline-note">Saved changes also appear on your downloadable and printable ticket.</p>${formError}<div class="form-actions"><a class="text-button" href="#booking/${encodeURIComponent(b.id)}">Discard changes</a><button class="button primary" type="submit">Save booking changes →</button></div></section></form><aside class="card summary-card edit-booking-summary"><p class="summary-label">BOOKING ${E(b.pnr)}</p><div class="summary-route">${E(b.from)} <span>→</span> ${E(b.to)}</div><p class="summary-meta">${E(dateLabel(b.date))}<br>${E(b.busName)} · ${E(b.departure)}<br>Seats ${E(b.seats.join(', '))}</p><hr class="summary-divider">${fareRows(b.pricing)}<p class="summary-footnote">Your route, seats, and fare remain attached to this booking. To choose a different journey or seats, make a new booking and manage this one separately.</p><button class="button light wide" style="margin-top:18px" type="button" data-action="change-journey">Book a different journey</button></aside></div>`;
}
function reviewBusOptions(selected, includeAll=false) {return `${includeAll?'<option value="all">All operators</option>':''}${busCatalog.map(b=>`<option value="${b.id}" ${selected===b.id?'selected':''}>${E(b.name)}</option>`).join('')}`;}
function reviewEditor(edited, formBus) {
  if (!state.user) return `<div class="panel-title"><span>☆</span><h3>Share your experience</h3></div><p class="review-login">Sign in to write your own star rating and review. You can edit or delete your feedback anytime.<br><button class="button primary" data-action="reviews-login">Sign in to write a review →</button></p>`;
  const existing=state.reviews.find(r=>r.mine && r.busId===formBus);
  const selection=`<label class="field">Bus operator<select name="busId" id="review-bus-select" ${edited?'disabled':''}>${reviewBusOptions(formBus)}</select></label>`;
  if (!edited && existing) return `<form data-form="review"><div class="panel-title"><span>☆</span><h3>Write your review</h3></div>${selection}<div class="info-note">You’ve already reviewed this operator. Edit your existing feedback, or choose a different operator above to write another review.</div><button class="button primary" type="button" data-action="edit-review" data-id="${E(existing.id)}">Edit existing review →</button></form>`;
  return `<form data-form="review"><div class="panel-title"><span>☆</span><h3>${edited?'Edit your review':'Write your review'}</h3></div>${selection}<fieldset class="rating-field"><legend>Your rating</legend><div class="rating-options">${[1,2,3,4,5].map(n=>`<label><input type="radio" name="rating" value="${n}" aria-label="${n} star${n>1?'s':''}" ${edited?.rating===n?'checked':''} required>${n}★</label>`).join('')}</div></fieldset><label class="field">Review title<input name="title" placeholder="Sum up your experience" minlength="3" maxlength="100" value="${E(edited?.title || '')}" required></label><label class="field">Your review<textarea name="comment" placeholder="What worked well? What could be better?" minlength="10" maxlength="2000" required>${E(edited?.comment || '')}</textarea></label><p class="inline-note">Reviews are saved in this local app. You can write one review per operator and edit it whenever you like.</p>${formError}<div class="form-actions"><button class="button primary" type="submit">${edited?'Save changes':'Post review'} →</button>${edited?'<button class="text-button" data-action="cancel-review-edit" type="button">Cancel</button>':''}</div>${edited?'<button class="button light wide" style="margin-top:18px" data-action="new-review" type="button">Write another review</button>':''}</form>`;
}
function reviewsPage() {
  const visible=state.reviews.filter(r=>state.reviewBus==='all' || r.busId===state.reviewBus);
  const average=visible.length?(visible.reduce((sum,r)=>sum+r.rating,0)/visible.length).toFixed(1):'—';
  const edited=state.reviewEditing?state.reviews.find(r=>r.id===state.reviewEditing && r.mine):null;
  const formBus=edited?.busId || state.reviewFormBus;
  const reviewCards=visible.length?visible.map(r=>`<article class="card review-card"><div class="review-author"><span class="avatar">${E(r.author.trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase())}</span><div><strong>${E(r.author)}${r.mine?' · You':''}</strong><small>${E(r.busName)} · ${E(new Date(r.createdAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}))}</small></div><span class="review-stars" aria-label="${r.rating} out of 5 stars">${'★'.repeat(r.rating)+'☆'.repeat(5-r.rating)}</span></div><h3>${E(r.title)}</h3><p>${E(r.comment)}</p><div class="review-meta"><span>${r.verifiedBooking?'✓ Booked in demo':'Local testing review'}${r.updatedAt!==r.createdAt?' · Edited':''}</span>${r.mine?`<div class="review-actions"><button class="button light small" data-action="edit-review" data-id="${E(r.id)}">Edit</button><button class="button secondary small" data-action="delete-review" data-id="${E(r.id)}">Delete</button></div>`:''}</div></article>`).join(''):'<div class="review-no-data">No reviews for this operator yet. Share your experience to start the conversation.</div>';
  return `${intro('Good journeys deserve a conversation.','Read traveller feedback and share your own experience with a bus operator.')}<div class="review-summary"><strong>${average}</strong><div><span class="review-stars">${visible.length?'★'.repeat(Math.round(Number(average)))+'☆'.repeat(5-Math.round(Number(average))):'☆☆☆☆☆'}</span><p>${visible.length} local review${visible.length===1?'':'s'} · ${state.reviewBus==='all'?'All operators':E(busCatalog.find(b=>b.id===state.reviewBus)?.name)}</p></div></div><div class="review-layout"><section><div class="review-toolbar"><h3>Traveller reviews</h3><label class="field">Filter by operator<select id="review-filter">${reviewBusOptions(state.reviewBus,true)}</select></label></div>${reviewCards}</section><aside class="card panel review-editor">${reviewEditor(edited,formBus)}</aside></div>`;
}
function passwordField(label, name, autocomplete) { const id = 'input-'+name; return `<div class="field"><span class="password-label"><label for="${id}">${E(label)}</label><button type="button" class="password-show" data-action="show-password" data-target="${id}" aria-controls="${id}" aria-pressed="false">Show</button></span><input id="${id}" name="${name}" type="password" minlength="8" maxlength="128" autocomplete="${autocomplete}" required></div>`; }
function accountPage() {
  const u = state.user;
  return `${intro('Make yourself at home.','Manage your profile, account password, and saved journeys.')}<div class="card account-heading"><span class="avatar">${E(u.name.trim().split(/\s+/).slice(0,2).map(v=>v[0]).join('').toUpperCase())}</span><div><h3>${E(u.name)}</h3><p>${E(u.email)}</p></div></div><div class="account-layout"><form class="card panel" data-form="profile"><div class="panel-title"><span>1</span><h3>Your profile</h3></div><div class="form-grid"><label class="field full">Full name<input name="name" autocomplete="name" minlength="2" maxlength="70" value="${E(u.name)}" required></label><label class="field full">Email address<input name="email" value="${E(u.email)}" type="email" maxlength="254" autocomplete="email" required></label><label class="field full">Phone number (optional)<input name="phone" type="tel" inputmode="numeric" pattern="[6-9][0-9]{9}" maxlength="10" autocomplete="tel" placeholder="10-digit mobile number" value="${E(u.phone)}"></label></div>${formError}<div class="form-actions"><button class="button primary" type="submit">Save profile</button><button class="text-button" type="button" data-action="logout">Sign out</button></div></form><form class="card panel" data-form="password"><div class="panel-title"><span>2</span><h3>Change your password</h3></div>${passwordField('Current password','currentPassword','current-password')}<div style="margin-top:18px">${passwordField('New password','newPassword','new-password')}</div><div style="margin-top:18px">${passwordField('Confirm new password','confirmPassword','new-password')}</div><p class="inline-note">Use at least 8 characters for your new password.</p>${formError}<div class="form-actions"><button class="button primary" type="submit">Update password</button></div></form></div>`;
}
function authPage(register = false) {
  return `<div class="auth-layout"><aside class="auth-story"><span class="hero-label">EVERY JOURNEY BEGINS HERE</span><h2>Your next adventure.<br>One simple account.</h2><p>Choose a seat, keep your tickets close, and make every journey feel a little easier.</p>${art}<small>Local testing · No real payments or travel tickets</small></aside><form class="auth-form" data-form="${register?'register':'login'}"><h2>${register?'Create your account':'Welcome back.'}</h2><p class="muted">${register?'A few details and you’re ready to go.':'Sign in to continue your journey.'}</p>${state.authNotice?`<div class="info-note">${E(state.authNotice)}</div>`:''}${register?'<label class="field">Full name<input name="name" autocomplete="name" placeholder="Your full name" minlength="2" maxlength="70" required></label>':''}<label class="field">Email address<input type="email" name="email" autocomplete="email" placeholder="you@example.com" maxlength="254" required></label>${passwordField('Password','password',register?'new-password':'current-password')}${register?'<label class="field">Phone number (optional)<input name="phone" type="tel" inputmode="numeric" autocomplete="tel" pattern="[6-9][0-9]{9}" maxlength="10" placeholder="10-digit mobile number"></label>':''}${formError}<button type="submit" class="button primary wide">${register?'Create account':'Sign in'} →</button><p class="auth-switch">${register?'Already have an account? <a href="#login">Sign in</a>':'New to SwiftBus? <a href="#register">Create an account</a>'}</p><p class="login-note">This creates a SwiftBus testing account on this computer. It is separate from accounts on other travel websites.</p></form></div>`;
}
function guardDraft(stage) {
  const d = state.draft;
  if (!d?.trip || !d?.search || !Array.isArray(d.seats)) { go('search',true); toast('Search for a journey to start your booking.'); return false; }
  if (stage!=='seats' && d.seats.length!==Number(d.search.passengers)) { go('seats',true); toast('Choose one seat for every traveller before continuing.'); return false; }
  const validPassengers=Array.isArray(d.passengers) && d.passengers.length===d.seats.length && d.seats.every(seat=>d.passengers.filter(p=>p.seat===seat && typeof p.name==='string' && p.name.trim().length>=2 && Number.isInteger(p.age) && p.age>=1 && p.age<=100 && ['Male','Female','Other'].includes(p.gender)).length===1);
  const validContact=d.contact && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.contact.email || '') && /^[6-9][0-9]{9}$/.test(d.contact.phone || '');
  if (stage==='payment' && (!validPassengers || !validContact)) { go('passengers',true); toast('Add valid details for every selected seat and your booking contact first.'); return false; }
  return true;
}
async function render() {
  const renderId = ++state.renderId;
  const parts = location.hash.slice(1).split('/'), route = parts[0] || 'search';
  if(state.purchasing && route!=='payment'){history.replaceState(null,'','#payment');toast('Your purchase is being saved. Please wait a moment.');return;}
  const content = $('#app-content');
  const titles = {search:'Find your next journey',results:'Choose your bus',seats:'Choose your seat',passengers:'Traveller details',payment:'Review & pay',confirmed:'Your ticket is ready',booking:'Booking details',edit:'Edit your booking',bookings:'My bookings',saved:'Saved routes',reviews:'Traveller reviews',support:'Help & support',account:'Your account',login:'Welcome to SwiftBus',register:'Join SwiftBus'};
  if (!Object.hasOwn(titles,route) || (['confirmed','booking','edit'].includes(route) && !parts[1])) { go('search',true); return; }
  if(route==='reviews'){if(parts[1] && !busCatalog.some(b=>b.id===parts[1])){go('reviews',true);return;}state.reviewBus=parts[1] || 'all';if(state.reviewBus!=='all')state.reviewFormBus=state.reviewBus;}
  $('#page-title').textContent = titles[route];
  $('#page-kicker').textContent = ['results','seats','passengers','payment','confirmed'].includes(route)?'YOUR NEXT JOURNEY':'TRAVEL MADE SIMPLE';
  document.title = titles[route]+' — SwiftBus';
  $$('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===(['results','seats','passengers','payment','confirmed'].includes(route)?'search':['booking','edit'].includes(route)?'bookings':route)));
  $('#sidebar').classList.remove('open'); $('#menu-button').setAttribute('aria-expanded','false');
  const protectedRoutes = ['bookings','saved','account','booking','confirmed','payment','edit'];
  if (protectedRoutes.includes(route) || route==='reviews') {
    try { const result=await api('/api/session');if(renderId!==state.renderId)return;protectDraftIdentity(result.user);state.user=result.user;updateIdentity(); }
    catch(err){if(renderId!==state.renderId)return;content.innerHTML=empty('We couldn’t check your account.',err.message,'<button class="button primary" data-action="retry">Try again</button>','!');return;}
    if(protectedRoutes.includes(route) && !state.user){requireLogin(location.hash.slice(1),route==='payment'?'Your booking is saved. Sign in or create an account to finish your purchase.':'Sign in to view and manage your journeys.');return;}
  }
  if (['login','register'].includes(route) && state.user) { go(state.returnTo || 'account',true); return; }
  if (['seats','passengers','payment'].includes(route) && !guardDraft(route)) return;
  content.innerHTML = loading();
  try {
    let html;
    if (route==='search') html = searchPage();
    else if (route==='results') { const result = await api('/api/search?'+new URLSearchParams(state.search)); if(renderId!==state.renderId)return; state.trips = result.trips; html = resultsPage(); }
    else if (route==='seats') {
      const d = state.draft, result = await api('/api/trip?'+new URLSearchParams({...d.search,busId:d.trip.id})); if(renderId!==state.renderId)return;
      d.trip = result.trip;
      const prior = d.seats.length; d.seats = d.seats.filter(s=>!d.trip.bookedSeats.includes(s));
      if (prior!==d.seats.length) toast('Some selected seats are no longer available. Please choose replacements.');
      if (!d.trip.boardingPoints.some(p=>p.id===d.boardingId)) d.boardingId=d.trip.boardingPoints[0]?.id || '';
      if (!d.trip.droppingPoints.some(p=>p.id===d.droppingId)) d.droppingId=d.trip.droppingPoints[0]?.id || '';
      persist(); html = seatsPage();
    }
    else if (route==='passengers') html = passengersPage();
    else if (route==='payment') html = paymentPage();
    else if (route==='bookings') { const result=await api('/api/bookings'); if(renderId!==state.renderId)return; html=bookingsPage(result.bookings); }
    else if (route==='confirmed' || route==='booking') { const result=await api('/api/bookings/'+encodeURIComponent(decodeURIComponent(parts[1]))); if(renderId!==state.renderId)return; state.booking=result.booking; html=ticketPage(result.booking,route==='confirmed'); }
    else if (route==='edit') {const result=await api('/api/bookings/'+encodeURIComponent(decodeURIComponent(parts[1])));if(renderId!==state.renderId)return;const b=result.booking;const tripResult=await api('/api/trip?'+new URLSearchParams({from:b.from,to:b.to,date:b.date,busId:b.busId}));if(renderId!==state.renderId)return;state.editBooking=b;state.booking=b;state.editTrip=tripResult.trip;html=bookingEditPage(b,tripResult.trip);}
    else if (route==='saved') { const result=await api('/api/saved-routes'); if(renderId!==state.renderId)return; state.routes=result.routes; html=savedPage(); }
    else if (route==='reviews') {const result=await api('/api/reviews');if(renderId!==state.renderId)return;state.reviews=result.reviews;if(state.reviewEditing && !state.reviews.some(r=>r.id===state.reviewEditing && r.mine))state.reviewEditing=null;html=reviewsPage();}
    else if (route==='support') { if(state.user){ const result=await api('/api/support'); if(renderId!==state.renderId)return; state.requests=result.requests; } html=supportPage(); }
    else if (route==='account') html=accountPage();
    else html=authPage(route==='register');
    if(renderId!==state.renderId)return;
    content.innerHTML=html; content.focus({preventScroll:true}); window.scrollTo({top:0,behavior:'instant'});
  } catch(err) {
    if(renderId!==state.renderId)return;
    if(err.status===401){requireLogin(location.hash.slice(1),'Your session has ended. Sign in to continue; your booking draft is saved.');return;}
    content.innerHTML=`<div class="error-state">${empty('We couldn’t load that page.',err.message,'<button class="button primary" data-action="retry">Try again</button> <a class="button secondary" href="#search">Back to search</a>','!')}</div>`;
  }
}
function setBusy(form, busy) { $$('button[type="submit"]',form).forEach(b=>{b.disabled=busy; if(busy){b.dataset.label=b.textContent;b.textContent='Please wait…';}else if(b.dataset.label){b.textContent=b.dataset.label;delete b.dataset.label;}}); }
function keepPassengerDraft(form) {
  if(!state.draft || state.purchasing)return; const data=new FormData(form),d=state.draft,prior=JSON.stringify([d.passengers,d.contact]);d.passengers=d.seats.map((seat,i)=>({seat,name:String(data.get('name-'+i)||'').trim(),age:Number(data.get('age-'+i))||'',gender:String(data.get('gender-'+i)||'')}));d.contact={email:String(data.get('email')||'').trim(),phone:String(data.get('phone')||'').trim()};if(prior!==JSON.stringify([d.passengers,d.contact]))d.idempotencyKey='';if(state.user)d.ownerId=state.user.id;persist();
}
async function submitForm(form) {
  if(state.purchasing)return;
  const type=form.dataset.form, data=new FormData(form);
  const submittedBooking=type==='edit-booking'?state.editBooking:null;
  const submittedReview=type==='review' && state.reviewEditing?state.reviews.find(r=>r.id===state.reviewEditing && r.mine):null;
  errorBox(form,'');
  if(type==='search') {
    const search={from:String(data.get('from')),to:String(data.get('to')),date:String(data.get('date')),passengers:Number(data.get('passengers'))};
    if(search.from===search.to){errorBox(form,'Choose different departure and destination cities.');return;}
    if(search.date<dateValue() || search.date>dateValue(180)){errorBox(form,'Choose a travel date from today through the next 180 days.');return;}
    state.search=search; state.draft=null; state.filters={}; persist(); go('results'); return;
  }
  if(type==='seats') {
    if(state.draft.seats.length!==state.draft.search.passengers){errorBox(form,'Select exactly '+state.draft.search.passengers+' seat(s) to continue.');return;}
    const d=state.draft,boarding=String(data.get('boardingId')),dropping=String(data.get('droppingId'));if(d.boardingId!==boarding || d.droppingId!==dropping)d.idempotencyKey='';d.boardingId=boarding;d.droppingId=dropping;persist();go('passengers');return;
  }
  if(type==='passengers') {
    keepPassengerDraft(form); const invalid=state.draft.passengers.find(p=>p.name.length<2 || !Number.isInteger(p.age) || p.age<1 || p.age>100 || !['Male','Female','Other'].includes(p.gender));
    if(invalid){errorBox(form,'Provide a full name, whole-number age from 1 to 100, and gender for each traveller.');return;}
    go('payment');return;
  }
  if(type==='coupon') {
    const d=state.draft, box=$('#coupon-status');
    if(d.coupon){d.coupon='';d.idempotencyKey='';persist();$('#app-content').innerHTML=paymentPage();return;}
    const value=String(data.get('coupon')||'').trim().toUpperCase();
    if(value!=='SWIFT10'){box.textContent=value?'This promo code is not valid. Try SWIFT10.':'Enter a promo code first.';box.classList.add('error');return;}
    d.coupon='SWIFT10';d.idempotencyKey='';persist();$('#app-content').innerHTML=paymentPage();toast('SWIFT10 applied: 10% off your base fare.');return;
  }
  if(state.busy)return;
  if(type==='payment' && !guardDraft('payment'))return;
  state.busy=true;setBusy(form,true);
  if(type==='payment'){state.purchasing=true;state.purchaseControls=$$('input,select,button', $('#app-content')).map(control=>({control,disabled:control.disabled}));state.purchaseControls.forEach(({control})=>control.disabled=true);}
  try {
    if(['profile','password','support','payment','review','edit-booking'].includes(type))await verifyCurrentAccount();
    if(type==='login' || type==='register') {
      const payload={email:String(data.get('email')).trim(),password:String(data.get('password'))};
      if(type==='register'){payload.name=String(data.get('name')).trim();payload.phone=String(data.get('phone')||'').trim();}
      const result=await api('/api/auth/'+type,{method:'POST',body:payload});protectDraftIdentity(result.user);state.user=result.user;updateIdentity();
      const destination=state.returnTo || 'search';state.returnTo='';state.authNotice='';sessionStorage.removeItem('swiftbus-return-to');toast(type==='register'?'Your SwiftBus account is ready.':'Welcome back, '+state.user.name.split(' ')[0]+'.');go(destination);
    } else if(type==='profile') {
      const result=await api('/api/account',{method:'PATCH',body:{name:String(data.get('name')).trim(),email:String(data.get('email')).trim(),phone:String(data.get('phone')||'').trim()}});state.user=result.user;updateIdentity();toast('Your profile has been updated.');render();
    } else if(type==='password') {
      if(data.get('newPassword')!==data.get('confirmPassword')){errorBox(form,'The new passwords do not match.');return;}
      await api('/api/account/password',{method:'POST',body:{currentPassword:String(data.get('currentPassword')),newPassword:String(data.get('newPassword'))}});form.reset();toast('Your password has been updated.');
    } else if(type==='support') {
      await api('/api/support',{method:'POST',body:{subject:String(data.get('subject')).trim(),message:String(data.get('message')).trim()}});toast('Your local support request has been saved.');render();
    } else if(type==='edit-booking') {
      const b=submittedBooking;if(!b)throw new Error('Open the booking again before making changes.');
      const passengers=b.seats.map((seat,i)=>({seat,name:String(data.get('name-'+i)||'').trim(),age:Number(data.get('age-'+i)),gender:String(data.get('gender-'+i)||'')}));
      const payload={passengers,contact:{email:String(data.get('email')||'').trim(),phone:String(data.get('phone')||'').trim()},boardingId:String(data.get('boardingId')),droppingId:String(data.get('droppingId'))};
      const result=await api('/api/bookings/'+encodeURIComponent(b.id),{method:'PATCH',body:payload});state.booking=result.booking;state.editBooking=null;toast('Booking updated. Your ticket now shows the new details.');go('booking/'+encodeURIComponent(result.booking.id));
    } else if(type==='review') {
      const edited=submittedReview;
      const payload={rating:Number(data.get('rating')),title:String(data.get('title')||'').trim(),comment:String(data.get('comment')||'').trim()};
      if(!edited)payload.busId=String(data.get('busId'));
      const result=await api(edited?'/api/reviews/'+encodeURIComponent(edited.id):'/api/reviews',{method:edited?'PATCH':'POST',body:payload});state.reviewFormBus=result.review.busId;state.reviewEditing=result.review.id;toast(edited?'Your review has been updated.':'Your review has been posted.');go('reviews/'+result.review.busId);
    } else if(type==='payment') {
      const d=state.draft,paymentMethod=String(data.get('paymentMethod'));if(d.paymentMethod!==paymentMethod)d.idempotencyKey='';d.paymentMethod=paymentMethod;d.ownerId=state.user.id;if(!d.idempotencyKey)d.idempotencyKey=crypto.randomUUID();persist();
      const payload={...d.search,busId:d.trip.id,seats:d.seats,boardingId:d.boardingId,droppingId:d.droppingId,passengers:d.passengers,contact:d.contact,paymentMethod:d.paymentMethod,coupon:d.coupon || '',idempotencyKey:d.idempotencyKey};
      const result=await api('/api/bookings',{method:'POST',body:payload});state.purchasing=false;state.booking=result.booking;state.draft=null;persist();toast('Payment simulated. Your ticket is ready.');go('confirmed/'+encodeURIComponent(result.booking.id));
    }
  } catch(err) {
    state.purchasing=false;
    if(err.code==='ACCOUNT_CHANGED'){toast(err.message);render();}
    else if(err.status===401 && type!=='login' && type!=='register'){requireLogin(location.hash.slice(1),'Sign in again to continue. Your booking draft is saved.');}
    else if(err.status===409 && type==='payment'){state.draft.idempotencyKey='';persist();toast(err.message);if(err.code==='TRIP_DEPARTED'){state.search={...state.draft.search};persist();go('results');}else go('seats');}
    else errorBox(form,err.message);
  } finally { state.purchasing=false;if(state.purchaseControls){state.purchaseControls.forEach(({control,disabled})=>control.disabled=disabled);state.purchaseControls=null;}state.busy=false;setBusy(form,false); }
}
$('#app-content').addEventListener('submit',event=>{ const form=event.target.closest('form[data-form]');if(!form)return;event.preventDefault();submitForm(form); });
$('#app-content').addEventListener('input',event=>{
  const form=event.target.closest('form[data-form]');if(form?.dataset.form==='passengers')keepPassengerDraft(form);
  if(form?.dataset.form==='search'){const data=new FormData(form);state.search={from:String(data.get('from')),to:String(data.get('to')),date:String(data.get('date')),passengers:Number(data.get('passengers'))};persist();}
});
$('#app-content').addEventListener('change',event=>{
  if(state.purchasing)return;
  const target=event.target;
  if(target.dataset.filter){state.filters[target.dataset.filter]=target.checked;$('#bus-results').innerHTML=busCards();$('#result-count').textContent=filteredTrips().length+' buses found';}
  if(target.id==='sort-trips'){state.sort=target.value;$('#bus-results').innerHTML=busCards();}
  if(target.id==='review-filter'){state.reviewEditing=null;state.reviewFormBus=target.value==='all'?'rajdhani':target.value;go(target.value==='all'?'reviews':'reviews/'+target.value);}
  if(target.id==='review-bus-select'){state.reviewFormBus=target.value;state.reviewEditing=null;$('#app-content').innerHTML=reviewsPage();}
  if(target.name==='paymentMethod'){if(state.draft.paymentMethod!==target.value)state.draft.idempotencyKey='';state.draft.paymentMethod=target.value;persist();$$('.payment-choice').forEach(label=>label.classList.toggle('selected',$('input',label).checked));}
  if(['boardingId','droppingId'].includes(target.name) && state.draft && target.closest('form')?.dataset.form==='seats'){if(state.draft[target.name]!==target.value)state.draft.idempotencyKey='';state.draft[target.name]=target.value;persist();}
});
$('#app-content').addEventListener('click',async event=>{
  const button=event.target.closest('[data-action]');if(!button || button.disabled)return;
  if(state.purchasing){toast('Your purchase is being saved. Please wait a moment.');return;}
  const action=button.dataset.action;
  if(action==='swap'){const form=button.closest('form');const from=$('[name="from"]',form),to=$('[name="to"]',form);const prior=from.value;from.value=to.value;to.value=prior;state.search.from=from.value;state.search.to=to.value;persist();return;}
  if(action==='popular'){state.search={...state.search,from:button.dataset.from,to:button.dataset.to};state.draft=null;state.filters={};persist();go('results');return;}
  if(action==='clear-filters'){state.filters={};$('#app-content').innerHTML=resultsPage();return;}
  if(action==='choose-bus'){const trip=state.trips.find(t=>t.id===button.dataset.id);if(!trip || trip.departed || trip.availableSeats<state.search.passengers)return;state.draft={search:{...state.search},trip,seats:[],boardingId:trip.boardingPoints[0]?.id || '',droppingId:trip.droppingPoints[0]?.id || '',passengers:[],contact:{},coupon:'',paymentMethod:'upi',idempotencyKey:'',ownerId:state.user?.id || null};persist();go('seats');return;}
  if(action==='seat'){
    const d=state.draft, seat=button.dataset.seat;if(d.trip.bookedSeats.includes(seat))return;
    if(d.seats.includes(seat))d.seats=d.seats.filter(s=>s!==seat);else{if(d.seats.length>=d.search.passengers){toast('You selected all '+d.search.passengers+' seat(s). Deselect one to choose another.');return;}d.seats.push(seat);d.seats.sort();}
    d.idempotencyKey='';persist();button.classList.toggle('selected',d.seats.includes(seat));button.setAttribute('aria-pressed',String(d.seats.includes(seat)));$('#selection-note').textContent=d.seats.length+' of '+d.search.passengers+' seats selected'+(d.seats.length?' · '+d.seats.join(', '):'');$('#continue-seats').disabled=d.seats.length!==d.search.passengers;$('#journey-summary').innerHTML=summary();return;
  }
  if(action==='show-password'){const input=$('#'+button.dataset.target);input.type=input.type==='password'?'text':'password';button.textContent=input.type==='text'?'Hide':'Show';button.setAttribute('aria-pressed',String(input.type==='text'));return;}
  if(action==='retry'){render();return;}
  if(action==='review-bus'){state.reviewEditing=null;state.reviewFormBus=button.dataset.id;go('reviews/'+button.dataset.id);return;}
  if(action==='reviews-login'){requireLogin(state.reviewBus==='all'?'reviews':'reviews/'+state.reviewBus,'Sign in to write and manage your own bus reviews.');return;}
  if(action==='edit-review'){const review=state.reviews.find(r=>r.id===button.dataset.id && r.mine);if(review){state.reviewEditing=review.id;state.reviewFormBus=review.busId;$('#app-content').innerHTML=reviewsPage();$('.review-editor').scrollIntoView({block:'nearest',behavior:'smooth'});}return;}
  if(action==='cancel-review-edit' || action==='new-review'){state.reviewEditing=null;const next=busCatalog.find(b=>!state.reviews.some(r=>r.mine && r.busId===b.id));if(next)state.reviewFormBus=next.id;$('#app-content').innerHTML=reviewsPage();if(action==='cancel-review-edit')toast('Unsaved review changes discarded.');return;}
  if(action==='delete-review'){const review=state.reviews.find(r=>r.id===button.dataset.id && r.mine);if(!review)return;$('#review-delete-description').textContent='“'+review.title+'” — '+review.busName;$('#review-delete-confirm').dataset.id=review.id;errorBox($('#review-dialog'),'');$('#review-dialog').showModal();return;}
  if(action==='change-journey'){const b=state.booking;if(b){state.search={from:b.from,to:b.to,date:b.date<dateValue()?dateValue(2):b.date,passengers:b.seats.length};state.draft=null;persist();go('search');toast(b.status==='confirmed'?'Choose a new journey. Your existing booking stays active until you cancel it.':'Choose a new journey and your preferred seats.');}return;}
  if(action==='support-login'){requireLogin('support','Sign in to save your local support requests.');return;}
  if(action==='cancel'){const b=state.booking;if(!b || b.id!==button.dataset.id)return;$('#cancel-description').textContent=`Booking ${b.pnr}: ${b.from} → ${b.to}. Your simulated refund will be ${money(b.pricing.total)}.`;$('#cancel-confirm').dataset.id=b.id;errorBox($('#cancel-dialog'),'');$('#cancel-dialog').showModal();return;}
  if(action==='saved-search'){const route=state.routes.find(r=>r.id===button.dataset.id);if(route){state.search={...state.search,from:route.from,to:route.to};persist();go('search');toast('Route selected. Choose your date and search buses.');}return;}
  if(action==='save-route' && !state.user){requireLogin('results','Sign in to save this route. Your search is saved.');return;}
  if(state.busy)return;state.busy=true;button.disabled=true;
  try{
    if(['save-route','remove-route','logout'].includes(action))await verifyCurrentAccount();
    if(action==='save-route'){await api('/api/saved-routes',{method:'POST',body:{from:state.search.from,to:state.search.to}});toast('Route saved. Find it in Saved routes.');}
    if(action==='remove-route'){await api('/api/saved-routes/'+encodeURIComponent(button.dataset.id),{method:'DELETE'});toast('Saved route removed.');render();}
    if(action==='logout'){await api('/api/auth/logout',{method:'POST',body:{}});state.user=null;state.draft=null;state.booking=null;state.routes=[];state.requests=[];state.reviews=[];state.reviewEditing=null;state.editBooking=null;state.returnTo='';state.authNotice='';persist();sessionStorage.removeItem('swiftbus-return-to');updateIdentity();toast('You have signed out.');go('search');}
  }catch(err){if(err.code==='ACCOUNT_CHANGED'){toast(err.message);render();}else if(err.status===401)requireLogin(location.hash.slice(1),'Your session has ended. Please sign in again.');else toast(err.message);}finally{state.busy=false;button.disabled=false;}
});
$('#menu-button').addEventListener('click',()=>{const open=$('#sidebar').classList.toggle('open');$('#menu-button').setAttribute('aria-expanded',String(open));});
$('#cancel-close').addEventListener('click',()=>$('#cancel-dialog').close());
$('#cancel-confirm').addEventListener('click',async()=>{if(state.busy)return;const button=$('#cancel-confirm');state.busy=true;button.disabled=true;try{const result=await api('/api/bookings/'+encodeURIComponent(button.dataset.id)+'/cancel',{method:'POST',body:{}});state.booking=result.booking;$('#cancel-dialog').close();toast('Booking cancelled. Simulated refund '+money(result.booking.refund)+' recorded.');render();}catch(err){if(err.status===401){$('#cancel-dialog').close();requireLogin(location.hash.slice(1));}else errorBox($('#cancel-dialog'),err.message);}finally{state.busy=false;button.disabled=false;}});
$('#review-delete-close').addEventListener('click',()=>$('#review-dialog').close());
$('#review-delete-confirm').addEventListener('click',async()=>{if(state.busy)return;const button=$('#review-delete-confirm'),reviewId=button.dataset.id;state.busy=true;button.disabled=true;try{await verifyCurrentAccount();await api('/api/reviews/'+encodeURIComponent(reviewId),{method:'DELETE',body:{}});state.reviewEditing=null;$('#review-dialog').close();toast('Your review has been deleted.');render();}catch(err){if(err.code==='ACCOUNT_CHANGED'){$('#review-dialog').close();toast(err.message);render();}else if(err.status===401){$('#review-dialog').close();requireLogin(location.hash.slice(1));}else errorBox($('#review-dialog'),err.message);}finally{state.busy=false;button.disabled=false;}});
window.addEventListener('hashchange',render);
window.addEventListener('pageshow',event=>{if(event.persisted)api('/api/session').then(result=>{state.user=result.user;updateIdentity();render();}).catch(err=>toast(err.message));});
(async()=>{try{const result=await api('/api/session');protectDraftIdentity(result.user);state.user=result.user;updateIdentity();render();}catch(err){$('#app-content').innerHTML=empty('SwiftBus is taking a moment.',err.message,'<button class="button primary" data-action="retry">Try again</button>','!');}})();
