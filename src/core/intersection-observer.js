// ═══════════════════════════════════════════════════════════════════════════════
// INTERSECTION OBSERVER UTILITIES
// Lazy loading, scroll animations, and performance optimizations
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Lazy load images when they enter viewport
 */
export function setupLazyLoading() {
  if (!('IntersectionObserver' in window)) {
    // Fallback for browsers without IntersectionObserver
    document.querySelectorAll('img[data-src]').forEach(img => {
      img.src = img.dataset.src;
      img.removeAttribute('data-src');
    });
    return;
  }

  const imageObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          img.classList.add('loaded');
          observer.unobserve(img);
        }
      });
    },
    {
      rootMargin: '50px 0px',
      threshold: 0.01,
    }
  );

  document.querySelectorAll('img[data-src]').forEach(img => {
    imageObserver.observe(img);
  });
}

/**
 * Animate elements when they enter viewport
 */
export function setupScrollAnimations() {
  if (!('IntersectionObserver' in window)) {
    return;
  }

  const animationObserver = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    },
    {
      rootMargin: '0px 0px -100px 0px',
      threshold: 0.1,
    }
  );

  document.querySelectorAll('.fade-in-on-scroll').forEach(el => {
    animationObserver.observe(el);
  });
}

/**
 * Infinite scroll implementation
 */
export function setupInfiniteScroll(container, callback, options = {}) {
  if (!('IntersectionObserver' in window)) {
    return null;
  }

  const { rootMargin = '200px', threshold = 0 } = options;

  // Create sentinel element
  const sentinel = document.createElement('div');
  sentinel.className = 'infinite-scroll-sentinel';
  sentinel.style.height = '1px';
  container.appendChild(sentinel);

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          callback();
        }
      });
    },
    {
      root: null,
      rootMargin,
      threshold,
    }
  );

  observer.observe(sentinel);

  return {
    disconnect: () => {
      observer.disconnect();
      sentinel.remove();
    },
  };
}

/**
 * Track element visibility for analytics
 */
export function trackVisibility(elements, callback, options = {}) {
  if (!('IntersectionObserver' in window)) {
    return null;
  }

  const { threshold = 0.5, duration = 1000 } = options;

  const visibilityMap = new Map();

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        const element = entry.target;

        if (entry.isIntersecting) {
          // Start tracking visibility
          if (!visibilityMap.has(element)) {
            const startTime = Date.now();
            visibilityMap.set(element, startTime);

            // Check if element is visible for required duration
            setTimeout(() => {
              if (visibilityMap.has(element)) {
                const visibleTime = Date.now() - startTime;
                if (visibleTime >= duration) {
                  callback(element, visibleTime);
                  visibilityMap.delete(element);
                }
              }
            }, duration);
          }
        } else {
          // Element left viewport
          visibilityMap.delete(element);
        }
      });
    },
    {
      threshold,
    }
  );

  elements.forEach(el => observer.observe(el));

  return {
    disconnect: () => observer.disconnect(),
  };
}

/**
 * Pause/resume animations based on visibility
 */
export function setupAnimationPausing() {
  if (!('IntersectionObserver' in window)) {
    return;
  }

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        const element = entry.target;

        if (entry.isIntersecting) {
          element.style.animationPlayState = 'running';
        } else {
          element.style.animationPlayState = 'paused';
        }
      });
    },
    {
      threshold: 0,
    }
  );

  document.querySelectorAll('[data-pause-animation]').forEach(el => {
    observer.observe(el);
  });
}

/**
 * Virtual scrolling for large lists
 */
export class VirtualScroller {
  constructor(container, options = {}) {
    this.container = container;
    this.items = options.items || [];
    this.itemHeight = options.itemHeight || 50;
    this.renderItem = options.renderItem || (item => item.toString());
    this.buffer = options.buffer || 5;

    this.scrollTop = 0;
    this.visibleStart = 0;
    this.visibleEnd = 0;

    this.init();
  }

  init() {
    // Create wrapper and spacer
    this.wrapper = document.createElement('div');
    this.wrapper.style.position = 'relative';
    this.wrapper.style.height = `${this.items.length * this.itemHeight}px`;

    this.content = document.createElement('div');
    this.content.style.position = 'absolute';
    this.content.style.top = '0';
    this.content.style.left = '0';
    this.content.style.right = '0';

    this.wrapper.appendChild(this.content);
    this.container.appendChild(this.wrapper);

    // Setup scroll listener
    this.container.addEventListener('scroll', () => this.onScroll());

    // Initial render
    this.render();
  }

  onScroll() {
    this.scrollTop = this.container.scrollTop;
    this.render();
  }

  render() {
    const containerHeight = this.container.clientHeight;
    const visibleStart = Math.floor(this.scrollTop / this.itemHeight);
    const visibleEnd = Math.ceil((this.scrollTop + containerHeight) / this.itemHeight);

    // Add buffer
    this.visibleStart = Math.max(0, visibleStart - this.buffer);
    this.visibleEnd = Math.min(this.items.length, visibleEnd + this.buffer);

    // Render visible items
    const fragment = document.createDocumentFragment();

    for (let i = this.visibleStart; i < this.visibleEnd; i++) {
      const item = this.items[i];
      const element = document.createElement('div');
      element.style.position = 'absolute';
      element.style.top = `${i * this.itemHeight}px`;
      element.style.height = `${this.itemHeight}px`;
      element.style.left = '0';
      element.style.right = '0';
      element.innerHTML = this.renderItem(item, i);
      fragment.appendChild(element);
    }

    this.content.innerHTML = '';
    this.content.appendChild(fragment);
  }

  updateItems(items) {
    this.items = items;
    this.wrapper.style.height = `${this.items.length * this.itemHeight}px`;
    this.render();
  }

  scrollToIndex(index) {
    this.container.scrollTop = index * this.itemHeight;
  }

  destroy() {
    this.container.removeChild(this.wrapper);
  }
}

/**
 * Setup all intersection observers
 */
export function initIntersectionObservers() {
  setupLazyLoading();
  setupScrollAnimations();
  setupAnimationPausing();
}

// Auto-initialize on DOM ready
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initIntersectionObservers);
  } else {
    initIntersectionObservers();
  }
}
