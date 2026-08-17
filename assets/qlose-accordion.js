import { Component } from '@theme/component';

/**
 * Exclusive disclosure group with an animated close.
 *
 * Two things native <details> will not do on its own.
 *
 * One at a time. Opening a panel closes whichever sibling was open. The HTML
 * `name` attribute groups details natively, but it closes the other panel by
 * dropping its `open` attribute outright, which skips the transition -- the
 * very thing this is here to preserve. So the grouping is done here instead.
 *
 * A close you can see. The panels animate on a grid row from 0fr to 1fr, which
 * the browser will run on the way open but not on the way shut: removing `open`
 * takes the content out of rendering immediately and there is nothing left to
 * transition. Closing therefore drives the row to 0fr first, with the panel
 * still open, and drops `open` once the transition lands.
 *
 * The inline style is deliberate. It has to outrank each section's own
 * `[open] .panel { grid-template-rows: 1fr }`, and those selectors differ per
 * section -- the FAQ's and the product page's do not share a class -- so a
 * stylesheet rule would need to know all of them.
 *
 * Reduced motion skips all of it and toggles the attribute, which is what the
 * preference asks for.
 *
 * @extends {Component}
 */
class QloseAccordion extends Component {
  /** @type {WeakMap<HTMLDetailsElement, number>} */
  #fallbacks = new WeakMap();

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('click', this.#onClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('click', this.#onClick);
  }

  get #reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Panels belonging to this group, not to an accordion nested inside it. */
  get #items() {
    return [...this.querySelectorAll('details')].filter(
      (details) => details.closest('qlose-accordion') === this
    );
  }

  /** @param {HTMLDetailsElement} details */
  #panel(details) {
    return /** @type {HTMLElement | null} */ (details.querySelector(':scope > *:not(summary)'));
  }

  #onClick = (event) => {
    const summary = /** @type {Element} */ (event.target).closest('summary');
    if (!summary) return;

    const details = /** @type {HTMLDetailsElement | null} */ (summary.closest('details'));
    if (!details || !this.#items.includes(details)) return;

    // The browser would toggle `open` here; closing has to be animated first.
    event.preventDefault();

    if (details.open) {
      this.#close(details);
      return;
    }

    for (const other of this.#items) {
      if (other !== details && other.open) this.#close(other);
    }
    this.#open(details);
  };

  /** @param {HTMLDetailsElement} details */
  #open(details) {
    this.#clear(details);
    details.open = true;
  }

  /** @param {HTMLDetailsElement} details */
  #close(details) {
    const panel = this.#panel(details);

    if (!panel || this.#reducedMotion) {
      details.open = false;
      return;
    }

    panel.style.gridTemplateRows = '0fr';
    panel.style.paddingBottom = '0';

    const settle = () => {
      window.clearTimeout(this.#fallbacks.get(details));
      this.#fallbacks.delete(details);
      panel.removeEventListener('transitionend', onEnd);
      details.open = false;
      panel.style.gridTemplateRows = '';
      panel.style.paddingBottom = '';
    };

    const onEnd = (event) => {
      if (event.target === panel && event.propertyName === 'grid-template-rows') settle();
    };

    panel.addEventListener('transitionend', onEnd);
    // If the transition never fires -- no transition declared, the tab in the
    // background -- the panel would be left shut but still marked open.
    this.#fallbacks.set(details, window.setTimeout(settle, 600));
  }

  /** Drops a close that is still in flight, so reopening starts from rest. */
  #clear(details) {
    const panel = this.#panel(details);
    const timer = this.#fallbacks.get(details);
    if (timer) {
      window.clearTimeout(timer);
      this.#fallbacks.delete(details);
    }
    if (panel) {
      panel.style.gridTemplateRows = '';
      panel.style.paddingBottom = '';
    }
  }
}

if (!customElements.get('qlose-accordion')) {
  customElements.define('qlose-accordion', QloseAccordion);
}
