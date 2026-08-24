import { Component } from '@theme/component';

/**
 * Purchase plan selector for the QLOSE product page.
 *
 * The design offers "kit + refills every 90 days" against "kit only", and both
 * are the same line item. The kit is sold on a selling plan whose first cycle
 * is the kit at its own price and whose later cycles are the refill box at
 * its -- the subscription app swaps the product once the contract exists, so
 * the shopper pays twenty-nine pounds today and eighteen every ninety days
 * after, which is what the page has always said.
 *
 * So this component has one job: keep the form's hidden selling_plan input in
 * step with the chosen plan. A subscription plan writes its id; "kit only"
 * empties the input and disables it, because a disabled field is not
 * submitted and an empty selling_plan is not a purchase option.
 *
 * The input is rendered server-side already set for whichever plan starts
 * active, so a shopper who reaches the button before this module loads still
 * gets the plan they can see selected.
 *
 * @extends {Component}
 */
class QlosePlanSelector extends Component {
  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('click', this.#onClick);
    this.addEventListener('keydown', this.#onKeydown);
    this.#syncPlanInput();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('click', this.#onClick);
    this.removeEventListener('keydown', this.#onKeydown);
  }

  get #planInput() {
    return this.closest('form')?.querySelector('[data-plan-input]');
  }

  get #plans() {
    return [...this.querySelectorAll('.qlose-plan')];
  }

  get #activePlan() {
    return this.#plans.find((el) => el.classList.contains('qlose-plan--active'));
  }

  /** Writes the active plan onto the form, or takes the field out of the post. */
  #syncPlanInput() {
    const input = this.#planInput;
    if (!input) return;

    const id = this.#activePlan?.dataset.sellingPlan || '';
    input.value = id;
    input.disabled = !id;
  }

  #select(plan) {
    if (!plan) return;
    for (const el of this.#plans) {
      const active = el === plan;
      el.classList.toggle('qlose-plan--active', active);
      el.setAttribute('aria-checked', active ? 'true' : 'false');
      el.tabIndex = active ? 0 : -1;
    }
    this.#syncPlanInput();
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
