import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { safeImageSrc } from '../src/utils.js';

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const carousel = readFileSync(new URL('../src/components/sponsor-carousel.js', import.meta.url), 'utf8');

test('sponsor ads are shown whole in a fixed frame (never cropped)', () => {
  assert.match(css, /\.sponsor-img \{[^}]*object-fit: contain;/);
  assert.doesNotMatch(css.match(/\.sponsor-img \{[^}]*\}/)[0], /max-height/);
  assert.match(carousel, /class="sponsor-frame"/);
  assert.match(carousel, /class="sponsor-backdrop"/);
});

test('uploaded images (data URLs) are allowed as image sources, scripts are not', () => {
  assert.equal(safeImageSrc('data:image/jpeg;base64,AAAA'), 'data:image/jpeg;base64,AAAA');
  assert.equal(safeImageSrc('https://res.cloudinary.com/x.jpg'), 'https://res.cloudinary.com/x.jpg');
  assert.equal(safeImageSrc('javascript:alert(1)'), '');
  assert.equal(safeImageSrc('data:text/html;base64,AAAA'), '');
  assert.equal(safeImageSrc('https://x.com/a.jpg" onerror="alert(1)'), '');
});
