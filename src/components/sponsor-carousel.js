// ── Component: Sponsor Carousel ─────────────────────────
import { escapeHtml, sanitizeUrl } from '../utils.js';

/**
 * Renders the HTML markup for the sponsor carousel.
 * @param {Array} banners - List of sponsor banner objects
 * @param {Object} options - Customization options
 * @returns {string} HTML string
 */
export function renderSponsorCarousel(banners = [], options = {}) {
  const {
    isCreator = false,
    carouselId = 'sponsor-carousel-main',
    showSectionHeader = true,
    title = '⭐ Sponsorer'
  } = options;

  if (!banners || banners.length === 0) {
    return '';
  }

  const hasMultiple = banners.length > 1;

  return `
    <div class="sponsor-carousel-container" id="${carouselId}">
      ${showSectionHeader ? `
        <div class="section-header" style="margin-bottom: var(--space-xs);">
          <h2 class="section-title">${title}</h2>
        </div>
      ` : ''}
      <div class="sponsor-carousel-wrapper">
        <div class="sponsor-carousel" id="${carouselId}-track" role="region" aria-label="Sponsorer">
          ${banners.map((b, index) => {
            const safeUrl = sanitizeUrl(b.linkUrl);
            return `
              <div class="sponsor-slide" data-index="${index}">
                ${safeUrl ? `<a href="${safeUrl}" target="_blank" rel="noopener" class="sponsor-link" title="${escapeHtml(b.label || 'Besök sponsor')}">` : ''}
                  <img src="${b.imageData}" alt="${escapeHtml(b.label || 'Sponsor')}" class="sponsor-img" loading="lazy" />
                ${safeUrl ? '</a>' : ''}
                ${b.label ? `<div class="sponsor-label">${escapeHtml(b.label)}</div>` : ''}
                ${isCreator ? `<button type="button" class="sponsor-delete-btn" data-banner-id="${b.id}" title="Ta bort sponsor">✕</button>` : ''}
              </div>
            `;
          }).join('')}
        </div>
        ${hasMultiple ? `
          <div class="sponsor-dots" id="${carouselId}-dots" aria-label="Sponsor navigation">
            ${banners.map((_, index) => `
              <button type="button" class="sponsor-dot ${index === 0 ? 'active' : ''}" data-index="${index}" aria-label="Sponsor ${index + 1} av ${banners.length}"></button>
            `).join('')}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Initializes auto-rolling behavior, manual swipe detection, dot navigation, and hover/touch pause.
 * @param {HTMLElement|string} target - Container element or selector
 * @param {Array} banners - List of banners
 * @param {number} intervalMs - Auto-scroll interval in milliseconds (default: 3500)
 * @returns {Function} cleanup function
 */
export function initSponsorCarousel(target, banners = [], intervalMs = 3500) {
  const container = typeof target === 'string' ? document.querySelector(target) : target;
  if (!container) return () => {};

  if (container._carouselCleanup) {
    try {
      container._carouselCleanup();
    } catch (_) {}
    container._carouselCleanup = null;
  }

  if (!banners || banners.length <= 1) {
    return () => {};
  }

  const track = container.querySelector('.sponsor-carousel');
  const dots = container.querySelectorAll('.sponsor-dot');
  if (!track) return () => {};

  let currentIndex = 0;
  let timer = null;
  let isPaused = false;
  let resumeTimer = null;
  let snapTimer = null;
  let scrollAnimFrame = null;

  const updateDots = (activeIdx) => {
    dots.forEach((dot, idx) => {
      const isActive = idx === activeIdx;
      dot.classList.toggle('active', isActive);
      if (isActive) {
        dot.setAttribute('aria-current', 'true');
      } else {
        dot.removeAttribute('aria-current');
      }
    });
  };

  const goToSlide = (index) => {
    if (index < 0 || index >= banners.length) return;
    currentIndex = index;
    const slides = track.querySelectorAll('.sponsor-slide');
    const slide = slides[currentIndex];
    if (slide) {
      const trackRect = track.getBoundingClientRect();
      const slideRect = slide.getBoundingClientRect();
      const targetScroll = Math.max(0, track.scrollLeft + (slideRect.left - trackRect.left));

      // Temporarily release scroll-snap so smooth scroll animation completes cleanly
      track.style.scrollSnapType = 'none';
      track.scrollTo({
        left: targetScroll,
        behavior: 'smooth'
      });

      if (snapTimer) clearTimeout(snapTimer);
      snapTimer = setTimeout(() => {
        if (track) track.style.scrollSnapType = 'x mandatory';
      }, 500);
    }
    updateDots(currentIndex);
  };

  const startAutoRoll = () => {
    stopAutoRoll();
    timer = setInterval(() => {
      if (isPaused) return;
      const nextIndex = (currentIndex + 1) % banners.length;
      goToSlide(nextIndex);
    }, intervalMs);
  };

  const stopAutoRoll = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const pauseTemporarily = (duration = 4500) => {
    isPaused = true;
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      isPaused = false;
    }, duration);
  };

  // Dot click handlers
  dots.forEach(dot => {
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(dot.dataset.index, 10);
      if (!isNaN(idx)) {
        goToSlide(idx);
        pauseTemporarily(6000);
      }
    });
  });

  // Hover handlers for mouse/desktop
  const onMouseEnter = () => { isPaused = true; };
  const onMouseLeave = () => { isPaused = false; };
  track.addEventListener('mouseenter', onMouseEnter);
  track.addEventListener('mouseleave', onMouseLeave);

  // Touch handlers for mobile
  const onTouchStart = () => {
    isPaused = true;
  };
  const onTouchEnd = () => {
    pauseTemporarily(4000);
  };
  track.addEventListener('touchstart', onTouchStart, { passive: true });
  track.addEventListener('touchend', onTouchEnd, { passive: true });

  // Sync active dot on manual scroll/swipe
  const onScroll = () => {
    if (scrollAnimFrame) cancelAnimationFrame(scrollAnimFrame);
    scrollAnimFrame = requestAnimationFrame(() => {
      const slides = track.querySelectorAll('.sponsor-slide');
      const trackRect = track.getBoundingClientRect();
      let closestIdx = 0;
      let minDiff = Infinity;
      slides.forEach((sl, idx) => {
        const slRect = sl.getBoundingClientRect();
        const diff = Math.abs(slRect.left - trackRect.left);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = idx;
        }
      });
      if (closestIdx !== currentIndex) {
        currentIndex = closestIdx;
        updateDots(currentIndex);
      }
    });
  };
  track.addEventListener('scroll', onScroll, { passive: true });

  // Start auto-roll
  startAutoRoll();

  const cleanup = () => {
    stopAutoRoll();
    if (resumeTimer) clearTimeout(resumeTimer);
    if (snapTimer) clearTimeout(snapTimer);
    if (scrollAnimFrame) cancelAnimationFrame(scrollAnimFrame);
    track.removeEventListener('mouseenter', onMouseEnter);
    track.removeEventListener('mouseleave', onMouseLeave);
    track.removeEventListener('touchstart', onTouchStart);
    track.removeEventListener('touchend', onTouchEnd);
    track.removeEventListener('scroll', onScroll);
    container._carouselCleanup = null;
  };

  container._carouselCleanup = cleanup;
  return cleanup;
}
