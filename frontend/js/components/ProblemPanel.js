// Problem statement: free text the user pastes (statement, constraints, examples). Collapsible.

export class ProblemPanel {
  constructor({ card, toggle, textarea, onChange }) {
    this.card = card;
    this.toggle = toggle;
    this.textarea = textarea;
    textarea.addEventListener('input', () => onChange(textarea.value));
    toggle.addEventListener('click', () => this.setCollapsed(!this.card.classList.contains('collapsed')));
  }

  setValue(text) {
    this.textarea.value = text || '';
  }

  setCollapsed(collapsed) {
    this.card.classList.toggle('collapsed', collapsed);
    this.toggle.setAttribute('aria-expanded', String(!collapsed));
  }
}
