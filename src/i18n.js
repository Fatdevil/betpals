// ── i18n: Internationalization ────────────────────────
import { sv } from './lang/sv.js';
import { en } from './lang/en.js';

const languages = { sv, en };
let currentLang = localStorage.getItem('betpals_lang') || detectLanguage();

function detectLanguage() {
  const browserLang = navigator.language?.slice(0, 2) || 'en';
  return languages[browserLang] ? browserLang : 'en';
}

export function t(key) {
  const keys = key.split('.');
  let val = languages[currentLang];
  for (const k of keys) {
    val = val?.[k];
  }
  if (val === undefined) {
    // Fallback to English
    val = languages.en;
    for (const k of keys) {
      val = val?.[k];
    }
  }
  return val ?? key;
}

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  if (languages[lang]) {
    currentLang = lang;
    localStorage.setItem('betpals_lang', lang);
    // Trigger re-render
    window.dispatchEvent(new CustomEvent('lang-changed'));
  }
}

export function getAvailableLanguages() {
  return [
    { code: 'sv', label: '🇸🇪 Svenska' },
    { code: 'en', label: '🇬🇧 English' }
  ];
}

// Format points (no currency)
export function formatPoints(amount) {
  if (amount === null || amount === undefined) return '0';
  return Math.round(amount).toLocaleString() + ' ' + t('common.pts');
}
