import { Component } from '@theme/component';

/**
 * Product gallery: the thumbnails select a frame and the arrows step through
 * them.
 *
 * The design source ships four thumbnails that only move a border between
 * themselves -- the large frame never changes, because every image there is
 * hard-coded into the page. With the media coming from the product, the frame
 * holds every image at once, stacked, and this switches which one is opaque.
 * That keeps the switch instant after first paint: nothing is fetched on the
 * click, and the browser has already decoded what it is about to show.
 *
 * Both controls are ordinary buttons, so the keyboard reaches them by tabbing
 * and nothing here has to reimplement focus. The arrows wrap around; a gallery
 * of four with no way back from the last frame is a dead end, and the count is
 * small enough that wrapping cannot be mistaken for a longer list.
 *
 * @extends {Component}
 */
class QloseGallery extends Component {
  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('click', this.#onClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('click', this.#onClick);
  }

  get #slides() {
    return [...this.querySelectorAll('.qlose-product__slide')];
  }

  get #thumbs() {
    return [...this.querySelectorAll('.qlose-product__thumb')];
  }

  /** The frame on show, which is where a step has to start from. */
  get #current() {
    const index = this.#slides.findIndex((slide) =>
      slide.classList.contains('qlose-product__slide--active')
    );
    return index === -1 ? 0 : index;
  }

  /** @param {number} index - Wrapped, so a step off either end comes round. */
  #show(index) {
    const slides = this.#slides;
    if (slides.length < 2) return;

    const next = ((index % slides.length) + slides.length) % slides.length;

    slides.forEach((slide, position) => {
      const active = position === next;
      slide.classList.toggle('qlose-product__slide--active', active);
      // The frames underneath are still painted, only transparent, so they
      // have to be taken out of the accessibility tree by hand.
      if (active) slide.removeAttribute('aria-hidden');
      else slide.setAttribute('aria-hidden', 'true');
    });

    this.#thumbs.forEach((thumb, position) => {
      const active = position === next;
      thumb.classList.toggle('qlose-product__thumb--active', active);
      if (active) thumb.setAttribute('aria-current', 'true');
      else thumb.removeAttribute('aria-current');
    });
  }

  #onClick = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const thumb = target.closest('.qlose-product__thumb');
    if (thumb instanceof HTMLElement && this.contains(thumb)) {
      this.#show(this.#thumbs.indexOf(thumb));
      return;
    }

    const arrow = target.closest('.qlose-product__arrow');
    if (arrow instanceof HTMLElement && this.contains(arrow)) {
      this.#show(this.#current + Number(arrow.dataset.step || 0));
    }
  };
}

if (!customElements.get('qlose-gallery')) {
  customElements.define('qlose-gallery', QloseGallery);
}
