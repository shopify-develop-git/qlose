import { Component } from '@theme/component';

/**
 * Purchase plan selector for the QLOSE product page.
 *
 * The design offers "kit + refills every 90 days" against "kit only", and the
 * shape of that is not one line item on a selling plan. The kit is bought
 * once. What recurs is a refill box -- a different product, at a different
 * price, packed from different shelves -- so the subscription lives on that
 * line, and choosing "kit + refills" has to put two lines in the cart, not
 * one.
 *
 * Which is what this does: a plan block carrying both a refill variant and a
 * selling plan intercepts the click on Add to cart, posts the refill line on
 * its own, and only then lets the form submit. Horizon adds the kit, refreshes
 * the cart -- the refill is already sitting in it -- and opens the drawer with
 * both lines. Cheaper than reimplementing product-form.js, and the cart events
 * the drawer and the header count listen for keep firing from their usual
 * place.
 *
 * Order matters: refill first, kit second. If the refill add fails the kit
 * still goes in, which is the right way round -- a shopper who wanted the
 * bundle and got the kit has something to complain about, one who got neither
 * has only silence.
 *
 * A plan with no refill variant, or no selling plan, is a plain one-time
 * purchase and this never gets in the way of it.
 *
 * @extends {Component}
 */
class QlosePlanSelector extends Component {
  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('click', this.#onClick);
    this.addEventListener('keydown', this.#onKeydown);
    this.#form?.addEventListener('click', this.#onAddToCart);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('click', this.#onClick);
    this.removeEventListener('keydown', this.#onKeydown);
    this.#form?.removeEventListener('click', this.#onAddToCart);
  }

  get #form() {
    return this.closest('form');
  }

  /** The refill line the selected plan asks for, if it asks for one. */
  get #refillLine() {
    const plan = this.#plans.find((el) => el.classList.contains('qlose-plan--active'));
    const id = plan?.dataset.refillVariant;
    const sellingPlan = plan?.dataset.sellingPlan;

    if (!id || !sellingPlan) return null;

    return { id: Number(id), quantity: 1, selling_plan: Number(sellingPlan) };
  }

  #onAddToCart = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest('button[type="submit"][name="add"]');
    if (!button) return;

    const line = this.#refillLine;
    if (!line) return;

    const form = this.#form;
    if (!form) return;

    // Cancels the submit this click would otherwise cause; it is reissued
    // below once the refill is in the cart.
    event.preventDefault();

    const url = (window.Theme?.routes?.cart_add_url || '/cart/add') + '.js';

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: [line] }),
    })
      .catch(() => {})
      .then(() => form.requestSubmit(button instanceof HTMLElement ? button : undefined));
  };

  get #plans() {
    return [...this.querySelectorAll('.qlose-plan')];
  }

  #select(plan) {
    if (!plan) return;
    for (const el of this.#plans) {
      const active = el === plan;
      el.classList.toggle('qlose-plan--active', active);
      el.setAttribute('aria-checked', active ? 'true' : 'false');
      el.tabIndex = active ? 0 : -1;
    }
  }

  #onClick = (event) => {
    const plan = event.target.closest('.qlose-plan');
    if (plan && this.contains(plan)) this.#select(plan);
  };

  #onKeydown = (event) => {
    const plan = event.target.closest('.qlose-plan');
    if (!plan || !this.contains(plan)) return;

    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      this.#select(plan);
      return;
    }

    const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    const step = keys[event.key];
    if (!step) return;

    event.preventDefault();
    const plans = this.#plans;
    const next = plans[(plans.indexOf(plan) + step + plans.length) % plans.length];
    this.#select(next);
    next.focus();
  };
}

if (!customElements.get('qlose-plan-selector')) {
  customElements.define('qlose-plan-selector', QlosePlanSelector);
}
