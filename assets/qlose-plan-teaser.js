import { Component } from '@theme/component';

/**
 * Subscription teaser on the homepage: a list of kits beside a square that
 * shows the one you are looking at.
 *
 * The rows are a choice, not links. The design source gives them a pointer
 * cursor, a hover state and an `.active` state, and puts a single button
 * underneath -- so a row selects, and the button is the only way out of the
 * section. Which is also why the button's href moves with the selection
 * instead of being nailed to one kit.
 *
 * Every frame is in the square from the start, stacked and transparent, and
 * this only switches which one is opaque. Nothing is fetched on the click and
 * the browser has already decoded what it is about to show.
 *
 * The selected plan is server-rendered: with no JS the preselected row is
 * marked, its photo is the one showing, and the button already points at that
 * product. This moves the selection, it does not create it.
 *
 * @typedef {object} Refs
 * @property {HTMLAnchorElement} [cta] - Button under the list. A <span> without
 *   an href when no plan has a product, which is why it is not required.
 *
 * @extends {Component<Refs>}
 */
class QlosePlanTeaser extends Component {
  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('click', this.#onClick);
    this.addEventListener('keydown', this.#onKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('click', this.#onClick);
    this.removeEventListener('keydown', this.#onKeydown);
  }

  get #plans() {
    return [...this.querySelectorAll('.qlose-plan')];
  }

  get #frames() {
    return [...this.querySelectorAll('.qlose-subscribe__frame')];
  }

  /** @param {HTMLElement | null} plan - The row to move the selection to. */
  #select(plan) {
    if (!plan) return;

    const id = plan.dataset.plan;

    for (const el of this.#plans) {
      const active = el === plan;
      el.classList.toggle('qlose-plan--active', active);
      el.setAttribute('aria-checked', active ? 'true' : 'false');
      el.tabIndex = active ? 0 : -1;
    }

    // A plan with no frame of its own would otherwise blank the square. Leave
    // the picture where it is instead: a stale photo beats an empty panel.
    const frames = this.#frames;
    if (frames.some((frame) => frame.dataset.planFrame === id)) {
      for (const frame of frames) {
        const active = frame.dataset.planFrame === id;
        frame.classList.toggle('qlose-subscribe__frame--active', active);
        // The frames underneath are still painted, only transparent, so they
        // have to be taken out of the accessibility tree by hand.
        if (active) frame.removeAttribute('aria-hidden');
        else frame.setAttribute('aria-hidden', 'true');
      }
    }

    const { cta } = this.refs;
    const url = plan.dataset.planUrl;
    if (cta instanceof HTMLAnchorElement && url) cta.href = url;
  }

  #onClick = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const plan = target?.closest('.qlose-plan');
    if (plan instanceof HTMLElement && this.contains(plan)) this.#select(plan);
  };

  #onKeydown = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const plan = target?.closest('.qlose-plan');
    if (!(plan instanceof HTMLElement) || !this.contains(plan)) return;

    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      this.#select(plan);
      return;
    }

    const steps = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    const step = steps[event.key];
    if (!step) return;

    // Arrow keys move the selection inside a radio group, which is why the
    // list takes one tab stop rather than one per row.
    event.preventDefault();
    const plans = this.#plans;
    const next = plans[(plans.indexOf(plan) + step + plans.length) % plans.length];
    this.#select(next);
    next?.focus();
  };
}

if (!customElements.get('qlose-plan-teaser')) {
  customElements.define('qlose-plan-teaser', QlosePlanTeaser);
}
