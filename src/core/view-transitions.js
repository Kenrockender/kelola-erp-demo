// ═══════════════════════════════════════════════════════════════════════════════
// VIEW TRANSITIONS API UTILITIES
// Smooth page transitions using the modern View Transitions API
// ═══════════════════════════════════════════════════════════════════════════════
/* eslint-disable no-console -- transition tracing is the point of these callbacks */

/**
 * Check if View Transitions API is supported
 */
export function supportsViewTransitions() {
  return 'startViewTransition' in document;
}

/**
 * Perform a view transition
 * @param {Function} updateCallback - Function that updates the DOM
 * @param {Object} options - Transition options
 */
export async function transitionView(updateCallback, options = {}) {
  const { skipTransition = false, onStart = null, onFinish = null } = options;

  // Fallback for browsers without View Transitions API
  if (!supportsViewTransitions() || skipTransition) {
    await updateCallback();
    return;
  }

  try {
    if (onStart) {
      onStart();
    }

    const transition = document.startViewTransition(async () => {
      await updateCallback();
    });

    await transition.finished;

    if (onFinish) {
      onFinish();
    }
  } catch (error) {
    console.error('[View Transition] Error:', error);
    // Fallback to immediate update
    await updateCallback();
  }
}

/**
 * Navigate between views with transition
 */
export async function navigateWithTransition(targetView, updateFunction) {
  return transitionView(updateFunction, {
    onStart: () => {
      console.log(`[View Transition] Navigating to ${targetView}`);
    },
    onFinish: () => {
      console.log(`[View Transition] Navigation to ${targetView} complete`);
    },
  });
}

/**
 * Transition for modal open/close
 */
export async function transitionModal(isOpening, updateFunction) {
  const transitionName = isOpening ? 'modal-open' : 'modal-close';

  return transitionView(updateFunction, {
    onStart: () => {
      document.documentElement.classList.add(transitionName);
    },
    onFinish: () => {
      document.documentElement.classList.remove(transitionName);
    },
  });
}

/**
 * Transition for list updates (add/remove items)
 */
export async function transitionList(updateFunction) {
  return transitionView(updateFunction, {
    onStart: () => {
      document.documentElement.classList.add('list-transition');
    },
    onFinish: () => {
      document.documentElement.classList.remove('list-transition');
    },
  });
}

/**
 * Transition for theme changes
 */
export async function transitionTheme(newTheme, updateFunction) {
  return transitionView(updateFunction, {
    onStart: () => {
      document.documentElement.classList.add('theme-transition');
    },
    onFinish: () => {
      document.documentElement.classList.remove('theme-transition');
      console.log(`[View Transition] Theme changed to ${newTheme}`);
    },
  });
}

/**
 * Custom transition with specific animation
 */
export async function customTransition(updateFunction, animationClass) {
  return transitionView(updateFunction, {
    onStart: () => {
      document.documentElement.classList.add(animationClass);
    },
    onFinish: () => {
      document.documentElement.classList.remove(animationClass);
    },
  });
}

/**
 * Batch multiple transitions
 */
export async function batchTransitions(transitions) {
  for (const { updateFunction, options } of transitions) {
    await transitionView(updateFunction, options);
  }
}

/**
 * Transition with loading state
 */
export async function transitionWithLoading(updateFunction, loadingElement) {
  return transitionView(
    async () => {
      if (loadingElement) {
        loadingElement.classList.add('loading');
      }

      await updateFunction();

      if (loadingElement) {
        loadingElement.classList.remove('loading');
      }
    },
    {
      onStart: () => {
        console.log('[View Transition] Loading started');
      },
      onFinish: () => {
        console.log('[View Transition] Loading finished');
      },
    }
  );
}

/**
 * Transition for sorting/filtering
 */
export async function transitionDataUpdate(updateFunction) {
  return transitionView(updateFunction, {
    onStart: () => {
      document.documentElement.classList.add('data-update-transition');
    },
    onFinish: () => {
      document.documentElement.classList.remove('data-update-transition');
    },
  });
}

/**
 * Setup view transition names for elements
 */
export function setupViewTransitionNames() {
  if (!supportsViewTransitions()) {
    return;
  }

  // Add view-transition-name to key elements
  const elements = {
    '.sidebar': 'sidebar',
    '.topbar': 'topbar',
    '.content': 'content',
    '.modal': 'modal',
    '.toast-container': 'toast-container',
  };

  Object.entries(elements).forEach(([selector, name]) => {
    const element = document.querySelector(selector);
    if (element) {
      element.style.viewTransitionName = name;
    }
  });
}

/**
 * Prefers reduced motion check
 */
export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Smart transition that respects user preferences
 */
export async function smartTransition(updateFunction, options = {}) {
  const shouldSkip = prefersReducedMotion() || options.forceSkip;

  return transitionView(updateFunction, {
    ...options,
    skipTransition: shouldSkip,
  });
}

// Auto-setup on load
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupViewTransitionNames);
  } else {
    setupViewTransitionNames();
  }
}
