import { POLICY } from './policy.mjs';
import { validateItems } from './validation.mjs';

export const ITEMS = Object.freeze([
  { id: 'pocket-camera', name: 'Pocket cinema camera', category: 'Camera', total: 3, description: 'Capture sharp 4K stories with a compact camera, lens and battery kit.', color: '#c7dcff', icon: 'camera' },
  { id: 'wireless-mic', name: 'Wireless microphone set', category: 'Audio', total: 4, description: 'Two clip-on transmitters and one receiver for clear interviews.', color: '#ffe1bf', icon: 'mic' },
  { id: 'led-panel', name: 'Portable LED panel', category: 'Lighting', total: 4, description: 'Adjustable soft light with a battery and diffuser for small sets.', color: '#fff0a6', icon: 'light' },
  { id: 'field-tripod', name: 'Field tripod', category: 'Accessories', total: 5, description: 'A stable, lightweight support with an adjustable quick-release head.', color: '#d3eee0', icon: 'tripod' },
  { id: 'audio-recorder', name: 'Handheld audio recorder', category: 'Audio', total: 2, description: 'Record portable stereo sound, field notes and podcast conversations.', color: '#e2d9ff', icon: 'recorder' },
  { id: 'backdrop-kit', name: 'Backdrop stand kit', category: 'Lighting', total: 2, description: 'A folding background support for portraits and studio interviews.', color: '#ffd8da', icon: 'backdrop' },
].map(item => Object.freeze(item)));

function searchText(value) {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en');
}

export function searchCatalog(items, { query = '', category = 'all' } = {}) {
  validateItems(items);
  if (typeof query !== 'string' || typeof category !== 'string') {
    throw new Error('Search words and category must be text.');
  }
  const needle = searchText(query);
  const selectedCategory = searchText(category);
  return items.filter(item => {
    const categoryMatches = !selectedCategory || selectedCategory === 'all'
      || searchText(item.category) === selectedCategory;
    const fields = POLICY.searchDescription
      ? [item.name, item.category, item.description]
      : [item.name, item.category];
    return categoryMatches && (!needle || fields.some(value => searchText(value).includes(needle)));
  });
}
