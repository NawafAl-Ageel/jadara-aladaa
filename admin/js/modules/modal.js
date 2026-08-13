import { $ } from './dom.js';

export function setModalContent(html) {
  $('#modalBox').innerHTML = html;
}

export function openModal() {
  $('#modalOverlay').classList.add('is-visible');
}

export function closeModal() {
  $('#modalOverlay').classList.remove('is-visible');
  $('#modalBox').innerHTML = '';
}

export function bindModalOverlayClose() {
  $('#modalOverlay')?.addEventListener('click', (e) => {
    if (e.target === $('#modalOverlay')) closeModal();
  });
}
