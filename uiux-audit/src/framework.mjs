import { stableHash } from './core.mjs';

export const FRAMEWORK_VERSION = '2.2';

export const REFERENCES = Object.freeze({
  wcag: {
    id: 'WCAG-2.2',
    label: 'WCAG 2.2',
    url: 'https://www.w3.org/TR/WCAG22/',
    authority: 'W3C Recommendation',
  },
  apg: {
    id: 'WAI-ARIA-APG',
    label: 'WAI-ARIA Authoring Practices Guide',
    url: 'https://www.w3.org/WAI/ARIA/apg/',
    authority: 'W3C informative guidance',
  },
  nielsen: {
    id: 'NNG-10',
    label: 'Nielsen Norman Group: 10 Usability Heuristics',
    url: 'https://www.nngroup.com/articles/ten-usability-heuristics/',
    authority: 'Established usability heuristic',
  },
  webVitals: {
    id: 'CORE-WEB-VITALS',
    label: 'Core Web Vitals',
    url: 'https://web.dev/articles/vitals',
    authority: 'Google web experience guidance',
  },
  axe: {
    id: 'AXE-CORE',
    label: 'axe-core accessibility rules',
    url: 'https://www.deque.com/axe/core-documentation/',
    authority: 'Deque open-source automated accessibility rules',
  },
  cspell: {
    id: 'CSPELL',
    label: 'CSpell local dictionary engine',
    url: 'https://cspell.org/docs/api/cspell-lib',
    authority: 'Deterministic local spelling dictionary',
  },
  owaspHeaders: {
    id: 'OWASP-HTTP-HEADERS',
    label: 'OWASP HTTP Security Response Headers Cheat Sheet',
    url: 'https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html',
    authority: 'OWASP Cheat Sheet Series',
  },
  owaspCsp: {
    id: 'OWASP-CSP',
    label: 'OWASP Content Security Policy Cheat Sheet',
    url: 'https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html',
    authority: 'OWASP Cheat Sheet Series',
  },
  owaspWstg: {
    id: 'OWASP-WSTG',
    label: 'OWASP Web Security Testing Guide',
    url: 'https://owasp.org/www-project-web-security-testing-guide/',
    authority: 'OWASP testing standard',
  },
  mdnCookies: {
    id: 'MDN-SECURE-COOKIES',
    label: 'MDN Secure cookie configuration',
    url: 'https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Cookies',
    authority: 'Mozilla web security guidance',
  },
});

const wcag = (criterion, title, level = 'AA') => ({
  id: 'WCAG-' + criterion,
  label: 'WCAG 2.2 ' + criterion + ' ' + title + ' (' + level + ')',
  url: 'https://www.w3.org/TR/WCAG22/#' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  authority: 'W3C Recommendation',
});

const GUIDANCE = [
  {
    match: /^capture\./,
    impact: 'Without a valid rendered page, every downstream UI/UX conclusion can be false or incomplete.',
    standards: [],
    owner: 'QA / Platform',
    fixSteps: ['Resolve authentication, routing, network, or rendering failures.', 'Repeat every requested viewport and theme capture.', 'Confirm that meaningful content and controls are present before accepting results.'],
    verifySteps: ['Open the audited URL with the recorded authentication state.', 'Repeat the audit with the same profiles.', 'Confirm every requested capture is valid and contains meaningful rendered content.'],
    passCondition: 'Every requested capture is valid; no error, login, or empty page is presented as product coverage.',
  },
  {
    match: /^color\.text-contrast$/,
    impact: 'Low contrast makes content difficult or impossible to read for people with low vision and in adverse display conditions.',
    standards: [wcag('1.4.3', 'Contrast Minimum')],
    owner: 'Design + Frontend',
    fixSteps: ['Use semantic foreground and background tokens.', 'Adjust the color pair until the required ratio is met.', 'Retest default, hover, focus, disabled, error, and selected states.'],
    verifySteps: ['Render the exact element and state from the finding.', 'Measure the final composited foreground and background colors.', 'Compare the ratio with the recorded minimum.'],
    passCondition: 'Normal text is at least 4.5:1 and large text is at least 3:1 in every applicable state.',
  },
  {
    match: /^color\.text-contrast-indeterminate$/,
    impact: 'Text over images, gradients, or unsupported colors may become unreadable in the least-contrasting region.',
    standards: [wcag('1.4.3', 'Contrast Minimum')],
    owner: 'Design + Accessibility',
    fixSteps: ['Inspect the least-contrasting rendered area.', 'Add a scrim, solid surface, text treatment, or different asset when needed.', 'Validate all responsive crops and states.'],
    verifySteps: ['Open the linked screenshot at original size.', 'Sample the least-contrasting background behind the text.', 'Confirm the required ratio across the full glyph area and all responsive crops.'],
    passCondition: 'A human reviewer confirms the text meets the applicable contrast threshold everywhere it is rendered.',
  },
  {
    match: /^color\.placeholder-contrast/,
    impact: 'Low-contrast placeholder text can hide format hints and instructions from people with low vision.',
    standards: [wcag('1.4.3', 'Contrast Minimum')],
    owner: 'Design + Frontend',
    fixSteps: ['Use a semantic placeholder token.', 'Account for placeholder opacity in the final composited color.', 'Keep a persistent programmatic label instead of relying on placeholder text.'],
    verifySteps: ['Render the empty control in every theme.', 'Measure the final composited placeholder and field background.', 'Confirm the applicable text contrast ratio and persistent label.'],
    passCondition: 'Rendered placeholder text meets the applicable 4.5:1 or large-text 3:1 ratio and is not the only label.',
  },
  {
    match: /^color\.(non-text-contrast|link-distinguishability)$/,
    impact: 'Controls or links distinguished only by weak color differences can be difficult to find and understand.',
    standards: [wcag('1.4.1', 'Use of Color', 'A'), wcag('1.4.11', 'Non-text Contrast')],
    owner: 'Design + Accessibility',
    fixSteps: ['Identify the essential boundary, state, or inline-link cue.', 'Use approved colors that reach 3:1 against adjacent colors.', 'Add a non-color cue where color alone communicates meaning.'],
    verifySteps: ['Measure the essential visual cue against every adjacent color.', 'Inspect default, hover, focus, selected, error, and disabled states.', 'Confirm meaning remains available without color.'],
    passCondition: 'Essential component and graphical cues reach 3:1 where required, and color is not the sole means of identifying an action or state.',
  },
  {
    match: /^accessibility\.(control-name|form-label)$/,
    impact: 'Unnamed controls are ambiguous to screen-reader and voice-control users and make form completion error-prone.',
    standards: [wcag('1.3.1', 'Info and Relationships', 'A'), wcag('2.5.3', 'Label in Name', 'A'), wcag('4.1.2', 'Name Role Value', 'A')],
    owner: 'Frontend + Accessibility',
    fixSteps: ['Use a native visible label where possible.', 'Associate the label with the control programmatically.', 'Ensure the accessible name contains the visible control text.'],
    verifySteps: ['Locate the control from the finding.', 'Inspect its computed accessible name and role.', 'Navigate to and operate it with a screen reader and voice-control-compatible name.'],
    passCondition: 'The control exposes an accurate, non-empty accessible name and the visible label is programmatically associated.',
  },
  {
    match: /^accessibility\.image-alt$/,
    impact: 'People who cannot see an informative image lose its purpose or content when a text alternative is absent.',
    standards: [wcag('1.1.1', 'Non-text Content', 'A')],
    owner: 'Content + Frontend',
    fixSteps: ['Decide whether the image is informative, functional, or decorative.', 'Provide concise purpose-equivalent alt text for informative images.', 'Use an empty alt value only for truly decorative images.'],
    verifySteps: ['Inspect the image purpose in context.', 'Disable images or inspect the accessibility tree.', 'Confirm equivalent meaning remains and decorative images are ignored.'],
    passCondition: 'Every image has an appropriate text alternative or an intentional empty alternative when decorative.',
  },
  {
    match: /^accessibility\.(document-language|page-title)$/,
    impact: 'Missing page identity or language makes navigation and pronunciation less reliable for assistive-technology users.',
    standards: [wcag('2.4.2', 'Page Titled', 'A'), wcag('3.1.1', 'Language of Page', 'A')],
    owner: 'Frontend + Content',
    fixSteps: ['Set a concise, task-specific document title.', 'Set the root document language to a valid BCP 47 tag.', 'Update both when route or language changes.'],
    verifySteps: ['Open the exact route directly.', 'Inspect the browser tab title and root language attribute.', 'Navigate between routes and supported languages.'],
    passCondition: 'The page has a descriptive title and a valid primary language that remain accurate after client-side navigation.',
  },
  {
    match: /^structure\./,
    impact: 'Weak landmarks or heading structure makes pages harder to scan visually and with assistive technology.',
    standards: [wcag('1.3.1', 'Info and Relationships', 'A'), wcag('2.4.6', 'Headings and Labels')],
    owner: 'Design + Frontend',
    fixSteps: ['Use one clear page heading.', 'Nest headings by content hierarchy rather than visual size.', 'Use native landmarks for primary page regions.'],
    verifySteps: ['List headings and landmarks in DOM order.', 'Compare the outline with the visible information hierarchy.', 'Navigate the page using screen-reader heading and landmark shortcuts.'],
    passCondition: 'The heading outline and landmarks communicate the same clear structure as the visual layout.',
  },
  {
    match: /^focus\./,
    impact: 'Keyboard users can lose their position or be unable to discover and operate controls.',
    standards: [wcag('2.4.7', 'Focus Visible'), wcag('2.4.11', 'Focus Not Obscured Minimum')],
    owner: 'Design + Frontend',
    fixSteps: ['Provide a persistent, high-contrast focus indicator.', 'Keep focused controls outside sticky or overlay obstructions.', 'Apply the treatment consistently to every interactive component.'],
    verifySteps: ['Start at the top of the page without using a pointer.', 'Move focus to the affected control using the keyboard.', 'Confirm the indicator is visible, unobscured, and remains visible at zoomed layouts.'],
    passCondition: 'Keyboard focus is always visible, distinguishable, and not fully obscured by author-created content.',
  },
  {
    match: /^interaction\.target-size/,
    impact: 'Small or tightly packed targets increase accidental activation, especially for touch and motor-impaired users.',
    standards: [wcag('2.5.8', 'Target Size Minimum')],
    owner: 'Design + Frontend',
    fixSteps: ['Increase the active hit area without changing the visual size when appropriate.', 'Add sufficient spacing between adjacent targets.', 'Check compact, mobile, and zoomed layouts.'],
    verifySteps: ['Measure the active target rectangle.', 'Measure spacing to the nearest interactive target.', 'Repeat at every affected viewport.'],
    passCondition: 'Each target is at least 24 by 24 CSS pixels or satisfies a documented WCAG spacing exception; the configured comfort target is reviewed separately.',
  },
  {
    match: /^(layout\.|responsive\.)/,
    impact: 'Clipped, overlapping, or off-screen content can hide information and prevent task completion on supported devices.',
    standards: [wcag('1.4.10', 'Reflow'), wcag('1.4.12', 'Text Spacing')],
    owner: 'Design + Frontend',
    fixSteps: ['Remove fixed dimensions that block reflow.', 'Wrap content or contain intentional two-dimensional scrolling locally.', 'Retest minimum, maximum, and intermediate widths with representative content.'],
    verifySteps: ['Open every affected viewport from the finding.', 'Inspect the full page for clipping, overlap, and page-level horizontal scrolling.', 'Complete the primary task at the narrowest width and at 200% zoom.'],
    passCondition: 'Meaningful content and controls remain visible and operable without unintended two-dimensional page scrolling.',
  },
  {
    match: /^typography\.font-load-failed$/,
    impact: 'A failed font changes line breaks, hierarchy, brand expression, and sometimes character coverage.',
    standards: [],
    owner: 'Frontend / Platform',
    fixSteps: ['Correct the font URL, preload, MIME type, or CORS policy.', 'Declare an intentional fallback stack with compatible metrics.', 'Verify every required weight and script.'],
    verifySteps: ['Clear the browser cache.', 'Reload the page while recording font requests.', 'Confirm the intended computed family and stable layout after loading.'],
    passCondition: 'Every declared production font loads successfully or falls back intentionally without content loss or disruptive layout shift.',
  },
  {
    match: /^typography\./,
    impact: 'Poor type scale, spacing, or line length reduces comprehension and scan speed.',
    standards: [wcag('1.4.4', 'Resize Text'), wcag('1.4.12', 'Text Spacing')],
    owner: 'Design + Content',
    fixSteps: ['Apply approved typography tokens.', 'Use readable line height and measure.', 'Test real minimum, maximum, and localized content.'],
    verifySteps: ['Inspect the element at 100% and 200% zoom.', 'Apply WCAG text-spacing overrides.', 'Confirm text remains legible, unclipped, and visually hierarchical.'],
    passCondition: 'Text remains readable and unclipped across supported viewports, zoom, content lengths, and languages.',
  },
  {
    match: /^(brand\.|consistency\.)/,
    impact: 'Uncontrolled visual variants increase cognitive load and make the product harder and slower to maintain.',
    standards: [REFERENCES.nielsen],
    owner: 'Design System + Frontend',
    fixSteps: ['Map values to named semantic design tokens.', 'Consolidate accidental variants.', 'Document intentional exceptions and component states.'],
    verifySteps: ['Compare observed values with the approved design system.', 'Inspect repeated components across pages and states.', 'Confirm each remaining variant has a documented purpose.'],
    passCondition: 'Equivalent elements use approved tokens and components; every exception is intentional and documented.',
  },
  {
    match: /^media\./,
    impact: 'Broken, distorted, or low-quality media damages comprehension, credibility, and perceived product quality.',
    standards: [wcag('1.1.1', 'Non-text Content', 'A')],
    owner: 'Frontend + Content',
    fixSteps: ['Repair failed sources and responsive variants.', 'Preserve intrinsic aspect ratio or crop deliberately.', 'Provide density-appropriate assets and a reliable fallback.'],
    verifySteps: ['Reload with cache disabled.', 'Inspect the affected asset at each recorded viewport and device scale.', 'Confirm successful loading, intentional cropping, and adequate sharpness.'],
    passCondition: 'Media loads reliably, remains sharp, and preserves the intended crop or aspect ratio at every supported size.',
  },
  {
    match: /^accessibility\.positive-tabindex$/,
    impact: 'Positive tabindex values create an unexpected focus order that differs from reading and visual order.',
    standards: [wcag('2.4.3', 'Focus Order', 'A')],
    owner: 'Frontend + Accessibility',
    fixSteps: ['Use DOM order to express the intended task order.', 'Remove positive tabindex values.', 'Use roving tabindex only within a recognized composite widget pattern.'],
    verifySteps: ['Move forward and backward through the page with the keyboard.', 'Compare focus order with visual and reading order.', 'Confirm composite widgets follow their documented keyboard pattern.'],
    passCondition: 'Focus follows a logical DOM-based sequence and no ordinary control uses a positive tabindex.',
  },
  {
    match: /^axe\./,
    impact: 'Invalid semantics, relationships, structure, or ARIA can block assistive-technology operation even when the page looks correct.',
    standards: [REFERENCES.wcag, REFERENCES.axe],
    owner: 'Frontend + Accessibility',
    fixSteps: ['Open the linked axe rule guidance.', 'Correct native HTML or ARIA at the recorded selector.', 'Prefer native elements and remove redundant or invalid ARIA.'],
    verifySteps: ['Repeat axe-core on the same page state.', 'Inspect the accessibility tree at the recorded target.', 'Operate the affected component using keyboard and a representative screen reader.'],
    passCondition: 'The recorded axe violation is absent, incomplete rules have a documented human decision, and the affected task remains operable with assistive technology.',
  },
  {
    match: /^content\.(spelling|encoding-corruption|template-placeholder|placeholder-copy|repeated-word|excessive-punctuation|inconsistent-capitalization)/,
    impact: 'Copy defects reduce comprehension, trust, task accuracy, and perceived product quality.',
    standards: [REFERENCES.cspell, REFERENCES.nielsen],
    owner: 'Content Design + Product',
    fixSteps: ['Confirm the intended locale and terminology.', 'Correct the copy or approve a legitimate domain term.', 'Apply the same wording and capitalization across equivalent components.'],
    verifySteps: ['Re-run the local spelling and content checks.', 'Read the corrected copy in its full interaction context.', 'Have a content owner approve meaning, grammar, tone, and terminology.'],
    passCondition: 'No unresolved encoding or template text remains; dictionary exceptions are approved; spelling, grammar, terminology, and punctuation match the content standard.',
  },
  {
    match: /^content\.ambiguous-link$/,
    impact: 'Generic link labels are hard to scan and lose meaning when listed outside surrounding text.',
    standards: [wcag('2.4.4', 'Link Purpose In Context', 'A')],
    owner: 'Content Design',
    fixSteps: ['Replace generic wording with a destination- or action-specific label.', 'Keep repeated labels distinguishable where destinations differ.', 'Preserve concise language.'],
    verifySteps: ['List links without surrounding paragraph text.', 'Read each label in sequence.', 'Confirm its destination or action is understandable in context.'],
    passCondition: 'Each link purpose is understandable from its label and available programmatic context.',
  },
  {
    match: /^security\.transport\./,
    impact: 'Unencrypted pages, form destinations, or subresources can expose or alter user data in transit and undermine every higher-level control.',
    standards: [REFERENCES.owaspHeaders, REFERENCES.owaspWstg],
    owner: 'Platform + Security',
    fixSteps: ['Serve every production route and dependency over HTTPS.', 'Redirect HTTP entry points and remove mixed-content references.', 'Enable HSTS after validating the complete HTTPS scope.'],
    verifySteps: ['Open the exact page in a clean browser context.', 'Inspect the main document, form actions, and all network requests.', 'Confirm no production page or dependency uses unencrypted HTTP.'],
    passCondition: 'The page, sensitive forms, redirects, and every requested resource use approved secure transport with no mixed content.',
  },
  {
    match: /^security\.(header|csp)\./,
    impact: 'Missing or permissive browser security policies increase exposure to script injection, clickjacking, MIME confusion, referrer leakage, and unnecessary device capabilities.',
    standards: [REFERENCES.owaspHeaders, REFERENCES.owaspCsp],
    owner: 'Platform + Security + Frontend',
    fixSteps: ['Define headers centrally at the application gateway or server.', 'Roll CSP out through report-only monitoring before enforcement.', 'Use the narrowest policy compatible with documented product behavior.'],
    verifySteps: ['Request the exact page without intermediary caching.', 'Inspect the final document response headers and effective browser policy.', 'Exercise required integrations and confirm the policy blocks an intentionally disallowed test resource in an authorized environment.'],
    passCondition: 'Required response headers are explicit and CSP is enforced, least-privilege, operationally tested, and free of unjustified broad script execution.',
  },
  {
    match: /^security\.cookie\./,
    impact: 'Weak cookie scope or attributes can expose session state to scripts, cleartext transport, cross-site requests, or less-trusted subdomains.',
    standards: [REFERENCES.mdnCookies, REFERENCES.owaspWstg],
    owner: 'Backend + Security',
    fixSteps: ['Classify each cookie by purpose and sensitivity.', 'Apply Secure, HttpOnly, SameSite, host/path scope, expiry, and prefixes according to that purpose.', 'Remove obsolete cookies and broad domain scope.'],
    verifySteps: ['Clear site data and repeat the workflow that creates each cookie.', 'Inspect every Set-Cookie response without copying cookie values into evidence.', 'Confirm browser acceptance and required cross-site behavior.'],
    passCondition: 'Every cookie has the minimum transport, script-access, cross-site, scope, lifetime, and prefix privileges required for its documented purpose.',
  },
  {
    match: /^security\.(form|dom|resource|embed)\./,
    impact: 'Unsafe client-side destinations and third-party execution boundaries can leak submitted data or expand the impact of a compromised dependency.',
    standards: [REFERENCES.owaspCsp, REFERENCES.owaspWstg],
    owner: 'Frontend + Security',
    fixSteps: ['Use HTTPS same-origin destinations by default.', 'Constrain external scripts, styles, frames, and forms with integrity, sandbox, and CSP controls.', 'Document and periodically review every required exception.'],
    verifySteps: ['Inspect the rendered DOM and resolved destinations.', 'Review each external origin and its business owner.', 'Retest navigation, submission, embeds, and dependency failure behavior.'],
    passCondition: 'Client-side trust boundaries are explicit, least-privilege, HTTPS-only, and every external dependency has an approved protection or exception.',
  },
  {
    match: /^security\.(cache|privacy|disclosure)\./,
    impact: 'Sensitive URLs, cached pages, or technology disclosures can expose credentials, personal data, or useful reconnaissance information.',
    standards: [REFERENCES.owaspHeaders, REFERENCES.owaspWstg],
    owner: 'Platform + Security + Privacy',
    fixSteps: ['Keep secrets and credentials out of URLs and audit artifacts.', 'Prevent storage of sensitive responses.', 'Remove unnecessary server and framework disclosures.'],
    verifySteps: ['Repeat the sensitive workflow in a clean browser.', 'Inspect URL history, cache behavior, response headers, logs, and generated audit artifacts.', 'Confirm no secret values were persisted by the audit.'],
    passCondition: 'Sensitive data is absent from URLs and evidence, protected pages are not stored, and unnecessary technology disclosure is removed.',
  },
];

export function guidanceForRule(ruleId) {
  const match = GUIDANCE.find((entry) => entry.match.test(String(ruleId || '')));
  return match ? {
    impact: match.impact,
    standards: match.standards.map((item) => ({ ...item })),
    owner: match.owner,
    fixSteps: [...match.fixSteps],
    verifySteps: [...match.verifySteps],
    passCondition: match.passCondition,
  } : {
    impact: 'The finding may reduce clarity, consistency, accessibility, or task success for affected users.',
    standards: [],
    owner: 'Design + Engineering',
    fixSteps: ['Review the observed and expected evidence.', 'Apply the smallest design-system-aligned correction.', 'Retest the exact state and affected variants.'],
    verifySteps: ['Reproduce the finding at the recorded location.', 'Apply the same measurement or human review method.', 'Confirm the expected result is met without regression.'],
    passCondition: 'The recorded expected result is met at every affected location and no related regression is introduced.',
  };
}

export function priorityForIssue(issue = {}) {
  const severity = String(issue.severity || 'minor').toLowerCase();
  const objective = String(issue.class || '').toLowerCase() === 'objective' || String(issue.status || '').toLowerCase() === 'fail';
  if (severity === 'critical') return 'P0';
  if (severity === 'major' && objective) return 'P1';
  if (severity === 'major' || (severity === 'minor' && objective)) return 'P2';
  return 'P3';
}

const CHECKS = [
  { id: 'CAP-001', pillar: 'Evidence quality', title: 'Validate every requested capture', method: 'automated', coverageKey: 'captures', rules: [/^capture\./], standard: [], applies: 'always', pass: 'Every requested page state renders meaningful product content.' },
  { id: 'VIS-001', pillar: 'Color and contrast', title: 'Verify readable text contrast', method: 'automated', coverageKey: 'contrast', rules: [/^color\.text-contrast/], standard: [wcag('1.4.3', 'Contrast Minimum')], applies: 'text', pass: 'All measurable text meets its WCAG contrast threshold and complex backgrounds receive human review.' },
  { id: 'VIS-005', pillar: 'Color and contrast', title: 'Verify placeholder text contrast after opacity compositing', method: 'automated', coverageKey: 'placeholderContrast', rules: [/^color\.placeholder-contrast/], standard: [wcag('1.4.3', 'Contrast Minimum')], applies: 'forms', pass: 'Visible placeholder text meets the applicable text contrast threshold in every captured theme.' },
  { id: 'VIS-006', pillar: 'Color and contrast', title: 'Review control boundaries and inline-link color cues', method: 'hybrid', coverageKey: 'nonTextContrast', rules: [/^color\.(non-text-contrast|link-distinguishability)/], standard: [wcag('1.4.1', 'Use of Color', 'A'), wcag('1.4.11', 'Non-text Contrast')], applies: 'interactive', pass: 'Essential visual cues meet 3:1 where applicable and color is not the only distinguishing signal.' },
  { id: 'VIS-002', pillar: 'Typography', title: 'Review type scale, line height, measure, and font rendering', method: 'hybrid', coverageKey: 'fonts', rules: [/^typography\./], standard: [wcag('1.4.4', 'Resize Text'), wcag('1.4.12', 'Text Spacing')], applies: 'text', pass: 'Type is legible, hierarchical, stable, and resilient to zoom and spacing overrides.' },
  { id: 'VIS-003', pillar: 'Design system', title: 'Check color, type, spacing, radius, shadow, and component tokens', method: 'hybrid', rules: [/^(brand|consistency)\./], standard: [REFERENCES.nielsen], applies: 'always', pass: 'Repeated components use approved semantic tokens and intentional variants.' },
  { id: 'VIS-004', pillar: 'Visual hierarchy', title: 'Confirm clear hierarchy, grouping, alignment, and primary action', method: 'manual', rules: [], standard: [REFERENCES.nielsen], applies: 'always', pass: 'A new user can identify page purpose, context, content groups, and primary action at a glance.' },
  { id: 'LAY-001', pillar: 'Layout and reflow', title: 'Prevent clipping, overlap, and off-screen content', method: 'automated', coverageKey: 'clipping', rules: [/^layout\./], standard: [wcag('1.4.10', 'Reflow')], applies: 'always', pass: 'Meaningful content remains visible and controls remain operable at every tested size.' },
  { id: 'LAY-002', pillar: 'Responsive design', title: 'Verify responsive reflow across and between breakpoints', method: 'hybrid', rules: [/^responsive\./, /^layout\.horizontal-overflow/], standard: [wcag('1.4.10', 'Reflow')], applies: 'multiViewport', pass: 'The layout adapts without unintended page-level horizontal scrolling or lost actions.' },
  { id: 'LAY-003', pillar: 'Responsive design', title: 'Verify zoom, orientation, and text-spacing resilience', method: 'manual', rules: [], standard: [wcag('1.3.4', 'Orientation'), wcag('1.4.4', 'Resize Text'), wcag('1.4.12', 'Text Spacing')], applies: 'always', pass: 'The primary task remains usable at 200% zoom, reflows at 400%, and survives text-spacing overrides.' },
  { id: 'INT-001', pillar: 'Interaction', title: 'Verify target size and target separation', method: 'automated', coverageKey: 'targetSize', rules: [/^interaction\.target-size/], standard: [wcag('2.5.8', 'Target Size Minimum')], applies: 'interactive', pass: 'Targets meet 24px minimum or a valid spacing exception; 44px comfort guidance is reviewed separately.' },
  { id: 'INT-002', pillar: 'Interaction', title: 'Verify visible and unobscured keyboard focus', method: 'automated', coverageKey: 'focus', rules: [/^focus\./], standard: [wcag('2.4.7', 'Focus Visible'), wcag('2.4.11', 'Focus Not Obscured Minimum')], applies: 'interactive', pass: 'Every sampled control shows visible, unobscured focus; unsampled controls remain clearly reported.' },
  { id: 'INT-003', pillar: 'Interaction', title: 'Review hover, active, selected, disabled, busy, and success feedback', method: 'manual', rules: [], standard: [REFERENCES.nielsen], applies: 'interactive', pass: 'Every applicable state is distinct, consistent, timely, and does not shift layout unexpectedly.' },
  { id: 'A11Y-001', pillar: 'Accessibility semantics', title: 'Verify names for controls and links', method: 'automated', coverageKey: 'accessibleNames', rules: [/^accessibility\.control-name/], standard: [wcag('4.1.2', 'Name Role Value', 'A')], applies: 'interactive', pass: 'Every interactive element exposes an accurate non-empty accessible name.' },
  { id: 'A11Y-002', pillar: 'Accessibility semantics', title: 'Verify labels and instructions for form controls', method: 'automated', coverageKey: 'formLabels', rules: [/^accessibility\.form-label/], standard: [wcag('1.3.1', 'Info and Relationships', 'A'), wcag('3.3.2', 'Labels or Instructions', 'A')], applies: 'forms', pass: 'Every form control has a persistent, programmatically associated label and necessary instruction.' },
  { id: 'A11Y-003', pillar: 'Accessibility semantics', title: 'Verify text alternatives for images', method: 'automated', coverageKey: 'alternativeText', rules: [/^accessibility\.image-alt/], standard: [wcag('1.1.1', 'Non-text Content', 'A')], applies: 'images', pass: 'Every image has a purpose-appropriate alternative, including intentional empty alt for decoration.' },
  { id: 'A11Y-004', pillar: 'Accessibility structure', title: 'Verify title, language, headings, and landmarks', method: 'hybrid', coverageKey: 'documentSemantics', rules: [/^(accessibility\.(page-title|document-language)|structure\.)/], standard: [wcag('1.3.1', 'Info and Relationships', 'A'), wcag('2.4.2', 'Page Titled', 'A'), wcag('3.1.1', 'Language of Page', 'A')], applies: 'always', pass: 'Document metadata and semantic outline describe the same page structure visible on screen.' },
  { id: 'A11Y-005', pillar: 'Keyboard and assistive technology', title: 'Complete the primary flow using only a keyboard', method: 'manual', rules: [/^accessibility\.positive-tabindex/], standard: [wcag('2.1.1', 'Keyboard', 'A'), wcag('2.1.2', 'No Keyboard Trap', 'A'), wcag('2.4.3', 'Focus Order', 'A')], applies: 'interactive', pass: 'The complete task works with logical focus order, no trap, and correct focus restoration.' },
  { id: 'A11Y-006', pillar: 'Keyboard and assistive technology', title: 'Verify screen-reader reading order, names, roles, values, and announcements', method: 'manual', rules: [], standard: [REFERENCES.wcag, REFERENCES.apg], applies: 'interactive', pass: 'A screen-reader user can understand structure, operate controls, and hear important state changes.' },
  { id: 'A11Y-007', pillar: 'Accessibility display modes', title: 'Verify forced colors, high contrast, color independence, and reduced motion', method: 'manual', rules: [], standard: [wcag('1.4.1', 'Use of Color', 'A'), wcag('2.3.3', 'Animation from Interactions', 'AAA')], applies: 'always', pass: 'Meaning and operation remain intact without color, with forced colors, and with reduced motion.' },
  { id: 'A11Y-008', pillar: 'Accessibility semantics', title: 'Run the broader axe-core WCAG and ARIA ruleset', method: 'hybrid', coverageKey: 'accessibilityEngine', rules: [/^axe\./], standard: [REFERENCES.wcag, REFERENCES.axe], applies: 'always', pass: 'All executed standards-backed axe rules pass and every incomplete result has a documented specialist decision.' },
  { id: 'NAV-001', pillar: 'Navigation and wayfinding', title: 'Confirm location, navigation consistency, back behavior, and deep links', method: 'manual', rules: [], standard: [REFERENCES.nielsen], applies: 'navigation', pass: 'Users always know where they are, where they can go, and can recover from navigation changes.' },
  { id: 'FORM-001', pillar: 'Forms and data entry', title: 'Review instructions, defaults, formats, autocomplete, and input purpose', method: 'manual', rules: [], standard: [wcag('1.3.5', 'Identify Input Purpose'), wcag('3.3.2', 'Labels or Instructions', 'A')], applies: 'forms', pass: 'Users know what to enter, why it is needed, the accepted format, and can use appropriate browser assistance.' },
  { id: 'FORM-002', pillar: 'Forms and data entry', title: 'Verify validation, error summary, retained input, and recovery', method: 'manual', rules: [], standard: [wcag('3.3.1', 'Error Identification', 'A'), wcag('3.3.3', 'Error Suggestion')], applies: 'forms', pass: 'Errors are specific, associated, focused, recoverable, and do not discard safe user input.' },
  { id: 'FORM-003', pillar: 'Forms and data entry', title: 'Verify error prevention, confirmation, cancel, undo, and duplicate-submit protection', method: 'manual', rules: [], standard: [wcag('3.3.4', 'Error Prevention Legal Financial Data'), REFERENCES.nielsen], applies: 'forms', pass: 'High-impact mistakes are prevented or reversible and repeated submission cannot create duplicate work.' },
  { id: 'CONTENT-001', pillar: 'Content design', title: 'Review labels, terminology, instructions, and link purpose', method: 'hybrid', rules: [/^content\.(ambiguous-link|inconsistent-capitalization)$/], standard: [REFERENCES.nielsen, wcag('2.4.4', 'Link Purpose In Context', 'A')], applies: 'text', pass: 'Language is concise, familiar, specific, and understandable without internal product knowledge.' },
  { id: 'CONTENT-003', pillar: 'Content quality', title: 'Check visible English copy with a local dictionary', method: 'hybrid', coverageKey: 'spelling', rules: [/^content\.spelling/], standard: [REFERENCES.cspell], applies: 'text', pass: 'Every flagged word is corrected or explicitly approved for the configured locale and product vocabulary.' },
  { id: 'CONTENT-004', pillar: 'Content quality', title: 'Detect encoding, template, placeholder, repetition, punctuation, and capitalization defects', method: 'hybrid', coverageKey: 'contentQuality', rules: [/^content\.(encoding-corruption|template-placeholder|placeholder-copy|repeated-word|excessive-punctuation|inconsistent-capitalization)/], standard: [REFERENCES.nielsen], applies: 'text', pass: 'Production copy contains no leaked runtime values or encoding corruption, and review signals are resolved by a content owner.' },
  { id: 'CONTENT-002', pillar: 'Content states', title: 'Review loading, empty, partial, error, success, and permission states', method: 'manual', rules: [], standard: [REFERENCES.nielsen], applies: 'always', pass: 'Every state is distinguishable, explains what happened, and offers a safe next action.' },
  { id: 'MEDIA-001', pillar: 'Images and media', title: 'Verify asset loading, aspect ratio, crop, density, and visual purpose', method: 'hybrid', coverageKey: 'images', rules: [/^media\./], standard: [wcag('1.1.1', 'Non-text Content', 'A')], applies: 'images', pass: 'Media is available, sharp, intentional, and does not obscure content at any supported size.' },
  { id: 'MEDIA-002', pillar: 'Images and media', title: 'Verify captions, transcripts, controls, autoplay, and motion alternatives', method: 'manual', rules: [], standard: [wcag('1.2.2', 'Captions Prerecorded', 'A'), wcag('1.2.5', 'Audio Description Prerecorded'), wcag('2.2.2', 'Pause Stop Hide', 'A')], applies: 'media', pass: 'Time-based media is perceivable, controllable, keyboard-operable, and does not surprise users.' },
  { id: 'COMP-001', pillar: 'Component behavior', title: 'Verify dialogs, menus, tabs, disclosures, and composite widgets against a known pattern', method: 'manual', rules: [], standard: [REFERENCES.apg], applies: 'complexWidgets', pass: 'Each complex widget exposes correct semantics, focus management, and conventional keyboard behavior.' },
  { id: 'DATA-001', pillar: 'Data presentation', title: 'Review tables, charts, density, sorting, filtering, and small-screen alternatives', method: 'manual', rules: [], standard: [wcag('1.3.1', 'Info and Relationships', 'A')], applies: 'dataPresentation', pass: 'Users can understand, navigate, compare, and act on data with visual and non-visual access.' },
  { id: 'I18N-001', pillar: 'Internationalization', title: 'Verify localization, expansion, scripts, formats, and right-to-left layout', method: 'manual', rules: [], standard: [REFERENCES.wcag], applies: 'always', pass: 'Supported locales preserve meaning, layout, reading order, input, and local date/number conventions.' },
  { id: 'PERF-001', pillar: 'Perceived performance', title: 'Measure LCP, INP, and CLS using field and lab evidence', method: 'manual', rules: [], standard: [REFERENCES.webVitals], applies: 'always', pass: 'At the 75th percentile, LCP is at most 2.5s, INP at most 200ms, and CLS at most 0.1 for representative users.' },
  { id: 'PERF-002', pillar: 'Perceived performance', title: 'Review slow-network, delayed-action, retry, and offline behavior', method: 'manual', rules: [], standard: [REFERENCES.nielsen], applies: 'always', pass: 'The interface responds immediately, preserves user work, avoids duplicate actions, and offers a clear recovery path.' },
  { id: 'TRUST-001', pillar: 'Trust and safety', title: 'Review consent, permissions, sensitive-data disclosure, and destructive consequences', method: 'manual', rules: [], standard: [REFERENCES.nielsen], applies: 'sensitive', pass: 'Users understand data use and consequences before committing, and sensitive information is not exposed unnecessarily.' },
  { id: 'SEC-001', pillar: 'Transport security', title: 'Verify HTTPS and eliminate mixed content', method: 'automated', coverageKey: 'securityTransport', rules: [/^security\.transport\./], standard: [REFERENCES.owaspHeaders, REFERENCES.owaspWstg], applies: 'always', pass: 'Production pages, form destinations, and subresources use HTTPS with no mixed content.' },
  { id: 'SEC-002', pillar: 'Response security headers', title: 'Review browser security response headers', method: 'hybrid', coverageKey: 'securityHeaders', rules: [/^security\.header\./], standard: [REFERENCES.owaspHeaders], applies: 'always', pass: 'Transport, MIME, framing, referrer, feature, encoding, and legacy-header policies match the approved deployment profile.' },
  { id: 'SEC-003', pillar: 'Content Security Policy', title: 'Verify an enforced least-privilege CSP', method: 'hybrid', coverageKey: 'securityCsp', rules: [/^security\.csp\./], standard: [REFERENCES.owaspCsp], applies: 'always', pass: 'An enforced CSP restricts script, object, base, frame, and form destinations without unjustified unsafe execution.' },
  { id: 'SEC-004', pillar: 'Cookie security', title: 'Verify cookie transport, script, cross-site, and scope controls', method: 'hybrid', coverageKey: 'securityCookies', rules: [/^security\.cookie\./], standard: [REFERENCES.mdnCookies, REFERENCES.owaspWstg], applies: 'cookies', pass: 'Each observed cookie uses attributes and scope appropriate to its documented purpose, and prefix contracts are valid.' },
  { id: 'SEC-005', pillar: 'Client trust boundaries', title: 'Review forms, navigation, external resources, and embeds', method: 'hybrid', coverageKey: 'securityDom', rules: [/^security\.(form|dom|resource|embed)\./], standard: [REFERENCES.owaspCsp, REFERENCES.owaspWstg], applies: 'always', pass: 'Every client-side destination and external execution boundary is HTTPS-only, approved, and least-privilege.' },
  { id: 'SEC-006', pillar: 'Sensitive data protection', title: 'Review caching, URL leakage, evidence redaction, and disclosure', method: 'hybrid', coverageKey: 'securityPrivacy', rules: [/^security\.(cache|privacy|disclosure)\./], standard: [REFERENCES.owaspHeaders, REFERENCES.owaspWstg], applies: 'always', pass: 'Sensitive values are absent from URLs and audit evidence, protected pages are not stored, and unnecessary platform disclosure is minimized.' },
  { id: 'SEC-007', pillar: 'Active application security', title: 'Test authentication and session lifecycle', method: 'manual', rules: [], standard: [REFERENCES.owaspWstg], applies: 'sensitive', pass: 'Authorized tests confirm strong authentication, rotation, timeout, logout invalidation, recovery, and resistance to fixation and credential abuse.' },
  { id: 'SEC-008', pillar: 'Active application security', title: 'Test authorization, object access, and role boundaries', method: 'manual', rules: [], standard: [REFERENCES.owaspWstg], applies: 'sensitive', pass: 'Server-side authorization denies horizontal and vertical privilege abuse for every role, object, method, and workflow state.' },
  { id: 'SEC-009', pillar: 'Active application security', title: 'Test input, output, upload, and API defenses', method: 'manual', rules: [], standard: [REFERENCES.owaspWstg], applies: 'forms', pass: 'Authorized negative tests verify server-side validation, context-safe output, injection resistance, upload controls, API contracts, and safe error handling.' },
  { id: 'SEC-010', pillar: 'Active application security', title: 'Test CSRF, replay, automation abuse, and business logic', method: 'manual', rules: [], standard: [REFERENCES.owaspWstg], applies: 'forms', pass: 'State-changing actions resist cross-site submission, replay, duplicate execution, race conditions, enumeration, and rate-limit abuse.' },
  { id: 'UX-001', pillar: 'Task usability', title: 'Run the primary task with representative users', method: 'manual', rules: [], standard: [REFERENCES.nielsen], applies: 'always', pass: 'Representative users complete the task accurately without avoidable hesitation, assistance, or recovery.' },
  { id: 'UX-002', pillar: 'Task usability', title: 'Review learnability, efficiency, recognition, shortcuts, help, and return use', method: 'manual', rules: [], standard: [REFERENCES.nielsen], applies: 'always', pass: 'New and returning users can work efficiently without memorizing hidden information.' },
  { id: 'COMPAT-001', pillar: 'Compatibility', title: 'Verify supported browsers, operating systems, input modes, and real devices', method: 'manual', rules: [], standard: [], applies: 'always', pass: 'The supported matrix preserves layout, content, interaction, and task completion; unexecuted profiles remain untested.' },
];

const array = (value) => Array.isArray(value) ? value : [];

export function detectFeatures(audit = {}) {
  const captures = array(audit.captures).filter((capture) => capture?.status !== 'invalid');
  const elements = captures.flatMap((capture) => array(capture.elements));
  const roles = new Set(elements.map((element) => String(element?.role || '').toLowerCase()).filter(Boolean));
  const tags = new Set(elements.map((element) => String(element?.tag || '').toLowerCase()).filter(Boolean));
  const text = elements.map((element) => String(element?.text || element?.accessibleName || '')).join(' ').toLowerCase();
  const metric = (name) => captures.reduce((total, capture) => total + (Number(capture?.metrics?.[name]) || 0), 0);
  const viewports = new Set(captures.map((capture) => capture?.viewport?.name || (capture?.viewport?.width + 'x' + capture?.viewport?.height)));
  const themes = new Set(captures.map((capture) => capture?.theme).filter(Boolean));
  const checkpoints = new Set(captures.map((capture) => capture?.checkpoint).filter(Boolean));
  const securityForms = captures.reduce((total, capture) => total + array(capture?.security?.dom?.forms).length, 0);
  const forms = metric('forms') > 0 || securityForms > 0 || ['input', 'select', 'textarea'].some((tag) => tags.has(tag));
  const navigation = metric('navigationLandmarks') > 0 || tags.has('nav') || roles.has('navigation');
  const media = metric('video') > 0 || metric('audio') > 0 || tags.has('video') || tags.has('audio');
  const dataPresentation = metric('tables') > 0 || metric('canvas') > 0 || tags.has('table') || roles.has('grid') || roles.has('table');
  const complexWidgets = ['dialog', 'menu', 'menubar', 'tab', 'tablist', 'tree', 'treegrid', 'grid', 'listbox', 'combobox'].some((role) => roles.has(role));
  const sensitive = forms || captures.some((capture) => Number(capture?.security?.dom?.sensitiveInputCount) > 0) || Boolean(audit?.runtime?.authenticatedState) || /delete|remove|pay|purchase|submit|upload|password|account/.test(text);
  const securityEvidence = captures.some((capture) => capture?.security?.status === 'complete');
  const cookies = captures.some((capture) => Number(capture?.security?.response?.cookies?.count) > 0);
  return {
    always: true,
    text: metric('textElements') > 0 || elements.some((element) => element?.text),
    interactive: metric('interactiveElements') > 0 || elements.some((element) => element?.interactive),
    forms,
    images: metric('images') > 0 || tags.has('img'),
    media,
    navigation,
    multiViewport: viewports.size > 1,
    multiTheme: themes.size > 1,
    multiState: checkpoints.size > 1 || Boolean(audit?.flow),
    complexWidgets,
    dataPresentation,
    sensitive,
    fileUpload: elements.some((element) => element?.inputType === 'file'),
    destructive: /delete|remove|discard|revoke|cancel subscription/.test(text),
    search: elements.some((element) => element?.inputType === 'search' || /search/.test(String(element?.accessibleName || '').toLowerCase())),
    securityEvidence,
    cookies,
  };
}

function issueMatches(check, issue) {
  return array(check.rules).some((pattern) => pattern.test(String(issue?.ruleId || '')));
}

function coverageResult(check, coverage) {
  if (!check.coverageKey) return null;
  const value = coverage?.checks?.[check.coverageKey] ?? coverage?.[check.coverageKey];
  if (!value || typeof value !== 'object') return { status: 'not-tested', evidence: value ?? null };
  if (check.coverageKey === 'captures') {
    if (!Number(value.total)) return { status: 'blocked', evidence: value };
    if (Number(value.invalid) > 0 || Number(value.valid) < Number(value.total)) return { status: 'fail', evidence: value };
    return { status: 'pass', evidence: value };
  }
  if (Number(value.failed) > 0) return { status: 'fail', evidence: value };
  if (Number(value.review) > 0 || Number(value.indeterminate) > 0 || Number(value.untested) > 0) return { status: 'review', evidence: value };
  if (Number(value.tested) > 0) return { status: 'pass', evidence: value };
  if (Number(value.eligible) === 0) return { status: 'not-applicable', evidence: value };
  return { status: 'not-tested', evidence: value };
}

const PILLAR_VERIFICATION = {
  'Evidence quality': [
    'Open every requested route, state, viewport, and theme.',
    'Confirm that product content is rendered instead of an error, login, or empty shell.',
    'Record a screenshot and valid capture status for every requested profile.',
  ],
  'Color and contrast': [
    'Inspect default and interactive text states at every captured theme.',
    'Measure the final composited foreground and background colors.',
    'Manually sample text over images, gradients, and changing media.',
  ],
  Typography: [
    'Inspect the computed family, size, weight, line height, and line length.',
    'Repeat at 200% zoom and with WCAG text-spacing overrides.',
    'Use short, long, localized, and missing content.',
  ],
  'Design system': [
    'Compare the observed token inventory with the approved design system.',
    'Compare equivalent components across states and pages.',
    'Document each intentional exception and remove accidental variants.',
  ],
  'Visual hierarchy': [
    'View the page for five seconds without interacting.',
    'Identify the page purpose, current context, primary content, and primary action.',
    'Check alignment, whitespace, grouping, emphasis, and destructive-action treatment.',
  ],
  'Layout and reflow': [
    'Inspect the full page at every configured viewport.',
    'Resize through widths between configured breakpoints.',
    'Check clipping, overlap, off-screen controls, and page-level horizontal scrolling.',
  ],
  'Responsive design': [
    'Test portrait and landscape layouts at minimum and maximum supported widths.',
    'Repeat at 200% browser zoom and verify reflow at 400%.',
    'Complete the primary task at the narrowest supported layout.',
  ],
  Interaction: [
    'Operate every distinct control with pointer, touch where applicable, and keyboard.',
    'Inspect default, hover, focus, active, selected, disabled, busy, success, and error states.',
    'Measure active target rectangles and spacing at compact layouts.',
  ],
  'Accessibility semantics': [
    'Inspect the accessibility tree for each distinct control and image.',
    'Compare exposed names, roles, values, labels, and alternatives with the visible UI.',
    'Operate representative controls using a screen reader.',
  ],
  'Accessibility structure': [
    'List the page title, language, headings, and landmarks in DOM order.',
    'Compare the semantic outline with the visual information hierarchy.',
    'Navigate by headings and landmarks with a screen reader.',
  ],
  'Keyboard and assistive technology': [
    'Complete the primary task without a pointer.',
    'Move focus forward and backward and operate each complex widget.',
    'Verify focus order, announcements, escape behavior, and focus restoration.',
  ],
  'Accessibility display modes': [
    'Enable forced-colors or high-contrast mode.',
    'Review the interface without color and with a common color-vision simulation.',
    'Enable reduced motion and repeat animated interactions.',
  ],
  'Navigation and wayfinding': [
    'Enter the page through a deep link and through primary navigation.',
    'Use browser back, forward, refresh, and an interrupted return path.',
    'Confirm current location, selected navigation, and retained state remain clear.',
  ],
  'Forms and data entry': [
    'Complete the form with valid, invalid, boundary, and interrupted input.',
    'Review labels, instructions, formats, validation timing, focus, and retained values.',
    'Attempt duplicate submission, cancellation, and recovery from a request failure.',
  ],
  'Content design': [
    'Read labels, instructions, links, errors, and actions without internal product context.',
    'Replace content with minimum, maximum, missing, and localized variants.',
    'Confirm wording remains specific, concise, and actionable.',
  ],
  'Content states': [
    'Trigger loading, empty, partial, error, success, and permission states.',
    'Distinguish each state by heading, explanation, and next action.',
    'Recover and confirm safe user input and context are retained.',
  ],
  'Images and media': [
    'Load media with cache disabled at standard and high pixel density.',
    'Inspect purpose, alternative, sharpness, aspect ratio, crop, captions, and controls.',
    'Repeat with slow network, keyboard, and reduced motion.',
  ],
  'Component behavior': [
    'Identify the closest WAI-ARIA APG or native platform pattern.',
    'Test documented keys, names, roles, values, focus entry, and focus exit.',
    'Repeat with a screen reader and without a pointer.',
  ],
  'Data presentation': [
    'Read headers, relationships, labels, legends, units, sorting, and filtering.',
    'Navigate the data with keyboard and screen reader.',
    'Verify a small-screen and non-visual equivalent for dense or graphical data.',
  ],
  Internationalization: [
    'Switch to every supported locale and representative long-string locale.',
    'Test local dates, numbers, currency, names, addresses, and input methods.',
    'Test a right-to-left locale and mixed-direction content where supported.',
  ],
  'Perceived performance': [
    'Measure representative lab runs on constrained mobile hardware and network.',
    'Review field data at the 75th percentile where available.',
    'Exercise delayed actions, retry, offline, and duplicate-input protection.',
  ],
  'Transport security': [
    'Open the final production-equivalent URL from a clean browser context.',
    'Inspect redirects, form actions, DOM resource URLs, and network requests.',
    'Confirm HTTPS is used throughout and no mixed content is requested or declared.',
  ],
  'Response security headers': [
    'Inspect the final main-document response after all redirects.',
    'Compare each security header with the approved environment-specific policy.',
    'Retest with cache disabled and confirm edge, application, and error responses agree.',
  ],
  'Content Security Policy': [
    'Review both enforced and report-only CSP delivery.',
    'Inspect effective script, object, base, frame, and form restrictions without copying nonces or hashes.',
    'Exercise approved integrations and a safe disallowed-resource test in an authorized environment.',
  ],
  'Cookie security': [
    'Clear site data and repeat each workflow that sets a cookie.',
    'Inspect cookie attributes and scope without recording names or values in shared evidence.',
    'Verify login, logout, expiry, cross-site flows, and prefix enforcement in the browser.',
  ],
  'Client trust boundaries': [
    'List resolved form, script, stylesheet, frame, base, and navigation destinations.',
    'Confirm each external origin is approved and protected by appropriate CSP, integrity, or sandbox controls.',
    'Exercise failure and recovery without sending real secrets to test destinations.',
  ],
  'Sensitive data protection': [
    'Inspect URLs, history, cache behavior, response metadata, logs, screenshots, and exported audit files.',
    'Confirm credentials, tokens, cookie values, personal data, and CSP secrets are absent or redacted.',
    'Verify sensitive responses use an approved no-store policy and technology disclosure is minimized.',
  ],
  'Active application security': [
    'Obtain explicit authorization, accounts for every role, isolated test data, and agreed rate limits.',
    'Execute the applicable OWASP WSTG authentication, authorization, session, input, CSRF, API, upload, and business-logic tests.',
    'Record requests and server-observable outcomes with secrets redacted; never infer a pass from DOM evidence.',
  ],
  'Trust and safety': [
    'Review permissions, consent, sensitive fields, destructive actions, and external handoffs.',
    'Confirm consequences and data use are explained before commitment.',
    'Verify cancel, undo, session privacy, and safe redaction in evidence.',
  ],
  'Task usability': [
    'Give representative users an outcome without explaining the interface.',
    'Record completion, time, errors, hesitations, reversals, and requests for help.',
    'Repeat with a returning or expert user and review efficiency mechanisms.',
  ],
  Compatibility: [
    'Run the supported browser, operating-system, device, viewport, and input matrix.',
    'Repeat the primary task in every requested profile.',
    'Record unexecuted profiles as untested rather than passed.',
  ],
};

function verificationFor(check) {
  return [...(PILLAR_VERIFICATION[check.pillar] || [
    'Open the audited state with representative content.',
    'Perform the stated check using the linked evidence and standard.',
    'Record pass, fail, blocked, or not-applicable with supporting evidence.',
  ])];
}

export function buildFrameworkAssessment(audit = {}) {
  const issues = array(audit.issues);
  const features = detectFeatures(audit);
  const validCaptures = Number(audit?.coverage?.captures?.valid) || 0;
  const checks = CHECKS.map((check) => {
    if (!features[check.applies]) {
      return { ...check, standards: check.standard, verificationSteps: verificationFor(check), status: 'not-applicable', relatedIssueIds: [], evidence: null };
    }
    const related = issues.filter((issue) => issueMatches(check, issue));
    const failures = related.filter((issue) => issue?.status === 'fail' || issue?.class === 'objective');
    const reviews = related.filter((issue) => issue?.status === 'review' || issue?.class === 'heuristic');
    let status;
    let evidence = null;
    if (!validCaptures && check.id !== 'CAP-001') status = 'blocked';
    else if (failures.length) status = 'fail';
    else if (reviews.length) status = 'review';
    else if (check.method === 'manual') status = 'manual';
    else {
      const result = coverageResult(check, audit.coverage);
      status = result?.status || (check.method === 'hybrid' ? 'manual' : 'not-tested');
      evidence = result?.evidence ?? null;
      if (check.method === 'hybrid' && status === 'pass') status = 'manual';
    }
    return {
      id: check.id,
      pillar: check.pillar,
      title: check.title,
      method: check.method,
      status,
      appliesTo: check.applies,
      passCriteria: check.pass,
      verificationSteps: verificationFor(check),
      standards: check.standard.map((item) => ({ ...item })),
      relatedIssueIds: related.map((issue) => issue.id),
      evidence,
    };
  });
  const counts = Object.fromEntries(['pass', 'fail', 'review', 'manual', 'blocked', 'not-tested', 'not-applicable'].map((status) => [status, checks.filter((check) => check.status === status).length]));
  const applicable = checks.length - counts['not-applicable'];
  const executed = counts.pass + counts.fail + counts.review;
  return {
    version: FRAMEWORK_VERSION,
    approach: 'Evidence-first; objective automation, passive security posture, human judgement, and authorized active testing are reported separately.',
    references: Object.values(REFERENCES),
    features,
    counts: { total: checks.length, applicable, executed, ...counts },
    checks,
  };
}

const severityRank = { critical: 4, major: 3, minor: 2, info: 1 };

function locationLabel(location = {}) {
  const viewport = location.viewport || {};
  return [
    location.checkpoint,
    viewport.name || (viewport.width && viewport.height ? viewport.width + 'x' + viewport.height : null),
    location.theme,
    location.selector || location.stableKey,
  ].filter(Boolean).join(' / ');
}

export function buildActionPlan(audit = {}) {
  const groups = new Map();
  for (const issue of array(audit.issues)) {
    const location = issue.location || {};
    const key = String(issue.ruleId || 'finding') + '|' + String(location.stableKey || location.selector || 'page');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(issue);
  }
  const workItems = [...groups.values()].map((items) => {
    const ordered = [...items].sort((left, right) => (severityRank[right.severity] || 0) - (severityRank[left.severity] || 0));
    const lead = ordered[0];
    const guidance = guidanceForRule(lead.ruleId);
    return {
      id: 'work-' + stableHash(ordered.map((item) => item.id).sort().join('|'), 12),
      priority: priorityForIssue(lead),
      severity: lead.severity,
      status: lead.status,
      category: lead.category,
      title: lead.title,
      problem: lead.message,
      userImpact: lead.impact || guidance.impact,
      owner: lead.owner || guidance.owner,
      standards: array(lead.standards).length ? lead.standards : guidance.standards,
      affectedLocations: [...new Set(ordered.map((item) => locationLabel(item.location)).filter(Boolean))],
      sourceIssueIds: ordered.map((item) => item.id),
      fixPlan: array(lead.remediation?.steps).length ? lead.remediation.steps : guidance.fixSteps,
      retestSteps: array(lead.verification?.steps).length ? lead.verification.steps : guidance.verifySteps,
      passCondition: lead.verification?.passCondition || guidance.passCondition,
    };
  }).sort((left, right) => {
    const priority = { P0: 0, P1: 1, P2: 2, P3: 3 };
    return priority[left.priority] - priority[right.priority] || left.title.localeCompare(right.title);
  });

  const invalid = audit?.verdict === 'invalid-capture' || workItems.some((item) => item.category === 'Capture');
  const objectiveMajor = array(audit.issues).some((issue) => issue.status === 'fail' && ['critical', 'major'].includes(issue.severity));
  const objectiveAny = array(audit.issues).some((issue) => issue.status === 'fail');
  const reviewAny = array(audit.issues).some((issue) => issue.status === 'review');
  const framework = audit.framework || buildFrameworkAssessment(audit);
  const decision = invalid ? 'BLOCKED'
    : objectiveMajor ? 'NOT READY'
      : objectiveAny ? 'FIX BEFORE RELEASE'
        : reviewAny || framework.counts.manual > 0 ? 'HUMAN REVIEW REQUIRED'
          : 'AUTOMATED GATES PASS';
  const explanation = invalid
    ? 'The captured page is not valid evidence. Resolve capture problems and rerun before making a release decision.'
    : objectiveMajor
      ? 'One or more major standards-backed failures can block users or core task completion.'
      : objectiveAny
        ? 'Measured failures remain and should be corrected before release acceptance.'
        : reviewAny
          ? 'No objective failure blocks the run, but evidence-backed design concerns still need an explicit human verdict.'
          : 'Automated checks found no failure; outstanding manual checks still require recorded execution before full sign-off.';
  return {
    decision,
    explanation,
    counts: {
      workItems: workItems.length,
      P0: workItems.filter((item) => item.priority === 'P0').length,
      P1: workItems.filter((item) => item.priority === 'P1').length,
      P2: workItems.filter((item) => item.priority === 'P2').length,
      P3: workItems.filter((item) => item.priority === 'P3').length,
    },
    nextActions: workItems.slice(0, 5).map((item) => ({ id: item.id, priority: item.priority, title: item.title, owner: item.owner })),
    workItems,
  };
}

function regressionCase(group, audit) {
  const issue = group.issue;
  const guidance = guidanceForRule(issue.ruleId);
  const locations = group.items.map((item) => item.location || {});
  const target = audit?.target?.finalUrl || audit?.target?.url || locations[0]?.url || 'the audited URL';
  const selectors = [...new Set(locations.map((location) => location.selector || location.stableKey).filter(Boolean))];
  const profiles = [...new Set(locations.map(locationLabel).filter(Boolean))];
  const steps = [
    { action: 'Open the audited page.', data: target },
    { action: 'Reproduce every affected capture profile.', data: profiles.join('; ') || 'Use the capture profile recorded in the finding.' },
  ];
  if (selectors.length) steps.push({ action: 'Locate the affected element.', data: selectors.join('; ') });
  for (const action of array(issue.verification?.steps).length ? issue.verification.steps : guidance.verifySteps) {
    steps.push({ action });
  }
  return {
    id: 'UIUX-REG-' + stableHash(group.items.map((item) => item.id).sort().join('|'), 12).toUpperCase(),
    title: 'Verify fix: ' + issue.title,
    description: issue.impact || guidance.impact,
    subModule: (issue.category === 'Security' ? 'Security - ' : 'UI/UX - ') + (issue.category || 'General'),
    category: issue.category === 'Security' ? 'Security'
      : issue.category === 'Interaction' || issue.category === 'Color' ? 'Accessibility' : 'UI/UX',
    type: issue.class === 'objective' ? 'Automation' : 'Manual',
    priority: priorityForIssue(issue),
    severity: issue.severity || 'minor',
    preconditions: ['The fix is deployed to the audit environment.', 'Use the same content, authentication, viewport, theme, and checkpoint as the source finding.'],
    testData: { observed: issue.actual ?? null, required: issue.expected ?? null },
    steps: steps.map((step, index) => ({ step: index + 1, ...step })),
    expectedResult: issue.verification?.passCondition || guidance.passCondition,
    automatable: issue.class === 'objective',
    isSmoke: ['critical', 'major'].includes(issue.severity),
    standards: array(issue.standards).length ? issue.standards : guidance.standards,
    sourceIssueIds: group.items.map((item) => item.id),
    tags: ['uiux', 'regression', String(issue.ruleId || 'finding'), priorityForIssue(issue).toLowerCase()],
  };
}

export function buildRegressionCases(audit = {}) {
  const groups = new Map();
  for (const issue of array(audit.issues)) {
    const location = issue.location || {};
    const key = String(issue.ruleId || 'finding') + '|' + String(location.stableKey || location.selector || 'page');
    if (!groups.has(key)) groups.set(key, { issue, items: [] });
    groups.get(key).items.push(issue);
  }
  return [...groups.values()]
    .map((group) => regressionCase(group, audit))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function caseCategory(check) {
  if (/Security|security/.test(check.pillar)) return 'Security';
  if (/Accessibility|Keyboard/.test(check.pillar)) return 'Accessibility';
  if (check.pillar === 'Perceived performance') return 'Performance';
  if (check.pillar === 'Compatibility') return 'Compatibility';
  return 'UI/UX';
}

function casePriority(check) {
  if (/Security|security|Cookie|Transport/.test(check.pillar)) return 'P1';
  if (/Accessibility|Keyboard|Forms|Evidence/.test(check.pillar)) return 'P1';
  if (/Layout|Responsive|Interaction|Navigation|Trust|Task/.test(check.pillar)) return 'P2';
  return 'P3';
}

export function buildFrameworkCases(audit = {}) {
  const assessment = audit.framework || buildFrameworkAssessment(audit);
  const target = audit?.target?.finalUrl || audit?.target?.url || 'the audited URL';
  const profiles = array(audit?.captures).map((capture) => locationLabel({
    checkpoint: capture?.checkpoint,
    viewport: capture?.viewport,
    theme: capture?.theme,
  })).filter(Boolean);
  return assessment.checks
    .filter((check) => check.status !== 'not-applicable')
    .map((check) => {
      const steps = [
        { action: 'Open the audited page.', data: target },
        { action: 'Prepare the applicable page state and representative content.', data: check.appliesTo },
      ];
      if (profiles.length) {
        steps.push({ action: 'Reproduce the requested capture profiles.', data: [...new Set(profiles)].join('; ') });
      }
      for (const action of array(check.verificationSteps)) steps.push({ action });
      steps.push({ action: 'Record the result and attach evidence.', data: 'Pass, Fail, Blocked, or Not applicable with screenshot, measurement, or observation.' });
      return {
        id: 'UIUX-' + check.id,
        title: check.title,
        description: 'Verify the ' + check.pillar.toLowerCase() + ' acceptance criterion using the recorded audit evidence.',
        subModule: check.pillar,
        category: caseCategory(check),
        type: check.method === 'automated' ? 'Automation' : 'Manual',
        priority: casePriority(check),
        severity: /Accessibility|Evidence|Forms/.test(check.pillar) ? 'High' : 'Medium',
        preconditions: [
          'The target page is reachable with the required authentication.',
          'Representative content and safe test data are available.',
          'Unexecuted profiles must be recorded as untested rather than passed.',
        ],
        testData: {
          target,
          appliesTo: check.appliesTo,
          auditStatus: check.status,
          relatedIssueIds: check.relatedIssueIds,
        },
        steps: steps.map((step, index) => ({ step: index + 1, ...step })),
        expectedResult: check.passCriteria,
        automatable: check.method === 'automated',
        isSmoke: check.id === 'CAP-001' || (check.status === 'fail' && casePriority(check) === 'P1'),
        standards: check.standards,
        sourceCheckId: check.id,
        sourceIssueIds: check.relatedIssueIds,
        tags: ['uiux', check.pillar.toLowerCase().replace(/[^a-z0-9]+/g, '-'), check.method, check.status],
      };
    });
}

export function buildTestCases(audit = {}) {
  return [...buildFrameworkCases(audit), ...buildRegressionCases(audit)]
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function frameworkChecks() {
  return CHECKS.map(({ rules, standard, pass, applies, ...check }) => ({
    ...check,
    appliesTo: applies,
    passCriteria: pass,
    verificationSteps: verificationFor({ ...check, applies, pass }),
    rulePatterns: rules.map(String),
    standards: standard.map((item) => ({ ...item })),
  }));
}
