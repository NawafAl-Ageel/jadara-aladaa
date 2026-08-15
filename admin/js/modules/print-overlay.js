import { $ } from './dom.js';

/* Shared full-screen print/PDF overlay (browser print dialog, @media print
   in admin.css hides everything else) — reused by proposals and Consulting
   Studio previews so there's one overlay mechanism, not one per feature. */

export function setPrintContent(html) {
  $('#printContent').innerHTML = html;
}

export function showPrintOverlay() {
  $('#printOverlay').classList.add('is-visible');
}

export function hidePrintOverlay() {
  $('#printOverlay').classList.remove('is-visible');
}

export function bindPrintOverlay() {
  $('#printCloseBtn').addEventListener('click', hidePrintOverlay);
  $('#printNowBtn').addEventListener('click', () => window.print());
}
