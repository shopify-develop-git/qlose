import { Component } from '@theme/component';

/**
 * Publishes the announcement bar's height as --qlose-announce-height.
 *
 * The header has to pin while the announcement bar scrolls away, which is what
 * the design does. A section cannot do that on its own: position: sticky is
 * bounded by the containing block, and the header section's containing block is
 * #header-group, which is only as tall as this bar plus the header. So the
 * whole group is the sticky element, pulled up by exactly this height so the
 * bar clears the viewport and the header lands at the top. Horizon reaches the
 * same conclusion for its own header, see the #header-group rule in
 * sections/header.liquid.
 *
 * Measured rather than hardcoded because the bar wraps to two or three lines on
 * a narrow viewport. Without JavaScript the variable stays at its 0px fallback
 * and the whole group pins, including the bar, which is a reasonable degraded
 * state rather than a broken one.
 *
 * @extends {Component}
 */
class QloseAnnouncementBar extends Component {
  #observer;

  connectedCallback() {
    super.connectedCallback();
    this.#observer = new ResizeObserver(() => this.#publish());
    this.#observer.observe(this);
    this.#publish();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#observer?.disconnect();
    document.documentElement.style.removeProperty('--qlose-announce-height');
  }

  #publish() {
    const height = this.getBoundingClientRect().height;
    document.documentElement.style.setProperty('--qlose-announce-height', `${Math.round(height)}px`);
  }
}

if (!customElements.get('qlose-announcement-bar')) {
  customElements.define('qlose-announcement-bar', QloseAnnouncementBar);
}
