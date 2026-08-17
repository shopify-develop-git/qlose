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
  /** One per panel with an open or close in flight, so it can be called off. */
  #pending = new WeakMap();

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

  /**
   * How long the row should take, given how far it has to go. One fixed length
   * cannot serve both a two-line answer and a twenty-line one -- the short
   * panel drags and the long one still feels hurried -- so the distance sets
   * it, held between a floor and a ceiling so nothing snaps or crawls.
   *
   * @param {HTMLElement} panel
   */
  #duration(panel) {
    const content = panel.firstElementChild;
    const height = content instanceof HTMLElement ? content.scrollHeight : 0;
    return Math.round(Math.min(420, Math.max(200, 150 + height * 0.35)));
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

  /**
   * A closed <details> does not render its content at all, so at the moment it
   * opens there is no previous value for the row to animate away from and the
   * browser jumps straight to the end -- the first open of any panel arrived
   * with no animation, while every one after a close looked right. Opening it,
   * pinning the row shut, flushing that, then handing the row back to the
   * stylesheet gives the transition the start it was missing.
   *
   * @param {HTMLDetailsElement} details
   */
  #open(details) {
    this.#cancel(details);

    const panel = this.#panel(details);
    if (!panel || this.#reducedMotion) {
      details.open = true;
      return;
    }

    details.open = true;
    panel.style.setProperty('--qlose-accordion-duration', `${this.#duration(panel)}ms`);
    panel.style.gridTemplateRows = '0fr';
    panel.style.paddingBottom = '0';

    // Two frames, not a forced reflow. Reading a layout property flushes style
    // and layout, but the browser is still free to fold the shut state and the
    // release that follows into one recalculation, and a transition needs the
    // shut state to have been a rendered frame of its own. A panel that had
    // been opened once already got away with it -- hence an animation that
    // worked on every open but the first one after a panel came back into
    // rendering, which is exactly when a group had all its panels shut.
    const controller = new AbortController();
    this.#pending.set(details, controller);

    requestAnimationFrame(() => {
      if (controller.signal.aborted) return;
      requestAnimationFrame(() => {
        if (controller.signal.aborted) return;
        panel.style.gridTemplateRows = '';
        panel.style.paddingBottom = '';
        this.#pending.delete(details);
      });
    });
  }

  /** @param {HTMLDetailsElement} details */
  #close(details) {
    const panel = this.#panel(details);

    if (!panel || this.#reducedMotion) {
      details.open = false;
      return;
    }

    this.#cancel(details);

    const controller = new AbortController();
    this.#pending.set(details, controller);

    const duration = this.#duration(panel);
    panel.style.setProperty('--qlose-accordion-duration', `${duration}ms`);
    panel.style.gridTemplateRows = '0fr';
    panel.style.paddingBottom = '0';

    // `open` comes off before the inline styles do. The other way round, the
    // stylesheet's [open] rule owns the row again for an instant with nothing
    // overriding it, which is an instruction to expand.
    const settle = () => {
      details.open = false;
      this.#cancel(details);
    };

    panel.addEventListener(
      'transitionend',
      (event) => {
        if (event.target === panel && event.propertyName === 'grid-template-rows') settle();
      },
      { signal: controller.signal }
    );

    // If the transition never fires -- none declared, or the tab in the
    // background -- the panel would be left shut but still marked open.
    const timer = window.setTimeout(settle, duration + 200);
    controller.signal.addEventListener('abort', () => window.clearTimeout(timer));
  }

  /**
   * Calls off a close in flight and puts the panel back under stylesheet
   * control. Reopening mid-close otherwise left the old transitionend listener
   * armed: it fired on the way *open* and pulled `open` straight back off,
   * collapsing the panel the moment it had finished expanding.
   *
   * @param {HTMLDetailsElement} details
   */
  #cancel(details) {
    const controller = this.#pending.get(details);
    if (controller) {
      controller.abort();
      this.#pending.delete(details);
    }

    const panel = this.#panel(details);
    if (panel) {
      panel.style.gridTemplateRows = '';
      panel.style.paddingBottom = '';
      panel.style.removeProperty('--qlose-accordion-duration');
    }
  }
}

if (!customElements.get('qlose-accordion')) {
  customElements.define('qlose-accordion', QloseAccordion);
}
