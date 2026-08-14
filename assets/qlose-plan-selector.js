import { Component } from '@theme/component';

/**
 * Purchase plan selector for the QLOSE product page.
 *
 * The design offers "kit + refills every 90 days" against "kit only". That is
 * a selling plan choice, and the store has no subscription app connected yet,
 * so this ships as a working UI bound to a single hook: the selected plan
 * writes its value into the form's hidden `selling_plan` input, which is
 * exactly what Shopify's cart API expects.
 *
 * To go live, give each plan block the id of a real
 * product.selling_plan_groups entry. Nothing here changes. An empty value is
 * a one-time purchase, which is also the correct behaviour today.
 *
 * @typedef {object} Refs
 * @property {HTMLInputElement} sellingPlanInput - Hidden input posted with the form.
 *
 * @extends {Component<Refs>}
 */
class QlosePlanSelector extends Component {
  requiredRefs = ['sellingPlanInput'];

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

  #select(plan) {
    if (!plan) return;
    for (const el of this.#plans) {
      const active = el === plan;
      el.classList.toggle('qlose-plan--active', active);
      el.setAttribute('aria-checked', active ? 'true' : 'false');
      el.tabIndex = active ? 0 : -1;
    }
    this.refs.sellingPlanInput.value = plan.dataset.sellingPlan || '';
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
