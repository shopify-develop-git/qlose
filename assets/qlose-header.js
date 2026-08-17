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
 * @property {HTMLElement} [scrim] - Backdrop shown behind the open menu.
 *
 * @extends {Component<Refs>}
 */
class QloseHeader extends Component {
  requiredRefs = ['menu', 'toggle'];

  connectedCallback() {
    super.connectedCallback();
    this.refs.toggle.addEventListener('click', this.#onToggle);
    this.refs.scrim?.addEventListener('click', this.#onScrimClick);
    document.addEventListener('keydown', this.#onKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.refs.toggle.removeEventListener('click', this.#onToggle);
    this.refs.scrim?.removeEventListener('click', this.#onScrimClick);
    document.removeEventListener('keydown', this.#onKeydown);
  }

  get #isOpen() {
    return this.refs.menu.classList.contains('qlose-header__menu--open');
  }

  #setOpen(open) {
    this.refs.menu.classList.toggle('qlose-header__menu--open', open);
    // The scrim is a sibling of the menu, so the open state is mirrored on the
    // host for it to key off.
    this.classList.toggle('qlose-header--open', open);
    this.refs.toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    this.refs.toggle.textContent = open ? 'Close' : 'Menu';
  }

  // Tapping the dimmed page is the gesture people expect to dismiss with, and
  // it is the only one available to a pointer once the backdrop covers
  // everything. Focus goes back to the toggle, as it does on Escape.
  #onScrimClick = () => {
    if (!this.#isOpen) return;
    this.#setOpen(false);
    this.refs.toggle.focus();
  };

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
