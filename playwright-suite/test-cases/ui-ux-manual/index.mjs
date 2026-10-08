import { ACCOUNT_UI_UX_CASES } from './account.mjs';
import { AGENTS_UI_UX_CASES } from './agents.mjs';
import { CONNECTORS_UI_UX_CASES } from './connectors.mjs';
import { GUARDRAILS_UI_UX_CASES } from './guardrails.mjs';
import { KNOWLEDGE_UI_UX_CASES } from './knowledge.mjs';
import { TOOLS_UI_UX_CASES } from './tools.mjs';
import { UI_COMPONENTS_UI_UX_CASES } from './ui-components.mjs';
import { PRODUCT_TOUR_UI_UX_CASES } from './product-tour.mjs';

export const UI_UX_MANUAL_CASES = Object.freeze({
  Account: ACCOUNT_UI_UX_CASES,
  Agents: AGENTS_UI_UX_CASES,
  Tools: TOOLS_UI_UX_CASES,
  Connectors: CONNECTORS_UI_UX_CASES,
  Knowledge: KNOWLEDGE_UI_UX_CASES,
  Guardrails: GUARDRAILS_UI_UX_CASES,
  'UI Components': UI_COMPONENTS_UI_UX_CASES,
  'Product Tour': PRODUCT_TOUR_UI_UX_CASES,
});
