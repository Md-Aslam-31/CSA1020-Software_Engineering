import { allocateSeats } from './src/seat-planner.js';

const sampleAttendees = [
  { id: 'sample-amira', name: 'Amira Santos', priority: 'standard' },
  { id: 'sample-theo', name: 'Theo Park', priority: 'standard' },
  { id: 'sample-nia', name: 'Nia Reed', priority: 'vip' },
  { id: 'sample-luca', name: 'Luca Moretti', priority: 'standard' },
  { id: 'sample-maya', name: 'Maya Chen', priority: 'vip' },
  { id: 'sample-owen', name: 'Owen Clarke', priority: 'standard' },
];

let attendees = sampleAttendees.map(attendee => ({ ...attendee }));
let nextId = 1;
let lastValidCapacity = 3;

const byId = id => document.getElementById(id);
const attendeeForm = byId('attendee-form');
const nameInput = byId('attendee-name');
const priorityInput = byId('attendee-priority');
const capacityInput = byId('seat-capacity');
const attendeeError = byId('attendee-error');
const capacityError = byId('capacity-error');
const notice = byId('plan-notification');

function showError(element, input, message = '') {
  element.textContent = message;
  element.hidden = !message;
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  if (message) input.setAttribute('aria-errormessage', element.id);
  else input.removeAttribute('aria-errormessage');
}

function getCapacity() {
  const value = capacityInput.value.trim();
  const capacity = Number(value);
  if (!value || !Number.isInteger(capacity) || capacity < 0 || capacity > 100) {
    showError(capacityError, capacityInput, 'Enter a whole number of seats between 0 and 100. Your last valid capacity is kept.');
    return null;
  }
  showError(capacityError, capacityInput);
  return capacity;
}

function textElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function initials(name) {
  return name.split(/\s+/u).slice(0, 2).map(part => [...part][0] ?? '').join('').toUpperCase();
}

function renderRoster() {
  const list = byId('attendee-list');
  list.replaceChildren();
  byId('roster-count').textContent = `${attendees.length} ${attendees.length === 1 ? 'request' : 'requests'}`;
  if (!attendees.length) {
    list.append(textElement('li', 'empty-roster', 'A fresh room. Add your first attendee above.'));
    return;
  }
  attendees.forEach((attendee, index) => {
    const row = document.createElement('li');
    row.className = 'attendee-row';
    const number = textElement('span', 'arrival-number', String(index + 1).padStart(2, '0'));
    number.setAttribute('aria-hidden', 'true');
    const avatar = textElement('span', 'avatar', initials(attendee.name));
    avatar.setAttribute('aria-hidden', 'true');
    const name = textElement('span', 'attendee-name', attendee.name);
    const priority = textElement('span', `priority-pill${attendee.priority === 'vip' ? ' vip' : ''}`, attendee.priority === 'vip' ? 'VIP' : 'STANDARD');
    const remove = textElement('button', 'remove-button', '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${attendee.name}, request ${index + 1}`);
    remove.title = `Remove ${attendee.name}`;
    remove.addEventListener('click', () => {
      attendees = attendees.filter(person => person.id !== attendee.id);
      renderRoster();
      updatePlan(`${attendee.name} removed. Seat plan updated.`, true);
      const nextRemove = list.querySelectorAll('.remove-button')[Math.min(index, attendees.length - 1)];
      (nextRemove || nameInput).focus();
    });
    row.append(number, avatar, name, priority, remove);
    list.append(row);
  });
}

function renderAllocation(listId, people, waiting) {
  const list = byId(listId);
  list.replaceChildren();
  if (!people.length) {
    list.append(textElement('li', 'empty-list', waiting ? 'Everyone has a seat. No waiting list.' : 'No seats allocated yet. Add attendees or increase the capacity.'));
    return;
  }
  people.forEach((person, index) => {
    const item = document.createElement('li');
    item.className = 'allocation-card';
    const title = textElement('strong', '', person.name);
    const priority = person.priority === 'vip' ? 'VIP' : 'Standard';
    const detail = textElement('small', '', waiting ? `Queue ${String(index + 1).padStart(2, '0')} · ${priority}` : `Seat ${String(index + 1).padStart(2, '0')} · ${priority}`);
    item.append(title, detail);
    list.append(item);
  });
}

function updatePlan(message = 'Seat plan refreshed.', useLastValid = false) {
  const requestedCapacity = getCapacity();
  if (requestedCapacity === null && !useLastValid) return false;
  const capacity = requestedCapacity ?? lastValidCapacity;
  try {
    const result = allocateSeats(attendees, capacity);
    lastValidCapacity = capacity;
    byId('total-requests').textContent = result.totalRequests;
    byId('confirmed-count').textContent = result.confirmed.length;
    byId('waitlist-count').textContent = result.waitlist.length;
    byId('seats-remaining').textContent = result.seatsRemaining;
    byId('confirmed-label').textContent = `${result.confirmed.length} ${result.confirmed.length === 1 ? 'seat' : 'seats'}`;
    byId('waitlist-label').textContent = `${result.waitlist.length} ${result.waitlist.length === 1 ? 'attendee' : 'attendees'}`;
    renderAllocation('confirmed-list', result.confirmed, false);
    renderAllocation('waitlist-list', result.waitlist, true);
    notice.textContent = requestedCapacity === null ? `${message} Using the last valid capacity of ${capacity} seats.` : message;
    return true;
  } catch (error) {
    notice.textContent = `The plan could not be updated: ${error.message}`;
    return false;
  }
}

attendeeForm.addEventListener('submit', event => {
  event.preventDefault();
  const name = nameInput.value.trim().replace(/\s+/gu, ' ');
  if (!name || name.length > 60) {
    showError(attendeeError, nameInput, 'Enter an attendee name between 1 and 60 characters.');
    nameInput.focus();
    return;
  }
  showError(attendeeError, nameInput);
  attendees = [...attendees, { id: `added-attendee-${nextId++}`, name, priority: priorityInput.value }];
  renderRoster();
  updatePlan(`${name} added. Seat plan updated.`, true);
  nameInput.value = '';
  nameInput.focus();
});

nameInput.addEventListener('input', () => {
  if (!attendeeError.hidden) showError(attendeeError, nameInput);
});

byId('capacity-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!updatePlan()) capacityInput.focus();
});

capacityInput.addEventListener('change', () => updatePlan('Capacity changed. Seat plan updated.'));

byId('reset-sample').addEventListener('click', () => {
  attendees = sampleAttendees.map(attendee => ({ ...attendee }));
  capacityInput.value = '3';
  nameInput.value = '';
  priorityInput.value = 'standard';
  showError(attendeeError, nameInput);
  renderRoster();
  updatePlan('Sample roster and 3-seat capacity restored.');
});

renderRoster();
updatePlan('Sample plan ready. Try changing the capacity.');
