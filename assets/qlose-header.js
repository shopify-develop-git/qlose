import { Component } from '@theme/component';

/**
 * Mobile navigation disclosure for the QLOSE header.
 *
 * The source markup toggled a class from an inline script with no link
 * between the button and the list, and no way to close from the keyboard.
 * This keeps the same inline-expansion design — a slide-out drawer would be
 * a different interaction — while wiring up aria-expanded, aria-controls and
 * Escape-to-close. No focus trap: the expanded list stays in the document
 * flow, so it is a disclosure, not a modal.
 *
 * @typedef {object} Refs
 * @property {HTMLElement} menu - The navigation list.
 * @property {HTMLButtonElement} toggle - The button that opens it.
 *
 * @extends {Component<Refs>}
 */
class QloseHeader extends Component {
  requiredRefs = ['menu', 'toggle'];

  connectedCallback() {
    super.connectedCallback();
    this.refs.toggle.addEventListener('click', this.#onToggle);
    document.addEventListener('keydown', this.#onKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.refs.toggle.removeEventListener('click', this.#onToggle);
    document.removeEventListener('keydown', this.#onKeydown);
  }

  get #isOpen() {
    return this.refs.menu.classList.contains('qlose-header__menu--open');
  }

  #setOpen(open) {
    this.refs.menu.classList.toggle('qlose-header__menu--open', open);
    this.refs.toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    this.refs.toggle.textContent = open ? 'Close' : 'Menu';
  }

  #onToggle = () => {
    this.#setOpen(!this.#isOpen);
  };

  #onKeydown = (event) => {
    if (event.key !== 'Escape' || !this.#isOpen) return;
    this.#setOpen(false);
    this.refs.toggle.focus();
  };
}

if (!customElements.get('qlose-header')) {
  customElements.define('qlose-header', QloseHeader);
}
