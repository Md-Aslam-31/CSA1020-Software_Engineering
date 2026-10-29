const form = document.querySelector('#trip-form');
const button = document.querySelector('#plan-button');
const error = document.querySelector('#form-error');
const panel = document.querySelector('#results-panel');
const climateNames = { warm: 'warm weather', cool: 'cool weather', rainy: 'rainy weather' };
const activityNames = { city: 'city exploring', trail: 'trail wandering', beach: 'time by the sea' };

function showList(data) {
  document.querySelector('#empty-state').hidden = true;
  document.querySelector('#packing-result').hidden = false;
  const { trip } = data;
  document.querySelector('#trip-summary').textContent = `${trip.days} ${trip.days === 1 ? 'day' : 'days'} · ${trip.travelers} ${trip.travelers === 1 ? 'traveler' : 'travelers'}\n${climateNames[trip.climate]}, ${activityNames[trip.activity]}.`;
  document.querySelector('#total-items').textContent = data.total_items;
  const categories = document.querySelector('#categories');
  categories.replaceChildren();
  for (const category of data.categories) {
    const section = document.createElement('section');
    section.className = 'category';
    const title = document.createElement('h3');
    title.textContent = category.name;
    const list = document.createElement('ul');
    for (const item of category.items) {
      const row = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = item.name;
      const quantity = document.createElement('span');
      quantity.className = 'quantity';
      quantity.textContent = `×${item.quantity}`;
      row.append(label, quantity);
      list.append(row);
    }
    section.append(title, list);
    categories.append(section);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  error.hidden = true;
  button.disabled = true;
  button.textContent = 'Making a little room…';
  panel.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('/api/packing-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        days: Number(form.elements.days.value), travelers: Number(form.elements.travelers.value),
        climate: form.elements.climate.value, activity: form.elements.activity.value,
        laundry: form.elements.laundry.checked,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Please check your trip details.');
    showList(data);
  } catch (problem) {
    error.textContent = problem instanceof TypeError ? 'We could not reach Packlight. Please try again in a moment.' : problem.message;
    error.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = 'Find my essentials ↗';
    panel.setAttribute('aria-busy', 'false');
  }
});
