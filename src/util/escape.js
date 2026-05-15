const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(input) {
  if (input == null) return '';
  const s = String(input);
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

export function escapeAttr(input) {
  return escapeHtml(input);
}
