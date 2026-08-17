import { Component } from '@theme/component';

/* Opening eases out -- away quickly, settling into place. Closing eases in, the
   other way about: it gives before it goes, rather than dropping at once and
   then crawling the last of the way, which is what one curve in both
   directions produced. Closing also runs a little shorter; a panel on its way
   out does not need to be watched. */
const EASING_OPEN = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
const EASING_CLOSE = 'cubic-bezier(0.4, 0, 0.85, 0.35)';
const CLOSE_SCALE = 0.8;

/**
 * Exclusive disclosure group with an animated open and close.
 *
 * Native <details> gives neither. The `name` attribute would group the panels,
 * but it closes the previous one by dropping its `open` attribute outright,
 * which is instant. And the panels animate on a grid row from 0fr to 1fr, which
 * a CSS transition will only carry in one direction and only sometimes: a
 * closed <details> keeps its content out of rendering entirely, so on the way
 * open there is no previous value to leave, and on the way shut the content
 * stops rendering before anything can move.
 *
 * Pinning the row and forcing a reflow, then waiting out two animation frames,
 * both looked like fixes, because a panel that had already been through one
 * cycle holds a computed style and animates anyway. The first open after a
 * panel came back into rendering still jumped -- reliably, on any group whose
 * panels were all shut.
 *
 * So the animation is driven directly instead. Web Animations states both ends
 * explicitly, which is exactly what is missing here: nothing has to be inferred
 * from a previous style that does not exist. The stylesheet keeps its
 * transition, which is what a panel gets if this script never runs.
 *
 * Height in pixels, not the grid row the stylesheet uses. Animating between 0fr
 * and 1fr makes the browser resolve the fraction against available space on
 * every frame, which on a long page drops enough of them to be seen -- the
 * close, running down through the whole document, showed it worst. A pixel
 * height interpolates directly. The row underneath stays at 1fr and the clipped
 * wrapper inside it takes whatever height the animation is holding.
 *
 * @extends {Component}
 */
class QloseAccordion extends Component {
  /** The animation in flight for a panel, if any, so it can be called off. */
  #running = new WeakMap();

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

  #onClick = (event) => {
    const summary = /** @type {Element} */ (event.target).closest('summary');
    if (!summary) return;

    const details = /** @type {HTMLDetailsElement | null} */ (summary.closest('details'));
    if (!details || !this.#items.includes(details)) return;

    // The browser would toggle `open` here; both directions are driven below.
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
   * Silences the stylesheet's transition on a panel this component is driving.
   * Left on, it would fight: dropping `open` at the end of a close moves the
   * base value from 1fr to 0fr, and the transition starts its own 320ms
   * collapse from a row the animation has already brought to nothing -- the
   * same close played a second time.
   *
   * @param {HTMLElement} panel
   */
  #takeOver(panel) {
    if (panel.style.transition !== 'none') panel.style.transition = 'none';
  }

  /** @param {HTMLDetailsElement} details */
  #cancel(details) {
    this.#running.get(details)?.cancel();
    this.#running.delete(details);
  }

  /** @param {HTMLDetailsElement} details */
  #open(details) {
    this.#cancel(details);

    const panel = this.#panel(details);
    // `open` first: the content has to be rendered before it can be measured.
    details.open = true;

    if (!panel || this.#reducedMotion || typeof panel.animate !== 'function') return;

    this.#takeOver(panel);
    const animation = panel.animate(
      [{ height: '0px' }, { height: `${panel.scrollHeight}px` }],
      { duration: this.#duration(panel), easing: EASING_OPEN }
    );

    this.#running.set(details, animation);
    animation.finished.then(() => this.#running.delete(details)).catch(() => {});
  }

  /** @param {HTMLDetailsElement} details */
  #close(details) {
    this.#cancel(details);

    const panel = this.#panel(details);
    if (!panel || this.#reducedMotion || typeof panel.animate !== 'function') {
      details.open = false;
      return;
    }

    this.#takeOver(panel);

    // fill holds the shut frame after the animation ends. Without it the row
    // springs back to the [open] rule for the instant before the attribute
    // comes off, which reads as a flicker at the end of every close.
    const animation = panel.animate(
      [{ height: `${panel.getBoundingClientRect().height}px` }, { height: '0px' }],
      {
        duration: Math.round(this.#duration(panel) * CLOSE_SCALE),
        easing: EASING_CLOSE,
        fill: 'forwards',
      }
    );

    this.#running.set(details, animation);
    animation.finished
      .then(() => {
        this.#running.delete(details);
        // Only now, with the row already at nothing, so no frame shows the
        // content disappearing at full height.
        details.open = false;
        animation.cancel();
      })
      // A cancelled animation rejects: the panel was reopened, nothing to do.
      .catch(() => {});
  }
}

if (!customElements.get('qlose-accordion')) {
  customElements.define('qlose-accordion', QloseAccordion);
}
