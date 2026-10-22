export const MAX_CAPACITY = 100;

function validateCapacity(capacity) {
  if (!Number.isInteger(capacity) || capacity < 0 || capacity > MAX_CAPACITY) {
    throw new RangeError(`Capacity must be a whole number from 0 to ${MAX_CAPACITY}.`);
  }
  return capacity;
}

function validateAttendees(attendees) {
  if (!Array.isArray(attendees)) throw new TypeError('Attendees must be an array.');
  const ids = new Set();
  for (const person of attendees) {
    if (!person || typeof person !== 'object' || Array.isArray(person) ||
      typeof person.id !== 'string' || !person.id.trim() ||
      typeof person.name !== 'string' || !person.name.trim() ||
      !['standard', 'vip'].includes(person.priority)) {
      throw new TypeError('Each attendee needs an ID, name, and valid priority.');
    }
    if (ids.has(person.id)) throw new TypeError('Attendee IDs must be unique.');
    ids.add(person.id);
  }
}

export function allocateSeats(attendees, capacity) {
  const limit = validateCapacity(capacity);
  validateAttendees(attendees);
  const ordered = [...attendees].sort(
    (a, b) => Number(b.priority === 'vip') - Number(a.priority === 'vip')
  );
  const confirmed = ordered.slice(0, limit);
  return {
    capacity: limit,
    confirmed,
    waitlist: ordered.slice(limit),
    seatsRemaining: limit - confirmed.length,
    totalRequests: attendees.length
  };
}
