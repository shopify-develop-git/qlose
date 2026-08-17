import { Component } from '@theme/component';

/**
 * Auto-playing announcement ticker.
 *
 * Two jobs, both of which need measurement, which is why this is a component
 * rather than pure CSS.
 *
 * The loop. The track scrolls left by exactly one set and restarts, which reads
 * as continuous only while a set follows the one leaving the viewport. Liquid
 * renders two, enough for a phone and not enough for a wide monitor, so copies
 * are cloned until the track covers the viewport plus one set. Translating by a
 * measured set width rather than a percentage keeps the speed constant however
 * many copies that turns out to be: one cycle is always one set.
 *
 * The header offset. The header group is the sticky element and is pulled up by
 * this bar's height so the bar scrolls away while the nav pins, which needs the
 * height as a number. It is measured rather than assumed because the bar wraps
 * to two or three lines on a narrow viewport.
 *
 * Without JavaScript the CSS fallbacks apply: the bar sits still at 0px offset,
 * so the whole group pins and the messages read as a static row.
 *
 * @extends {Component}
 */
class QloseAnnouncementBar extends Component {
  #observer;

  connectedCallback() {
    super.connectedCallback();
    this.#observer = new ResizeObserver(() => this.#measure());
    this.#observer.observe(this);
    this.#measure();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#observer?.disconnect();
    document.documentElement.style.removeProperty('--qlose-announce-height');
  }

  get #track() {
    return this.querySelector('.qlose-announce__track');
  }

  #measure() {
    document.documentElement.style.setProperty(
      '--qlose-announce-height',
      `${Math.round(this.getBoundingClientRect().height)}px`
    );

    const track = this.#track;
    const set = track?.firstElementChild;
    if (!track || !set) return;

    const setWidth = set.getBoundingClientRect().width;
    if (!setWidth) return;

    // Enough copies that one set can leave the viewport with another behind it.
    const wanted = Math.max(2, Math.ceil(window.innerWidth / setWidth) + 1);
    for (let i = track.children.length; i < wanted; i++) {
      const copy = /** @type {HTMLElement} */ (set.cloneNode(true));
      copy.setAttribute('aria-hidden', 'true');
      track.appendChild(copy);
    }

    track.style.setProperty('--qlose-announce-step', `${setWidth}px`);
  }
}

if (!customElements.get('qlose-announcement-bar')) {
  customElements.define('qlose-announcement-bar', QloseAnnouncementBar);
}
