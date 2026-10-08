import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(packageRoot, 'output', 'dms-uiux-review');

// Generated from saved, rendered audit evidence. No live rescan is performed.

const pageDefinitions = [
  {
    id: 'reference-ledgers',
    label: 'Ledgers.cloud',
    shortLabel: 'Reference',
    role: 'Visual reference',
    url: 'https://ledgers.cloud/',
    accent: '#2563eb',
    note: 'Rich, dark hero and deeper proof-led landing-page structure. Use its visual language as inspiration, not as an accessibility baseline.',
  },
  {
    id: 'estamp2',
    label: 'eStamp',
    shortLabel: 'eStamp',
    role: 'Local target',
    url: 'http://192.168.6.47:3000/in/dms/estamp2',
    accent: '#2563eb',
    note: 'Clear blue product identity and coherent story, with the highest number of unique local contrast findings.',
  },
  {
    id: 'document-management',
    label: 'Document Management',
    shortLabel: 'Documents',
    role: 'Local target',
    url: 'http://192.168.6.47:3000/in/dms/document-management',
    accent: '#15803d',
    note: 'Consistent green product identity and the fewest unique local objective findings, but weak section separation makes the middle of the page feel sparse.',
  },
  {
    id: 'aadhar-esign',
    label: 'Aadhaar eSign',
    shortLabel: 'Aadhaar eSign',
    role: 'Local target',
    url: 'http://192.168.6.47:3000/in/dms/aadhar-esign',
    accent: '#7c3aed',
    note: 'Useful purple identity in the hero, but the black primary CTA breaks that product-color system and mobile image loading still needs a manual check.',
  },
];

const namedContrastKeys = {
  estamp2: [
    ['Get Started', 'role=button|name=get started'],
    ['FAQ', 'role=button|name=faq'],
    ['Login', 'role=button|name=login'],
    ['Book Demo', 'role=button|name=book demo'],
    ['eStamp Document', 'role=button|name=estamp document'],
  ],
  'document-management': [
    ['Get Started', 'role=button|name=get started'],
    ['FAQ', 'role=button|name=faq'],
    ['Login', 'role=button|name=login'],
    ['Book Demo', 'role=button|name=book demo'],
  ],
  'aadhar-esign': [
    ['Login', 'role=button|name=login'],
    ['Book Demo', 'role=button|name=book demo'],
    ['eSign Document', 'role=button|name=esign document'],
  ],
};

const actions = [];

actions.push({
  id: 'UIUX-01',
  priority: 'P0',
  owner: 'Design system + frontend',
  scope: ['estamp2', 'document-management', 'aadhar-esign'],
  title: 'Replace failing interactive color pairs',
  finding: 'White or green text on current CTA, FAQ, Login, and embedded-demo colors repeatedly falls below the required contrast.',
  fix: 'Move shared blue, green, purple, and neutral text styles to accessible tokens. Suggested white-text starting points: blue #2563EB (5.17:1) or #1D4ED8 (6.70:1), green #15803D (5.02:1) or #166534 (7.13:1), purple #7C3AED (5.70:1) or #6D28D9 (7.10:1). Use #475569 or darker for muted text on white.',
  acceptance: [
    'Normal text and controls measure at least 4.5:1 in every state.',
    'Large text measures at least 3:1.',
    'No color.text-contrast objective findings remain at any audited viewport.',
  ],
});

actions.push({
  id: 'UIUX-02',
  priority: 'P1',
  owner: 'Frontend',
  scope: ['estamp2', 'document-management', 'aadhar-esign'],
  title: 'Preserve footer store-badge proportions',
  finding: 'Two shared 256x76/77 images are forced to about 69.3x36 at tablet width with object-fit: fill, creating roughly 42% aspect-ratio distortion.',
  fix: 'Remove the forced width/height pair. Set a single dimension, width: auto, height: auto where possible, and object-fit: contain. Keep both badges on the same visual height.',
  acceptance: [
    'The intrinsic and rendered aspect ratios differ by no more than 6%.',
    'Both badges remain aligned at 768px without stretching or cropping.',
  ],
});

actions.push({
  id: 'UIUX-03',
  priority: 'P0',
  owner: 'Frontend + UX',
  scope: ['estamp2', 'document-management', 'aadhar-esign'],
  title: 'Stop the mobile Book Demo bar covering content',
  finding: 'At 320px the fixed conversion tray occupies the bottom 85px of the viewport. In the captured hero it visually sits over product content.',
  fix: 'Either make the CTA inline after the hero, or reserve bottom clearance equal to the tray plus env(safe-area-inset-bottom). If it stays fixed, provide a dismiss action and do not duplicate a nearby primary action.',
  acceptance: [
    'No text, control, preview, or focused element is hidden behind the tray at 320px and 390px.',
    'Keyboard focus can move past the tray without losing visibility.',
  ],
});

actions.push({
  id: 'UIUX-04',
  priority: 'P0',
  owner: 'Product design + frontend',
  scope: ['estamp2', 'document-management', 'aadhar-esign'],
  title: 'Clarify scaled product previews and tiny text',
  finding: 'The embedded product demonstrations contain very small rendered text and tight line-height. Minimum sampled sizes reach 5.5px, 2px, and 6px respectively.',
  fix: 'If the preview is interactive, enlarge controls and text and provide at least 1.2 line-height. If it is illustrative, make it clearly non-interactive, hide decorative internals from assistive technology, and offer a zoom/open-preview action.',
  acceptance: [
    'No visually interactive control depends on unreadable scaled text.',
    'Marketing copy remains at least 14px, with 16px preferred for body text.',
    'The preview purpose is clear without attempting unusable micro-interactions.',
  ],
});

actions.push({
  id: 'UIUX-05',
  priority: 'P1',
  owner: 'Design system',
  scope: ['estamp2', 'document-management', 'aadhar-esign'],
  title: 'Unify CTA hierarchy and product accents',
  finding: 'CTA sizing and color treatment vary. Aadhaar eSign uses a black primary CTA despite a purple product identity.',
  fix: 'Use one primary-button component: product accent, at least 44px tall on touch layouts, 12px radius, consistent horizontal padding, visible hover/focus/disabled states, and one clear primary action per section.',
  acceptance: [
    'Primary, secondary, and tertiary actions have the same hierarchy on all three pages.',
    'Aadhaar eSign uses an accessible purple primary token rather than an unrelated black style.',
  ],
});

actions.push({
  id: 'UIUX-06',
  priority: 'P2',
  owner: 'Product design',
  scope: ['estamp2', 'document-management', 'aadhar-esign'],
  title: 'Increase section rhythm and visual depth',
  finding: 'The local pages have sound hero, steps, benefits, and FAQ structure, but long pale regions compress into a sparse middle compared with the richer reference page.',
  fix: 'Alternate white and tinted surfaces, use restrained cards or dividers, tighten empty vertical gaps, and create one visual focal point per section. Keep product accents specific to each page.',
  acceptance: [
    'Each section boundary remains obvious in a full-page thumbnail.',
    'Spacing uses the approved 4/8/12/16/24/32/48/64/80 scale.',
  ],
});

actions.push({
  id: 'UIUX-07',
  priority: 'P2',
  owner: 'Content + product marketing',
  scope: ['estamp2', 'document-management', 'aadhar-esign'],
  title: 'Add product proof before the final conversion',
  finding: 'The local pages tell the process but offer less trust and product proof than the reference.',
  fix: 'Add only verifiable material: a real outcome metric, security/compliance proof, one workflow screenshot, customer proof, relevant integrations, and a final contextual CTA. Do not copy the reference page verbatim.',
  acceptance: [
    'Every proof claim has a source or owner.',
    'The added content improves decision confidence without repeating the hero.',
  ],
});

actions.push({
  id: 'UIUX-08',
  priority: 'P1',
  owner: 'Design system + frontend',
  scope: ['estamp2', 'document-management', 'aadhar-esign'],
  title: 'Standardize fonts, type styles, content widths, and visual tokens',
  finding: 'Font loading passed, but the local pages use up to 20-22 distinct font sizes, up to four font-family stacks, and inconsistent type, spacing, radius, shadow, button, and content-width values. eStamp also produced a long-line review.',
  fix: 'Keep one Inter fallback stack and approved 400/500/600/700 roles. Use the documented type scale, readable line heights, a 65ch body-copy measure, 16px mobile gutters, 24px tablet gutters, and one centered desktop content rail. Map every shared visual value to a semantic token.',
  acceptance: [
    'Inter weights 400, 500, 600, and 700 load or fall back without clipping, overlap, or font-related layout shift above 0.1.',
    'Desktop H1 is 36-40px, mobile H1 is 30-34px, H2 is 26-32px, body is 16px/24px, and small supporting text is 13-14px/20px.',
    'Body copy is no wider than 65ch; shared rails align within 2px; mobile and tablet gutters are at least 16px and 24px.',
    'New sections use only approved semantic tokens and introduce no unexplained near-duplicate values.',
  ],
});

actions.push({
  id: 'UIUX-09',
  priority: 'P2',
  owner: 'QA + frontend',
  scope: ['aadhar-esign'],
  title: 'Verify six mobile images that did not confirm loading',
  finding: 'Six images at the 320px capture were incomplete, but there were no failed network requests; they are review items, not broken-image failures.',
  fix: 'Inspect the 320px route after a cold load and a throttled load. Confirm lazy-loading triggers, intrinsic dimensions are reserved, and the images become complete when scrolled into view.',
  acceptance: [
    'All intended mobile images complete or are intentionally deferred.',
    'No layout shift or empty image slot remains visible.',
  ],
});

actions.push({
  id: 'UIUX-10',
  priority: 'P2',
  owner: 'Frontend + content',
  scope: ['estamp2', 'document-management', 'aadhar-esign'],
  title: 'Confirm animated statistics never remain at placeholder zero',
  finding: 'Captured statistic areas include 0 or 0% values that may be animation placeholders or valid content.',
  fix: 'Load approved final values before the ready state and provide the final value immediately for reduced-motion users.',
  acceptance: [
    'No temporary zero remains after the page-ready state.',
    'Reduced-motion mode receives the same approved final value.',
    'A legitimate zero includes enough context to avoid misinterpretation.',
  ],
});

actions.push({
  id: 'UIUX-11',
  priority: 'P0',
  owner: 'Frontend + accessibility QA',
  scope: ['estamp2', 'document-management', 'aadhar-esign'],
  title: 'Keep controls inside the viewport at narrow widths and zoom',
  finding: 'The page canvas has no horizontal overflow, but saved eStamp geometry places FAQ at x=-4 and the eStamp Document control 23px beyond the right edge at both 320px and 390px. Browser zoom and WCAG text-spacing overrides were not covered by the original captures.',
  fix: 'Make component wrappers flexible, keep required controls within their content rail, allow labels and control groups to wrap, and use local scrolling only for genuinely two-dimensional content. Verify 200% and 400% zoom plus WCAG text-spacing overrides.',
  acceptance: [
    'Every required control stays within the viewport at 320, 390, 767, 768, 769, 1024, and 1440px, including mobile landscape.',
    'At 200% and 400% zoom, headings, labels, navigation, and actions remain readable and operable without two-dimensional page scrolling.',
    'With line-height 1.5, paragraph spacing 2em, letter spacing 0.12em, and word spacing 0.16em, no required text is clipped, hidden, truncated, or overlapped.',
  ],
});

const comparisonMatrix = [
  {
    dimension: 'Hero tone',
    reference: 'Immersive dark hero, centered message, two clear actions, large product preview.',
    local: 'Light product-tinted heroes with strong headlines, chips, one main action, and embedded previews.',
    decision: 'Keep product-specific light heroes, but match the reference confidence, focal clarity, and proof quality.',
  },
  {
    dimension: 'Content depth',
    reference: 'Integrations, AI agents, workflow, feature sets, APIs, testimonials, FAQ, and repeated proof.',
    local: 'Hero, stats, how it works, benefits, FAQ, and footer.',
    decision: 'Add only relevant and verifiable proof: security, integrations, outcomes, customer evidence, and final CTA.',
  },
  {
    dimension: 'Section rhythm',
    reference: 'Frequent visual transitions, darker anchors, product scenes, and varied card groupings.',
    local: 'Long pale sections with fewer visual anchors; the middle can look sparse in a full-page scan.',
    decision: 'Alternate restrained surfaces, strengthen dividers/cards, and use one focal visual per section.',
  },
  {
    dimension: 'CTA system',
    reference: 'Prominent actions, but the reference still contains target-size and contrast defects.',
    local: 'Repeated color-contrast failures; mixed visual treatment; Aadhaar uses black instead of purple.',
    decision: 'Use one accessible 44px mobile CTA component with product accent, consistent hierarchy, and focus states.',
  },
  {
    dimension: 'Mobile conversion tray',
    reference: 'A fixed bottom Book Demo treatment is part of the visual pattern.',
    local: 'The same pattern occupies 85px at 320px and visually covers hero/product content.',
    decision: 'Reserve safe clearance, make it dismissible, or move it inline. Do not inherit the overlap defect.',
  },
  {
    dimension: 'Product preview',
    reference: 'Large, high-impact product presentation.',
    local: 'Useful embedded demos, but some labels and controls shrink to unreadable micro sizes.',
    decision: 'Either enlarge real interactions or present a clearly illustrative preview with zoom.',
  },
  {
    dimension: 'Responsive base',
    reference: 'All four captures render and reflow without page-level horizontal overflow.',
    local: 'All twelve captures render and reflow without page-level horizontal overflow.',
    decision: 'Preserve this strength and add regression baselines after the visual fixes.',
  },
];

const statusComparisons = [];

statusComparisons.push({
  id: 'CMP-01',
  status: 'MISMATCH',
  area: 'Responsive component bounds and zoom',
  priority: 'P0',
  affectedPages: ['estamp2'],
  reference: 'The page canvas and every required component should remain inside the viewport and operable after narrow reflow, zoom, and text-spacing changes.',
  local: 'All 12 local captures have zero page-level horizontal overflow, but eStamp places FAQ at x=-4 and the eStamp Document control beyond the right edge at 320px and 390px. Zoom and text-spacing overrides remain unverified.',
  gap: 'The document width passes, but individual required controls do not fully stay inside the eStamp mobile viewport.',
  fix: 'Constrain and wrap the affected control groups, then verify component bounds at breakpoint edges, mobile landscape, 200%/400% zoom, and WCAG text spacing.',
  linkedActionId: 'UIUX-11',
  caseId: 'UIUX-TC-011',
});

statusComparisons.push({
  id: 'CMP-02',
  status: 'MATCH',
  area: 'Keyboard focus samples',
  priority: 'KEEP',
  affectedPages: ['estamp2', 'document-management', 'aadhar-esign'],
  reference: 'Interactive controls expose visible focus treatment in the tested sample.',
  local: 'All 80 tested focus-state samples passed on each local page.',
  gap: 'No confirmed mismatch in the tested controls.',
  fix: 'Keep the shared focus treatment and expand the sample when new controls are added.',
  linkedActionId: null,
  caseId: 'UIUX-TC-012',
});

statusComparisons.push({
  id: 'CMP-03',
  status: 'MATCH',
  area: 'Minimum pointer target',
  priority: 'KEEP',
  affectedPages: ['estamp2', 'document-management', 'aadhar-esign'],
  reference: 'The reference includes some undersized targets and is not the standard to copy here.',
  local: 'All tested local targets passed the objective 24px minimum: 84/84, 84/84, and 83/83.',
  gap: 'No objective local mismatch.',
  fix: 'Keep the 24px minimum and use 44px for primary mobile actions.',
  linkedActionId: 'UIUX-05',
  caseId: 'UIUX-TC-013',
});

statusComparisons.push({
  id: 'CMP-04',
  status: 'PARTIAL MATCH',
  area: 'Shared Ledgers visual foundation',
  priority: 'P2',
  affectedPages: ['estamp2', 'document-management', 'aadhar-esign'],
  reference: 'Inter typography, Ledgers navigation/footer, strong headline hierarchy, shared neutral foundation.',
  local: 'The same broad foundation is visible, but font-size, color, spacing, radius, shadow, and button variants have drifted.',
  gap: 'The family resemblance is present, but the shared system is not consistently tokenized.',
  fix: 'Retain product accents while consolidating all shared typography, neutral, spacing, radius, shadow, and control tokens.',
  linkedActionId: 'UIUX-08',
  caseId: 'UIUX-TC-009',
});

statusComparisons.push({
  id: 'CMP-05',
  status: 'PARTIAL MATCH',
  area: 'Hero hierarchy and visual confidence',
  priority: 'P2',
  affectedPages: ['estamp2', 'document-management', 'aadhar-esign'],
  reference: 'Dark immersive hero with a strong focal message, two actions, and a large product scene.',
  local: 'Clear 36px headlines and product-specific accents, but lighter heroes have less visual depth and proof.',
  gap: 'Headline hierarchy matches; confidence, depth, and product proof only partially match.',
  fix: 'Keep the light product identity while strengthening focal imagery, surface contrast, and immediate proof.',
  linkedActionId: 'UIUX-06',
  caseId: 'UIUX-TC-008',
});

statusComparisons.push({
  id: 'CMP-06',
  status: 'MISMATCH',
  area: 'Product proof and content depth',
  priority: 'P2',
  affectedPages: ['estamp2', 'document-management', 'aadhar-esign'],
  reference: 'Integrations, workflows, feature proof, APIs, testimonials, FAQ, and repeated confidence signals.',
  local: 'Hero, stats, process, benefits, FAQ, and footer with limited proof between explanation and conversion.',
  gap: 'The local pages explain the service but do not provide the same decision confidence.',
  fix: 'Add verifiable security/compliance proof, one outcome, a product workflow, relevant integrations, customer evidence, and a contextual final CTA.',
  linkedActionId: 'UIUX-07',
  caseId: 'UIUX-TC-007',
});

statusComparisons.push({
  id: 'CMP-07',
  status: 'MISMATCH',
  area: 'Section rhythm and visual depth',
  priority: 'P2',
  affectedPages: ['estamp2', 'document-management', 'aadhar-esign'],
  reference: 'Frequent surface changes, visual anchors, product scenes, and varied card groupings.',
  local: 'Long pale regions and fewer visual anchors make the page middle look sparse in a full-page view.',
  gap: 'Section boundaries and information rhythm are materially weaker than the reference.',
  fix: 'Alternate restrained surfaces, strengthen section boundaries, tighten empty gaps, and add one useful focal visual per section.',
  linkedActionId: 'UIUX-06',
  caseId: 'UIUX-TC-006',
});

statusComparisons.push({
  id: 'CMP-08',
  status: 'MISMATCH',
  area: 'CTA and control contrast',
  priority: 'P0',
  affectedPages: ['estamp2', 'document-management', 'aadhar-esign'],
  reference: 'High-confidence actions are visually prominent, although the reference itself is not an accessibility baseline.',
  local: 'Get Started, FAQ, Login, Book Demo, eStamp Document, and eSign Document include measured ratios from 2.10:1 to 3.76:1 where 4.5:1 is required.',
  gap: 'The local interactive color system fails the required text contrast.',
  fix: 'Replace shared action colors with accessible blue, green, purple, and neutral tokens and verify every state.',
  linkedActionId: 'UIUX-01',
  caseId: 'UIUX-TC-001',
});

statusComparisons.push({
  id: 'CMP-09',
  status: 'MISMATCH',
  area: 'Footer store badges',
  priority: 'P1',
  affectedPages: ['estamp2', 'document-management', 'aadhar-esign'],
  reference: 'Brand media should retain its intrinsic proportions.',
  local: 'Two shared 256x76/77 badges render about 69.3x36 at tablet width with object-fit fill.',
  gap: 'Both images are visibly stretched by roughly 42%.',
  fix: 'Use one controlled dimension with width auto and object-fit contain.',
  linkedActionId: 'UIUX-02',
  caseId: 'UIUX-TC-002',
});

statusComparisons.push({
  id: 'CMP-10',
  status: 'MISMATCH',
  area: 'Mobile Book Demo tray',
  priority: 'P0',
  affectedPages: ['estamp2', 'document-management', 'aadhar-esign'],
  reference: 'A fixed bottom conversion treatment is part of the visual language.',
  local: 'At 320px the fixed tray consumes the bottom 85px and visually sits over hero or product content.',
  gap: 'The reference pattern was inherited without safe content clearance.',
  fix: 'Reserve tray and safe-area space, make the tray dismissible, or move the CTA inline.',
  linkedActionId: 'UIUX-03',
  caseId: 'UIUX-TC-003',
});

statusComparisons.push({
  id: 'CMP-11',
  status: 'MISMATCH',
  area: 'Embedded product-preview readability',
  priority: 'P0',
  affectedPages: ['estamp2', 'document-management', 'aadhar-esign'],
  reference: 'Product presentation is large enough to communicate value without relying on micro interactions.',
  local: 'Embedded previews contain sampled text as small as 5.5px, 2px, and 6px with tight line-height.',
  gap: 'The previews look interactive but contain text and controls too small to use reliably.',
  fix: 'Enlarge genuine interactions, or make the preview clearly illustrative and provide a zoom or open-preview action.',
  linkedActionId: 'UIUX-04',
  caseId: 'UIUX-TC-004',
});

statusComparisons.push({
  id: 'CMP-12',
  status: 'MISMATCH',
  area: 'Primary CTA consistency',
  priority: 'P1',
  affectedPages: ['aadhar-esign'],
  reference: 'Primary actions follow the active product or brand emphasis.',
  local: 'Aadhaar eSign uses a black Get Started action even though purple is the page identity.',
  gap: 'The main CTA does not visually belong to the Aadhaar eSign product system.',
  fix: 'Use the accessible purple primary token and the same shared button construction as the other DMS pages.',
  linkedActionId: 'UIUX-05',
  caseId: 'UIUX-TC-005',
});

statusComparisons.push({
  id: 'CMP-13',
  status: 'PARTIAL MATCH',
  area: 'Aadhaar mobile image loading',
  priority: 'P2',
  affectedPages: ['aadhar-esign'],
  reference: 'Intended visual assets should complete after lazy content is brought into view.',
  local: 'Six 320px images were not confirmed complete, but no failed request proves they are broken.',
  gap: 'Loading reliability is unconfirmed rather than failed.',
  fix: 'Run cold and throttled mobile checks, reserve intrinsic size, and verify lazy loading completes after scroll.',
  linkedActionId: 'UIUX-09',
  caseId: 'UIUX-TC-010',
});

statusComparisons.push({
  id: 'CMP-14',
  status: 'MISMATCH',
  area: 'Typography, content width, and design-token consistency',
  priority: 'P1',
  affectedPages: ['estamp2', 'document-management', 'aadhar-esign'],
  reference: 'A reusable system should use one font stack, semantic type roles, readable text measures, shared content rails, and deliberate color, spacing, radius, shadow, and control tokens.',
  local: 'Font loading passes, but pages use up to 20-22 font sizes, up to four family stacks, and inconsistent shared style and width values.',
  gap: 'The font is present, but typography roles, text measure, content widths, and visual tokens are not consistently governed.',
  fix: 'Apply the approved Inter roles, type scale, line heights, 65ch copy measure, responsive gutters, centered content rail, and semantic visual tokens.',
  linkedActionId: 'UIUX-08',
  caseId: 'UIUX-TC-009',
});

statusComparisons.push({
  id: 'CMP-15',
  status: 'MATCH',
  area: 'Visible content clipping',
  priority: 'KEEP',
  affectedPages: ['estamp2', 'document-management', 'aadhar-esign'],
  reference: 'Content should remain visible without confirmed clipping at audited widths.',
  local: 'The finalized analyzer found zero confirmed clipping failures across all local captures.',
  gap: 'No confirmed mismatch.',
  fix: 'Keep this behavior and rerun clipping checks after layout changes.',
  linkedActionId: null,
  caseId: 'UIUX-TC-014',
});

statusComparisons.push({
  id: 'CMP-16',
  status: 'PARTIAL MATCH',
  area: 'Statistic counter final values',
  priority: 'P2',
  affectedPages: ['estamp2', 'document-management', 'aadhar-esign'],
  reference: 'Statistics should settle on approved values without exposing animation placeholders.',
  local: 'Captured statistic areas include visible 0 or 0% values; the audit cannot determine whether each value is temporary or legitimate.',
  gap: 'The final content state requires verification in normal-motion and reduced-motion modes.',
  fix: 'Populate approved values before the page-ready state and bypass count-up animation for reduced-motion users.',
  linkedActionId: 'UIUX-10',
  caseId: 'UIUX-TC-015',
});

const verificationCases = [];

verificationCases.push({
  id: 'UIUX-TC-001',
  title: 'Verify accessible contrast for every named CTA and control',
  statusBefore: 'MISMATCH',
  priority: 'P0',
  category: 'Accessibility',
  type: 'Automation',
  automatable: true,
  affectedPages: ['estamp2', 'document-management', 'aadhar-esign'],
  linkedComparisonIds: ['CMP-08'],
  linkedActionId: 'UIUX-01',
  evidence: 'Measured failures include Get Started 3.22-3.76:1, FAQ 3.30-3.68:1, Login 3.30:1, Book Demo 3.76:1, and embedded document actions 2.10:1; normal text requires 4.5:1.',
  preconditions: ['Load the latest build with the replacement semantic color tokens.'],
  steps: [
    { action: 'Open each affected page at 320px, 390px, 768px, and 1440px.' },
    { action: 'Locate Get Started, FAQ, Login, Book Demo, eStamp Document, and eSign Document where present.' },
    { action: 'Measure text contrast in the default state.' },
    { action: 'Measure text contrast in the hover state where available.' },
    { action: 'Measure text contrast in the keyboard-focus state.' },
    { action: 'Record the foreground, background, ratio, and viewport for every failure.' },
  ],
  expectedResult: 'Every normal-text control state measures at least 4.5:1 and every large-text state measures at least 3:1, with no color.text-contrast objective finding.',
  acceptanceCriteria: ['Default, hover, focus, active, and disabled colors use approved semantic tokens.', 'No named CTA regresses at any audited viewport.'],
});

verificationCases.push({
  id: 'UIUX-TC-002',
  title: 'Verify footer store badges retain their intrinsic proportions',
  statusBefore: 'MISMATCH',
  priority: 'P1',
  category: 'Visual integrity',
  type: 'Automation',
  automatable: true,
  affectedPages: ['estamp2', 'document-management', 'aadhar-esign'],
  linkedComparisonIds: ['CMP-09'],
  linkedActionId: 'UIUX-02',
  evidence: 'Two 256x76/77 images render about 69.3x36 at 768px with object-fit fill, producing roughly 42% distortion.',
  preconditions: ['Open each page with all footer images loaded.'],
  steps: [
    { action: 'Set the viewport to 768x1024.' },
    { action: 'Scroll to the footer store badges.' },
    { action: 'Read each badge natural width and natural height.' },
    { action: 'Read each badge rendered width, rendered height, and object-fit.' },
    { action: 'Compare the intrinsic and rendered aspect ratios.' },
  ],
  expectedResult: 'Each badge differs from its intrinsic aspect ratio by no more than 6%, remains uncropped, and aligns with the other badge.',
  acceptanceCriteria: ['Use object-fit contain or natural sizing.', 'Do not force both width and height to a conflicting ratio.'],
});

verificationCases.push({
  id: 'UIUX-TC-003',
  title: 'Verify the mobile Book Demo tray never covers content',
  statusBefore: 'MISMATCH',
  priority: 'P0',
  category: 'Responsive UX',
  type: 'Automation',
  automatable: true,
  affectedPages: ['estamp2', 'document-management', 'aadhar-esign'],
  linkedComparisonIds: ['CMP-10'],
  linkedActionId: 'UIUX-03',
  evidence: 'The fixed tray occupies the bottom 85px at 320px and visually overlaps hero or product-preview content.',
  preconditions: ['Load each page at the top with the mobile conversion tray visible.'],
  steps: [
    { action: 'Set the viewport to 320x568.' },
    { action: 'Capture the hero with the tray visible.' },
    { action: 'Check every visible text, control, and preview rectangle against the tray rectangle.' },
    { action: 'Move keyboard focus through controls near the tray.' },
    { action: 'Repeat the geometry and focus checks at 390x844.' },
  ],
  expectedResult: 'No visible or focused element intersects the tray, page content reserves the tray plus safe-area height, and the tray can be dismissed or is placed inline.',
  acceptanceCriteria: ['Zero geometry overlap at 320px and 390px.', 'Focused controls remain fully visible.'],
});

verificationCases.push({
  id: 'UIUX-TC-004',
  title: 'Verify embedded product previews are readable or clearly illustrative',
  statusBefore: 'MISMATCH',
  priority: 'P0',
  category: 'Readability',
  type: 'Manual',
  automatable: false,
  affectedPages: ['estamp2', 'document-management', 'aadhar-esign'],
  linkedComparisonIds: ['CMP-11'],
  linkedActionId: 'UIUX-04',
  evidence: 'Sampled preview text reaches 5.5px on eStamp, 2px on Document Management, and 6px on Aadhaar eSign.',
  preconditions: ['Open each page at mobile, tablet, and desktop widths.'],
  steps: [
    { action: 'Identify whether the product preview is intended to be interactive.' },
    { action: 'Attempt every control that visually appears interactive.' },
    { action: 'Read labels and status text without browser zoom.' },
    { action: 'Check whether an illustrative preview offers a zoom or open-preview action.' },
    { action: 'Check whether decorative internals are excluded from the accessibility tree.' },
  ],
  expectedResult: 'Interactive previews contain readable labels and usable controls; illustrative previews are clearly non-interactive, do not create false affordances, and provide an accessible enlarged view.',
  acceptanceCriteria: ['No user task depends on micro-sized text.', 'The preview purpose is immediately clear.'],
});

verificationCases.push({
  id: 'UIUX-TC-005',
  title: 'Verify primary CTA hierarchy and Aadhaar product accent',
  statusBefore: 'MISMATCH',
  priority: 'P1',
  category: 'Visual consistency',
  type: 'Automation',
  automatable: true,
  affectedPages: ['estamp2', 'document-management', 'aadhar-esign'],
  linkedComparisonIds: ['CMP-12'],
  linkedActionId: 'UIUX-05',
  evidence: 'Aadhaar eSign uses a black primary action despite its purple page identity; shared CTA construction also varies.',
  preconditions: ['Load the updated shared primary-button component on all three pages.'],
  steps: [
    { action: 'Open the three pages at 390px and 1440px.' },
    { action: 'Locate each primary, secondary, and tertiary action.' },
    { action: 'Compare height, padding, radius, weight, and interaction states.' },
    { action: 'Read the computed primary accent on each page.' },
  ],
  expectedResult: 'All pages use the same action hierarchy, height, padding, radius, weight, and state construction; eStamp is blue, Documents is green, and Aadhaar is purple.',
  acceptanceCriteria: ['Only the approved product accent differs between primary-button variants.', 'Aadhaar no longer uses an unrelated black primary CTA.'],
});

verificationCases.push({
  id: 'UIUX-TC-006',
  title: 'Verify every page section has clear visual rhythm',
  statusBefore: 'MISMATCH',
  priority: 'P2',
  category: 'Visual hierarchy',
  type: 'Manual',
  automatable: false,
  affectedPages: ['estamp2', 'document-management', 'aadhar-esign'],
  linkedComparisonIds: ['CMP-07'],
  linkedActionId: 'UIUX-06',
  evidence: 'Full-page captures show long pale regions and weaker section boundaries than the reference.',
  preconditions: ['Generate current 390px and 1440px full-page screenshots.'],
  steps: [
    { action: 'View each full-page screenshot at thumbnail size.' },
    { action: 'Mark every point where one content section ends and the next begins.' },
    { action: 'Check each section for a heading, content grouping, and one focal visual or clear divider.' },
    { action: 'Identify unexplained empty bands or repeated surface treatments.' },
    { action: 'Compare spacing values with the approved spacing scale.' },
  ],
  expectedResult: 'Every section boundary is identifiable without reading body copy, no unexplained empty band remains, and spacing maps to the approved scale.',
  acceptanceCriteria: ['One clear focal point per section.', 'No visual density jump distracts from the page story.'],
});

verificationCases.push({
  id: 'UIUX-TC-007',
  title: 'Verify product proof supports the purchase decision',
  statusBefore: 'MISMATCH',
  priority: 'P2',
  category: 'Content design',
  type: 'Manual',
  automatable: false,
  affectedPages: ['estamp2', 'document-management', 'aadhar-esign'],
  linkedComparisonIds: ['CMP-06'],
  linkedActionId: 'UIUX-07',
  evidence: 'The local pages explain process and benefits but contain less verifiable proof than the reference.',
  preconditions: ['Use the approved content inventory and evidence owners.'],
  steps: [
    { action: 'List every metric, compliance claim, workflow screenshot, integration, and customer statement.' },
    { action: 'Verify each claim has an approved source or owner.' },
    { action: 'Confirm every proof item is relevant to the specific DMS product.' },
    { action: 'Confirm proof content does not repeat the hero wording.' },
    { action: 'Confirm the final CTA follows the strongest proof section.' },
  ],
  expectedResult: 'Each page contains sourced, product-relevant proof that adds new information and leads to a contextual final action.',
  acceptanceCriteria: ['No unsupported claim is published.', 'At least one security or compliance proof and one product-workflow proof are present.'],
});

verificationCases.push({
  id: 'UIUX-TC-008',
  title: 'Verify hero product, benefit, and primary action are clear',
  statusBefore: 'PARTIAL MATCH',
  priority: 'P2',
  category: 'First-impression clarity',
  type: 'Manual',
  automatable: false,
  affectedPages: ['estamp2', 'document-management', 'aadhar-esign'],
  linkedComparisonIds: ['CMP-05'],
  linkedActionId: 'UIUX-06',
  evidence: 'Local heroes have clear headlines and accents but less focal depth and immediate proof than the reference.',
  preconditions: ['Open each page at 390px and 1440px without scrolling.'],
  steps: [
    { action: 'View the first screen for five seconds.' },
    { action: 'State the product name.' },
    { action: 'State the primary user benefit.' },
    { action: 'Identify the primary action.' },
    { action: 'Check whether the product visual supports rather than competes with the message.' },
  ],
  expectedResult: 'A reviewer can identify the product, benefit, and primary action within five seconds, and the preview reinforces the promise.',
  acceptanceCriteria: ['One dominant headline and one dominant action.', 'No decorative element competes with the primary message.'],
});

verificationCases.push({
  id: 'UIUX-TC-009',
  title: 'Verify fonts, type styles, content widths, and visual tokens',
  statusBefore: 'MISMATCH',
  priority: 'P1',
  category: 'Design system',
  type: 'Automation',
  automatable: true,
  affectedPages: ['estamp2', 'document-management', 'aadhar-esign'],
  linkedComparisonIds: ['CMP-04', 'CMP-14'],
  linkedActionId: 'UIUX-08',
  evidence: 'Normal-load font checks passed 48/48 per local page, but captures contain up to 20-22 font sizes, up to four family stacks, shared style drift, and one eStamp long-line review.',
  preconditions: ['Publish the approved typography, content-rail, and semantic visual token specifications in the build.'],
  steps: [
    { action: 'Wait for document.fonts.ready on each page.' },
    { action: 'Verify Inter weights 400, 500, 600, and 700 load or use the approved fallback.' },
    { action: 'Extract computed font family, size, weight, line height, and letter spacing for each semantic text role.' },
    { action: 'Compare desktop H1, mobile H1, H2, body, label, and supporting-text roles with the approved scale.' },
    { action: 'Measure body-copy line length, page gutters, centered container width, and alignment of shared content rails.' },
    { action: 'Extract computed color, spacing, radius, shadow, and button values from every page.' },
    { action: 'Normalize equivalent CSS color formats.' },
    { action: 'Map each shared value to an approved semantic token.' },
    { action: 'List values with no token mapping.' },
    { action: 'List near-duplicate values that serve the same purpose.' },
  ],
  expectedResult: 'Inter and its approved weights load stably; every semantic text role, content rail, gutter, color, spacing, radius, shadow, and shared component maps to the approved system; only purposeful product accents differ.',
  acceptanceCriteria: [
    'Desktop H1 is 36-40px, mobile H1 is 30-34px, H2 is 26-32px, body is 16px/24px, and supporting text is at least 13px/20px.',
    'Body copy is no wider than 65ch, mobile gutters are at least 16px, tablet gutters are at least 24px, and shared rails align within 2px.',
    'Font loading or fallback causes no clipping, overlap, or cumulative layout shift above 0.1.',
    'New sections introduce no unapproved or unexplained near-duplicate tokens.',
  ],
});

verificationCases.push({
  id: 'UIUX-TC-010',
  title: 'Verify Aadhaar images complete during a cold mobile load',
  statusBefore: 'PARTIAL MATCH',
  priority: 'P2',
  category: 'Media loading',
  type: 'Automation',
  automatable: true,
  affectedPages: ['aadhar-esign'],
  linkedComparisonIds: ['CMP-13'],
  linkedActionId: 'UIUX-09',
  evidence: 'Six images at 320px were not confirmed complete, but no failed request established a broken asset.',
  preconditions: ['Disable browser cache and use a throttled mobile network profile.'],
  steps: [
    { action: 'Set the viewport to 320x568.' },
    { action: 'Reload the Aadhaar eSign page with cache disabled.' },
    { action: 'Record reserved image dimensions before scrolling.' },
    { action: 'Scroll through the page until every intended image enters the viewport.' },
    { action: 'Wait for each image load or error event.' },
    { action: 'Record incomplete images, failed requests, and layout shifts.' },
  ],
  expectedResult: 'Every intended image completes when reached, has reserved dimensions before load, and produces no empty slot, failed request, or visible layout shift.',
  acceptanceCriteria: ['Zero proven broken images.', 'Lazy loading triggers reliably after scroll.'],
});

verificationCases.push({
  id: 'UIUX-TC-011',
  title: 'Verify page width, component bounds, zoom, and text wrapping',
  statusBefore: 'MISMATCH',
  priority: 'P0',
  category: 'Responsive layout',
  type: 'Automation',
  automatable: true,
  affectedPages: ['estamp2', 'document-management', 'aadhar-esign'],
  linkedComparisonIds: ['CMP-01'],
  linkedActionId: 'UIUX-11',
  evidence: 'All 12 local captures had zero document-level horizontal overflow, but eStamp FAQ starts at x=-4 and the eStamp Document control ends at x=343 in 320px and x=413 in 390px. Zoom and WCAG text spacing remain unverified.',
  preconditions: ['Use production-equivalent content, the updated responsive wrappers, and the approved browser font configuration.'],
  steps: [
    { action: 'Open each page at 320x568.' },
    { action: 'Compare document scroll width with client width.' },
    { action: 'Verify every required control rectangle stays inside the viewport.' },
    { action: 'Repeat the width and element-bound checks at 390, 767, 768, 769, 1024, and 1440px.' },
    { action: 'Repeat the narrow checks in mobile landscape.' },
    { action: 'Set browser zoom to 200% and repeat the navigation, heading, label, and control checks.' },
    { action: 'Set browser zoom to 400% on a 1280px viewport and repeat the checks.' },
    { action: 'Apply line-height 1.5, paragraph spacing 2em, letter spacing 0.12em, and word spacing 0.16em.' },
    { action: 'Verify text wraps without clipping, truncation, overlap, or hidden controls.' },
    { action: 'Verify genuinely two-dimensional tables or media scroll only inside their own container.' },
  ],
  expectedResult: 'The page canvas and every required component remain inside the viewport, readable, and operable at breakpoint edges, mobile landscape, 200%/400% zoom, and WCAG text spacing; only essential two-dimensional content may scroll locally.',
  acceptanceCriteria: ['Document scroll width does not exceed client width by more than 1px.', 'No required element has a negative left edge or a right edge beyond the viewport.', 'No text or focused control is clipped, truncated, overlapped, or hidden.'],
});

verificationCases.push({
  id: 'UIUX-TC-012',
  title: 'Protect visible keyboard focus on every interactive control',
  statusBefore: 'MATCH',
  priority: 'KEEP',
  category: 'Keyboard accessibility',
  type: 'Automation',
  automatable: true,
  affectedPages: ['estamp2', 'document-management', 'aadhar-esign'],
  linkedComparisonIds: ['CMP-02'],
  linkedActionId: null,
  evidence: 'All 80 tested focus-state samples passed on each local page.',
  preconditions: ['Open each page without using a pointer after load.'],
  steps: [
    { action: 'Press Tab to move focus through every interactive control.' },
    { action: 'Record the focused element at each step.' },
    { action: 'Compare focused and unfocused visual styles.' },
    { action: 'Check the focus indicator against adjacent colors.' },
    { action: 'Confirm the focused element remains inside the visible viewport.' },
  ],
  expectedResult: 'Every reachable control has an unmistakable visible focus state with at least 3:1 adjacent contrast and remains fully visible.',
  acceptanceCriteria: ['No keyboard trap.', 'No control loses its focus indicator after redesign.'],
});

verificationCases.push({
  id: 'UIUX-TC-013',
  title: 'Protect minimum target size and mobile action comfort',
  statusBefore: 'MATCH',
  priority: 'KEEP',
  category: 'Interaction sizing',
  type: 'Automation',
  automatable: true,
  affectedPages: ['estamp2', 'document-management', 'aadhar-esign'],
  linkedComparisonIds: ['CMP-03'],
  linkedActionId: 'UIUX-05',
  evidence: 'All objectively tested local targets passed the 24px minimum.',
  preconditions: ['Load each page at 390px and 1440px.'],
  steps: [
    { action: 'Collect every visible interactive target rectangle.' },
    { action: 'Exclude valid inline-text and spacing exceptions.' },
    { action: 'Measure width and height for every remaining target.' },
    { action: 'Measure all primary mobile actions separately.' },
  ],
  expectedResult: 'Every objective target is at least 24x24px and every primary mobile action is at least 44px high.',
  acceptanceCriteria: ['Zero objective target-size failures.', 'Primary mobile actions meet the comfort target.'],
});

verificationCases.push({
  id: 'UIUX-TC-014',
  title: 'Protect visible content from clipping after layout changes',
  statusBefore: 'MATCH',
  priority: 'KEEP',
  category: 'Layout integrity',
  type: 'Automation',
  automatable: true,
  affectedPages: ['estamp2', 'document-management', 'aadhar-esign'],
  linkedComparisonIds: ['CMP-15'],
  linkedActionId: null,
  evidence: 'The finalized audit found zero confirmed clipping failures across all local captures.',
  preconditions: ['Use the updated content and design tokens.'],
  steps: [
    { action: 'Open each page at every audited viewport.' },
    { action: 'Compare each visible element scroll dimensions with its client dimensions.' },
    { action: 'Inspect ellipsis and overflow-hidden regions for lost required content.' },
    { action: 'Check that visually hidden accessibility text remains exempt.' },
  ],
  expectedResult: 'No required visible text, image, or control is clipped; intentional screen-reader-only content remains correctly hidden.',
  acceptanceCriteria: ['Zero confirmed clipping failures.', 'No exemption hides a visible interactive control.'],
});

verificationCases.push({
  id: 'UIUX-TC-015',
  title: 'Verify statistic counters settle on approved final values',
  statusBefore: 'PARTIAL MATCH',
  priority: 'P2',
  category: 'Content state',
  type: 'Manual',
  automatable: false,
  affectedPages: ['estamp2', 'document-management', 'aadhar-esign'],
  linkedComparisonIds: ['CMP-16'],
  linkedActionId: 'UIUX-10',
  evidence: 'Rendered captures contain visible 0 or 0% values that may be animation placeholders or legitimate statistics.',
  preconditions: ['Obtain the approved final value for every statistic.'],
  steps: [
    { action: 'Open an affected page with normal motion enabled.' },
    { action: 'Scroll the statistics section into view.' },
    { action: 'Wait for the page-ready state.' },
    { action: 'Record every final displayed value.' },
    { action: 'Reload the page with reduced motion enabled.' },
    { action: 'Scroll the statistics section into view.' },
    { action: 'Record every reduced-motion value.' },
    { action: 'Compare both value sets with the approved source.' },
  ],
  expectedResult: 'Every statistic displays its approved final value in both motion modes without leaving a temporary 0 or 0% placeholder.',
  acceptanceCriteria: ['Reduced-motion users receive the final value without animation.', 'A legitimate zero is clearly labeled and approved.'],
});

verificationCases.push({
  id: 'UIUX-TC-016',
  title: 'Verify cross-browser and operating-system visual compatibility',
  statusBefore: 'NOT TESTED',
  evidenceStatus: 'NOT TESTED',
  coverageType: 'PLANNED',
  priority: 'P1',
  category: 'Compatibility',
  type: 'Hybrid',
  automatable: false,
  affectedPages: ['estamp2', 'document-management', 'aadhar-esign'],
  linkedComparisonIds: ['CMP-01', 'CMP-14'],
  linkedActionId: 'UIUX-11',
  evidence: 'The saved audit executed Chromium 131 only. Windows Chrome, Edge, and Firefox plus macOS Safari or Playwright WebKit have not been executed, so cross-browser compatibility is not yet proven.',
  preconditions: [
    'Use the supported production browser versions on Windows and macOS, plus Playwright Chromium, Firefox, and WebKit where automation is available.',
    'Load the same approved build, content, locale, font assets, and light theme in every browser.',
  ],
  steps: [
    { action: 'Open each page in Windows Chrome at 1366x768.' },
    { action: 'Repeat the page review in Windows Edge at 1366x768.' },
    { action: 'Repeat the page review in Windows Firefox at 1366x768.' },
    { action: 'Repeat the three Windows browser reviews at 1920x1080.' },
    { action: 'Open each page in macOS Safari or Playwright WebKit at 1440x900.' },
    { action: 'Compare the header, navigation, hero, CTA states, product preview, section rails, FAQ, and footer with the approved baseline.' },
    { action: 'Move keyboard focus through every interactive control in each tested browser.' },
    { action: 'Inspect every available pointer-hover state in each tested browser.' },
    { action: 'Activate every visible control in each tested browser.' },
    { action: 'Scroll from the page start to the footer in each tested browser.' },
    { action: 'Record every browser-specific difference with the browser, operating system, viewport, component, and screenshot.' },
  ],
  expectedResult: 'Every supported browser preserves the approved hierarchy, typography, content bounds, CTA states, interaction behavior, and readable product presentation without browser-specific breakage.',
  acceptanceCriteria: [
    'No page-level horizontal overflow or required component outside the viewport.',
    'No browser substitutes an unapproved font, clips text, hides focus, or changes the intended control hierarchy.',
    'Intentional rendering differences remain cosmetic and do not change readability, operation, or meaning.',
    'A Playwright WebKit result is labeled as WebKit automation and is not presented as proof of real Safari or iOS behavior.',
  ],
});

verificationCases.push({
  id: 'UIUX-TC-017',
  title: 'Verify real-mobile orientation, dynamic viewport, and safe-area behavior',
  statusBefore: 'NOT TESTED',
  evidenceStatus: 'NOT TESTED',
  coverageType: 'PLANNED',
  priority: 'P1',
  category: 'Mobile compatibility',
  type: 'Manual',
  automatable: false,
  affectedPages: ['estamp2', 'document-management', 'aadhar-esign'],
  linkedComparisonIds: ['CMP-01', 'CMP-10'],
  linkedActionId: 'UIUX-03',
  evidence: 'The 320px and 390px evidence came from Chromium emulation. Real iOS Safari and Android Chrome, orientation changes, dynamic browser bars, notches, and safe-area insets have not been executed.',
  preconditions: [
    'Use a real iPhone running Safari and a real Android phone running Chrome, or an approved real-device cloud with browser chrome and safe-area behavior enabled.',
    'Keep the mobile Book Demo tray enabled and load the production-equivalent page state.',
  ],
  steps: [
    { action: 'Open each page in iOS Safari at approximately 390x844 in portrait.' },
    { action: 'Scroll down until the Safari browser controls collapse.' },
    { action: 'Scroll up until the Safari browser controls expand.' },
    { action: 'Compare the visible content rectangle with the Book Demo tray and device safe area.' },
    { action: 'Rotate the iPhone to approximately 844x390 landscape.' },
    { action: 'Verify the navigation, hero, CTA, preview, and tray after rotation.' },
    { action: 'Repeat the portrait checks in Android Chrome at 360x800.' },
    { action: 'Repeat the portrait checks in Android Chrome at 412x915.' },
    { action: 'Rotate each Android profile to landscape.' },
    { action: 'Repeat the layout and tray checks in each Android landscape profile.' },
    { action: 'Tap every visible action.' },
    { action: 'Verify that no information or action depends on hover.' },
    { action: 'Focus the first available input if the tested page state exposes one.' },
    { action: 'Inspect virtual-keyboard clearance if an input was available.' },
  ],
  expectedResult: 'The pages remain readable and operable in portrait and landscape while mobile browser controls change height; fixed content respects safe-area insets and never covers visible or focused content.',
  acceptanceCriteria: [
    'Zero intersection between the Book Demo tray and required visible or focused content.',
    'No content is cropped by 100vh-style sizing when browser controls expand or collapse.',
    'Rotation produces no off-screen controls, clipped text, duplicated CTA, or stale layout.',
    'Primary mobile actions remain at least 44px high and no required behavior is hover-only.',
  ],
});

verificationCases.push({
  id: 'UIUX-TC-018',
  title: 'Verify Windows display scaling and resilient font rendering',
  statusBefore: 'NOT TESTED',
  evidenceStatus: 'NOT TESTED',
  coverageType: 'PLANNED',
  priority: 'P1',
  category: 'Typography compatibility',
  type: 'Hybrid',
  automatable: false,
  affectedPages: ['estamp2', 'document-management', 'aadhar-esign'],
  linkedComparisonIds: ['CMP-04', 'CMP-14'],
  linkedActionId: 'UIUX-08',
  evidence: 'Normal-load font checks passed in Chromium, but Windows 100%, 125%, and 150% display scaling, Chrome/Edge/Firefox font rendering, slow font delivery, and approved fallback behavior have not been executed.',
  preconditions: [
    'Use Windows with Chrome, Edge, and Firefox and make 100%, 125%, and 150% display-scale profiles available.',
    'Provide a network-throttling profile and a way to block the Inter font request for the fallback check.',
  ],
  steps: [
    { action: 'Open each page at 1366x768 with Windows display scaling set to 100%.' },
    { action: 'Record the computed font family, size, weight, line height, and letter spacing for every semantic text role.' },
    { action: 'Repeat the layout and typography review at 125% Windows display scaling.' },
    { action: 'Repeat the layout and typography review at 150% Windows display scaling.' },
    { action: 'Repeat the three scaling profiles in Chrome, Edge, and Firefox.' },
    { action: 'Cold-load each page with font requests throttled.' },
    { action: 'Record font swaps, synthetic weights, layout shift, clipping, overlap, and text reflow.' },
    { action: 'Block the Inter font request.' },
    { action: 'Reload each page with the Inter font request blocked.' },
    { action: 'Verify the approved fallback stack keeps every heading, label, CTA, paragraph, and content rail readable and inside its container.' },
  ],
  expectedResult: 'Approved text roles remain readable and stable across Windows scaling and supported browsers; slow or failed font delivery uses the approved fallback without hiding content or breaking the layout.',
  acceptanceCriteria: [
    'Inter weights 400, 500, 600, and 700 load where available, or the approved fallback is used without synthetic or missing emphasis that changes meaning.',
    'Font loading or fallback causes no clipping, overlap, off-screen control, or cumulative layout shift above 0.1.',
    'Typography remains within the approved role scale and body copy remains no wider than 65ch.',
    'All three Windows scaling profiles and all three supported Windows browsers have a recorded result rather than an assumed pass.',
  ],
});

const releaseChecklist = [
  {
    order: 1,
    result: 'FAIL',
    impact: 'STOP RELEASE',
    check: 'CTA and control contrast',
    evidence: 'Named controls measure 2.10-3.76:1 where normal text requires 4.5:1.',
    passCriteria: 'Every default, hover, focus, active, and disabled state is at least 4.5:1 for normal text or 3:1 for qualifying large text.',
    caseIds: ['UIUX-TC-001'],
  },
  {
    order: 2,
    result: 'FAIL',
    impact: 'STOP RELEASE',
    check: 'Responsive component bounds and zoom',
    evidence: 'eStamp FAQ starts at x=-4; eStamp Document ends 23px outside the 320px and 390px viewports. Zoom and text spacing are not yet verified.',
    passCriteria: 'Every required element remains inside the viewport and usable at breakpoint edges, mobile landscape, 200%/400% zoom, and WCAG text spacing.',
    caseIds: ['UIUX-TC-011'],
  },
  {
    order: 3,
    result: 'FAIL',
    impact: 'STOP RELEASE',
    check: 'Fixed mobile Book Demo tray',
    evidence: 'The fixed tray occupies 85px and sits over underlying content at 320px.',
    passCriteria: 'The tray has zero intersection with visible or focused content at 320px and 390px and reserves its height plus the safe-area inset.',
    caseIds: ['UIUX-TC-003'],
  },
  {
    order: 4,
    result: 'FAIL',
    impact: 'STOP RELEASE',
    check: 'Product-preview text and controls',
    evidence: 'Minimum sampled preview text is 5.5px, 2px, and 6px.',
    passCriteria: 'Interactive preview text is at least 14px/20px, or the preview is clearly illustrative, non-focusable, and provides an accessible enlarged view.',
    caseIds: ['UIUX-TC-004'],
  },
  {
    order: 5,
    result: 'FAIL',
    impact: 'FIX BEFORE VISUAL SIGN-OFF',
    check: 'Fonts, hierarchy, styles, and content widths',
    evidence: 'Font loading passes, but pages use up to 20-22 font sizes, up to four family stacks, inconsistent tokens, and an eStamp long-line review.',
    passCriteria: 'Use the approved Inter roles and type scale, 65ch body measure, 16px/24px responsive gutters, aligned content rails, and semantic style tokens.',
    caseIds: ['UIUX-TC-009'],
  },
  {
    order: 6,
    result: 'FAIL',
    impact: 'FIX BEFORE VISUAL SIGN-OFF',
    check: 'CTA component hierarchy',
    evidence: 'Aadhaar uses a black primary CTA instead of its purple product accent, and shared construction varies.',
    passCriteria: 'All pages share button dimensions, weight, padding, radius, and states; only the accessible product accent changes.',
    caseIds: ['UIUX-TC-005'],
  },
  {
    order: 7,
    result: 'FAIL',
    impact: 'FIX BEFORE VISUAL SIGN-OFF',
    check: 'Footer image proportions',
    evidence: 'Shared store badges are distorted by roughly 42% at 768px.',
    passCriteria: 'Rendered aspect ratio differs from the intrinsic ratio by no more than 6%; badges remain uncropped and aligned.',
    caseIds: ['UIUX-TC-002'],
  },
  {
    order: 8,
    result: 'VERIFY',
    impact: 'VERIFY BEFORE RELEASE',
    check: 'Aadhaar mobile images',
    evidence: 'Six images were not confirmed complete at 320px, but no failed request proved a broken asset.',
    passCriteria: 'Every intended image completes when reached, reserves dimensions, and creates no empty slot or visible layout shift.',
    caseIds: ['UIUX-TC-010'],
  },
  {
    order: 9,
    result: 'VERIFY',
    impact: 'VERIFY BEFORE RELEASE',
    check: 'Statistic final values',
    evidence: 'Visible 0 and 0% values may be temporary animation placeholders or valid content.',
    passCriteria: 'Normal and reduced-motion modes both show the approved final values; any legitimate zero is clearly explained.',
    caseIds: ['UIUX-TC-015'],
  },
  {
    order: 10,
    result: 'VERIFY',
    impact: 'NOT TESTED - VERIFY BEFORE RELEASE',
    check: 'Cross-browser, real-mobile, and Windows scaling compatibility',
    evidence: 'Saved evidence covers Chromium 131 only. Edge, Firefox, WebKit/Safari, real iOS/Android, mobile dynamic viewports, safe areas, and Windows display scaling are not tested.',
    passCriteria: 'Run the required browser, operating-system, real-device, orientation, safe-area, and Windows font-scaling matrices with a recorded result for every required combination.',
    caseIds: ['UIUX-TC-016', 'UIUX-TC-017', 'UIUX-TC-018'],
  },
  {
    order: 11,
    result: 'PASS',
    impact: 'KEEP GREEN',
    check: 'Keyboard focus and minimum pointer targets',
    evidence: 'Focus samples passed 80/80 per page; objective 24px targets passed 84/84, 84/84, and 83/83.',
    passCriteria: 'Every control keeps visible focus, no keyboard trap is introduced, and every objective target remains at least 24x24px.',
    caseIds: ['UIUX-TC-012', 'UIUX-TC-013'],
  },
  {
    order: 12,
    result: 'PASS',
    impact: 'KEEP GREEN',
    check: 'Confirmed element self-clipping',
    evidence: 'The finalized analyzer found zero confirmed self-clipping failures.',
    passCriteria: 'No required visible text, media, or control becomes clipped after the fixes.',
    caseIds: ['UIUX-TC-014'],
  },
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function escapeHtml(value) {
  const entities = {
    38: '&amp;',
    60: '&lt;',
    62: '&gt;',
    34: '&quot;',
    39: '&#39;',
  };
  return String(value == null ? '' : value).replace(/[\u0026\u003c\u003e\u0022\u0027]/g, function replace(character) {
    return entities[character.charCodeAt(0)];
  });
}

function escapeMarkdown(value) {
  return String(value == null ? '' : value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function issueKey(issue) {
  const location = issue && issue.location ? issue.location : {};
  return [
    issue && issue.ruleId ? issue.ruleId : 'unknown',
    location.stableKey || location.selector || (issue && issue.title) || 'unknown',
  ].join('|');
}

function uniqueIssues(issues) {
  const map = new Map();
  for (const issue of issues) {
    const key = issueKey(issue);
    if (!map.has(key)) map.set(key, issue);
  }
  return Array.from(map.values());
}

function countRules(issues) {
  const counts = {};
  for (const issue of issues) {
    const rule = issue.ruleId || 'unknown';
    counts[rule] = (counts[rule] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(function sort(a, b) {
    return b[1] - a[1] || a[0].localeCompare(b[0]);
  }));
}

function percent(value) {
  return Math.round(Number(value || 0) * 100) + '%';
}

function formatRatio(issue) {
  const ratio = issue && issue.actual ? Number(issue.actual.ratio) : NaN;
  const required = issue && issue.expected ? Number(issue.expected.minimumRatio) : NaN;
  if (!Number.isFinite(ratio)) return null;
  return ratio.toFixed(2) + ':1' + (Number.isFinite(required) ? ' (needs ' + required + ':1)' : '');
}

function findNamedContrast(audit, definition) {
  const label = definition[0];
  const stableKey = definition[1];
  const issue = asArray(audit.issues).find(function find(item) {
    return item.ruleId === 'color.text-contrast'
      && item.location
      && item.location.stableKey === stableKey;
  });
  if (!issue) return null;
  return {
    label,
    ratio: issue.actual ? issue.actual.ratio : null,
    required: issue.expected ? issue.expected.minimumRatio : null,
    viewport: issue.location && issue.location.viewport ? issue.location.viewport.name : null,
    evidence: formatRatio(issue),
  };
}

function desktopSimilarity(audit) {
  const comparison = audit.comparison;
  if (!comparison) return null;
  const capture = asArray(comparison.captures).find(function find(item) {
    return item.captureKey && item.captureKey.indexOf('desktop::') === 0;
  });
  if (!capture || !capture.tokenProfile) return null;
  return {
    overall: capture.tokenProfile.overallSimilarity,
    categories: Object.fromEntries(asArray(capture.tokenProfile.categories).map(function map(item) {
      return [item.category, item.similarity];
    })),
    note: 'Reference alignment only; this is not a quality score.',
  };
}

function summarizeFindings(definition, audit) {
  const issues = asArray(audit.issues);
  const objectiveRaw = issues.filter(function filter(item) {
    return item.status === 'fail' && item.class !== 'heuristic';
  });
  const reviewRaw = issues.filter(function filter(item) {
    return item.status === 'review' || item.class === 'heuristic';
  });
  const objective = uniqueIssues(objectiveRaw);
  const reviews = uniqueIssues(reviewRaw);
  return {
    rawObjective: objectiveRaw.length,
    rawReview: reviewRaw.length,
    distinctObjective: objective.length,
    distinctReview: reviews.length,
    objectiveByRule: countRules(objective),
    reviewByRule: countRules(reviews),
    namedContrast: asArray(namedContrastKeys[definition.id]).map(function map(item) {
      return findNamedContrast(audit, item);
    }).filter(Boolean),
    imageDistortion: objective.filter(function filter(item) {
      return item.ruleId === 'media.image-distorted';
    }).map(function map(item) {
      return {
        message: item.message,
        viewport: item.location && item.location.viewport ? item.location.viewport.name : null,
        actual: item.actual,
      };
    }),
    imageLoadUnconfirmed: reviews.filter(function filter(item) {
      return item.ruleId === 'media.image-load-unconfirmed';
    }).length,
  };
}

function summarizeCaptures(audit) {
  const captures = asArray(audit.captures);
  return {
    total: captures.length,
    valid: captures.filter(function filter(item) { return item.status === 'valid'; }).length,
    noHorizontalOverflow: captures.filter(function filter(item) {
      return Number(item.metrics && item.metrics.horizontalOverflow || 0) === 0;
    }).length,
    viewports: captures.map(function map(item) {
      return {
        name: item.viewport && item.viewport.name,
        width: item.viewport && item.viewport.width,
        height: item.viewport && item.viewport.height,
        status: item.status,
      };
    }),
  };
}

function summarizePage(definition, audit) {
  const checks = audit.coverage && audit.coverage.checks ? audit.coverage.checks : {};
  return {
    id: definition.id,
    label: definition.label,
    shortLabel: definition.shortLabel,
    role: definition.role,
    url: audit.target && audit.target.url ? audit.target.url : definition.url,
    finalUrl: audit.target && audit.target.finalUrl ? audit.target.finalUrl : definition.url,
    title: audit.target && audit.target.title ? audit.target.title : definition.label,
    browser: audit.target && audit.target.browser ? audit.target.browser : null,
    browserVersion: audit.target && audit.target.browserVersion ? audit.target.browserVersion : null,
    accent: definition.accent,
    note: definition.note,
    verdict: audit.verdict,
    captures: summarizeCaptures(audit),
    findings: summarizeFindings(definition, audit),
    checks: {
      contrast: checks.contrast || null,
      targetSize: checks.targetSize || null,
      focus: checks.focus || null,
      clipping: checks.clipping || null,
      fonts: checks.fonts || null,
      images: checks.images || null,
    },
    comparison: desktopSimilarity(audit),
    artifacts: {
      report: definition.id + '/report.html',
      audit: definition.id + '/audit.json',
      cases: definition.id + '/cases.json',
      screenshots: [
        definition.id + '/screenshots/target-mobile-320-light-page.png',
        definition.id + '/screenshots/target-mobile-light-page.png',
        definition.id + '/screenshots/target-tablet-light-page.png',
        definition.id + '/screenshots/target-desktop-light-page.png',
      ],
    },
  };
}

const pages = pageDefinitions.map(function map(definition) {
  const file = path.join(outputRoot, definition.id, 'audit.json');
  if (!fs.existsSync(file)) throw new Error('Missing required audit: ' + file);
  return summarizePage(definition, readJson(file));
});

const localPages = pages.filter(function filter(page) {
  return page.role === 'Local target';
});

const executedBrowsers = Array.from(new Set(pages.map(function map(page) {
  return [page.browser, page.browserVersion].filter(Boolean).join(' ');
}).filter(Boolean)));

const notTestedCompatibilityCoverage = [
  'Windows Chrome, Edge, and Firefox',
  'macOS Safari and cross-engine WebKit verification',
  'real iOS Safari and Android Chrome',
  'portrait-to-landscape rotation and dynamic mobile browser controls',
  'device safe-area insets and virtual-keyboard clearance where applicable',
  'Windows 100%, 125%, and 150% display scaling',
  'slow and failed web-font delivery with the approved fallback stack',
];

const statusLegend = [
  {
    status: 'MATCH',
    label: 'MATCH / KEEP',
    meaning: 'Verified as aligned or acceptable. Keep it and regression-test it.',
  },
  {
    status: 'PARTIAL MATCH',
    label: 'PARTIAL MATCH / REVIEW',
    meaning: 'The direction is partly aligned, intentionally different, or still needs human verification.',
  },
  {
    status: 'MISMATCH',
    label: 'MISMATCH / FIX',
    meaning: 'A confirmed gap requires a design or implementation change.',
  },
];

const caseStatusLegend = [
  ...statusLegend,
  {
    status: 'NOT TESTED',
    label: 'NOT TESTED / VERIFY',
    meaning: 'This coverage has not been executed. Run the case and record a result before claiming compatibility.',
  },
];

const pageActualOverrides = {
  'CMP-08': {
    estamp2: '36 unique contrast failures; named controls measure 2.10-3.76:1.',
    'document-management': '29 unique contrast failures; named controls measure 3.22-3.76:1.',
    'aadhar-esign': '31 unique contrast failures; named controls measure 2.10-3.76:1.',
  },
  'CMP-12': {
    estamp2: 'Blue primary action matches the eStamp identity.',
    'document-management': 'Green primary action matches the Documents identity.',
    'aadhar-esign': 'Black primary action does not match the purple Aadhaar identity.',
  },
  'CMP-13': {
    estamp2: 'All 24 captured images completed.',
    'document-management': 'All 24 captured images completed.',
    'aadhar-esign': 'Six 320px images require loading verification; no request failure was proven.',
  },
};

function comparisonCell(comparison, pageId) {
  const affected = comparison.affectedPages.includes(pageId);
  const status = affected ? comparison.status : 'MATCH';
  const override = pageActualOverrides[comparison.id] && pageActualOverrides[comparison.id][pageId];
  return {
    status,
    actual: override || (affected ? comparison.local : 'No mismatch applies to this page.'),
    comparisonId: comparison.id,
    actionId: affected ? comparison.linkedActionId : null,
    caseId: comparison.caseId,
  };
}

const comparisonStatusCounts = Object.fromEntries(statusLegend.map(function map(item) {
  return [item.status, statusComparisons.filter(function filter(comparison) {
    return comparison.status === item.status;
  }).length];
}));

const releaseChecklistCounts = Object.fromEntries(['FAIL', 'VERIFY', 'PASS'].map(function map(result) {
  return [result, releaseChecklist.filter(function filter(item) { return item.result === result; }).length];
}));

const model = {
  schemaVersion: '2.2',
  kind: 'dms-uiux-comparison-report',
  generatedAt: new Date().toISOString(),
  reference: pages[0].url,
  targets: localPages.map(function map(page) { return page.url; }),
  scope: {
    themes: ['light'],
    checkpoints: ['page'],
    viewports: ['320x568', '390x844', '768x1024', '1440x900'],
    executedBrowsers,
    compatibilityCoverage: {
      status: 'NOT TESTED',
      coverageType: 'PLANNED',
      items: notTestedCompatibilityCoverage,
    },
    captureCount: pages.reduce(function total(sum, page) { return sum + page.captures.total; }, 0),
    validCaptureCount: pages.reduce(function total(sum, page) { return sum + page.captures.valid; }, 0),
  },
  executiveSummary: {
    recommendation: 'Close the four P0 release blockers first: control contrast, eStamp component bounds and zoom, the mobile conversion tray, and unreadable product-preview text. Then close the P1 font, style, width, CTA, and media fixes and execute the three NOT TESTED compatibility cases before release.',
    outcome: 'The three local pages share the Ledgers navigation, Inter-led typography, product-story structure, and a page canvas that does not overflow. They are not ready for UI/UX sign-off because controls still cross mobile bounds, the fixed tray covers content, preview text is unreadable, and repeated contrast defects remain.',
    strengths: [
      'All 16 captures rendered valid content with no login redirect.',
      'All captures had zero document-level horizontal overflow.',
      'Normal-load font checks passed 48/48 per local page.',
      'Local tested 24px pointer targets, focus samples, and confirmed self-clipping checks passed.',
      'Blue, green, and purple product accents make the three services easy to distinguish.',
    ],
    caution: 'The reference page also has accessibility and asset defects. Match its confidence, hierarchy, depth, and proof - not its defects.',
  },
  statusLegend,
  caseStatusLegend,
  releaseChecklist,
  decisionSummary: {
    releaseDecision: 'FAIL - FIX BEFORE UI/UX SIGN-OFF',
    releaseChecklistCounts,
    mismatchCount: comparisonStatusCounts.MISMATCH,
    partialMatchCount: comparisonStatusCounts['PARTIAL MATCH'],
    matchCount: comparisonStatusCounts.MATCH,
    notTestedCaseCount: verificationCases.filter(function filter(item) {
      return item.statusBefore === 'NOT TESTED';
    }).length,
    releaseBlockerIds: statusComparisons.filter(function filter(item) {
      return item.status === 'MISMATCH' && item.priority === 'P0';
    }).map(function map(item) { return item.id; }),
  },
  pages,
  actions,
  comparisonMatrix,
  statusComparisons: statusComparisons.map(function map(item) {
    return {
      ...item,
      pages: Object.fromEntries(localPages.map(function pageMap(page) {
        return [page.id, comparisonCell(item, page.id)];
      })),
    };
  }),
  verificationCases,
};

model.recommendedDesignSystem = {
  fontFamily: 'Inter with the existing system fallback stack',
  fontWeights: '400 body, 500 supporting emphasis, 600 controls/subheadings, 700 primary headings',
  typeScale: {
    h1Desktop: '36-40px / 1.10',
    h1Mobile: '30-34px / 1.15',
    h2: '26-32px / 1.20',
    body: '16px / 24px',
    small: '13-14px / 20px; never use microcopy as the only source of meaning',
  },
  contentWidth: {
    bodyMeasure: '65ch preferred; keep normal prose within 45-75 characters per line',
    mobileGutter: '16px minimum',
    tabletGutter: '24px minimum',
    desktopRail: 'Centered; 1280px maximum outer container with consistent inner rails',
    alignmentTolerance: '2px between elements that share a rail',
  },
  colors: {
    bluePrimary: '#2563EB (5.17:1 with white)',
    blueStrong: '#1D4ED8 (6.70:1 with white)',
    greenPrimary: '#15803D (5.02:1 with white)',
    greenStrong: '#166534 (7.13:1 with white)',
    purplePrimary: '#7C3AED (5.70:1 with white)',
    purpleStrong: '#6D28D9 (7.10:1 with white)',
    mutedText: '#475569 (7.58:1 on white)',
    strongText: '#0F172A',
  },
  spacing: ['4', '8', '12', '16', '24', '32', '48', '64', '80'],
  radii: {
    control: '8px',
    button: '12px',
    card: '16px',
    pill: '9999px',
  },
  controls: {
    touchHeight: '44px minimum target for primary mobile actions',
    desktopHeight: '40-44px',
    focus: '2px visible ring with at least 3:1 adjacent contrast',
  },
};

model.methodology = {
  engine: 'Standalone Chromium UI/UX audit package',
  evidence: 'Rendered DOM, computed styles, geometry, interaction samples, assets, and full-page screenshots',
  counting: 'Executive finding counts are deduplicated by ruleId plus stable element key; raw counts repeat across viewports.',
  comparison: 'Unrelated page DOMs were not compared element-for-element. Design-token profiles were compared by matching viewport.',
  limitations: [
    'Only the light theme and initial page state were audited.',
    'Executed browser evidence is limited to ' + executedBrowsers.join(', ') + '; Edge, Firefox, WebKit/Safari, and real iOS/Android are NOT TESTED and remain VERIFY items.',
    'Landscape rotation, dynamic mobile browser controls, safe-area insets, Windows display scaling, and slow or failed font delivery are planned checks, not passing evidence.',
    'A visual audit cannot prove task success, business correctness, screen-reader usability, or subjective brand quality.',
    'Complex image/video backgrounds are manual contrast reviews rather than fabricated objective ratios.',
    'The product source for the three live pages is not present in this workspace, so fixes are specified but not applied to the live application.',
  ],
};

function validateTraceability() {
  const actionIds = new Set(actions.map(function map(item) { return item.id; }));
  const comparisonIds = new Set(statusComparisons.map(function map(item) { return item.id; }));
  const caseIds = new Set(verificationCases.map(function map(item) { return item.id; }));
  const checklistOrders = new Set(releaseChecklist.map(function map(item) { return item.order; }));
  if (actionIds.size !== actions.length) throw new Error('Duplicate action ID in combined report.');
  if (comparisonIds.size !== statusComparisons.length) throw new Error('Duplicate comparison ID in combined report.');
  if (caseIds.size !== verificationCases.length) throw new Error('Duplicate verification-case ID in combined report.');
  if (checklistOrders.size !== releaseChecklist.length) throw new Error('Duplicate release-checklist order in combined report.');
  for (const comparison of statusComparisons) {
    if (!caseIds.has(comparison.caseId)) {
      throw new Error('Comparison ' + comparison.id + ' references missing case ' + comparison.caseId + '.');
    }
    if (comparison.linkedActionId && !actionIds.has(comparison.linkedActionId)) {
      throw new Error('Comparison ' + comparison.id + ' references missing action ' + comparison.linkedActionId + '.');
    }
    if (comparison.status === 'MISMATCH' && !comparison.linkedActionId) {
      throw new Error('Mismatch ' + comparison.id + ' must reference a fix action.');
    }
  }
  for (const testCase of verificationCases) {
    if (!['MISMATCH', 'PARTIAL MATCH', 'MATCH', 'NOT TESTED'].includes(testCase.statusBefore)) {
      throw new Error('Case ' + testCase.id + ' has an invalid status.');
    }
    if (!testCase.steps.length || !testCase.expectedResult) {
      throw new Error('Case ' + testCase.id + ' is not runnable.');
    }
    if (testCase.statusBefore === 'NOT TESTED'
      && (testCase.evidenceStatus !== 'NOT TESTED' || testCase.coverageType !== 'PLANNED')) {
      throw new Error('Case ' + testCase.id + ' must remain explicitly NOT TESTED and PLANNED until executed.');
    }
    for (const comparisonId of testCase.linkedComparisonIds) {
      if (!comparisonIds.has(comparisonId)) {
        throw new Error('Case ' + testCase.id + ' references missing comparison ' + comparisonId + '.');
      }
    }
    if (testCase.linkedActionId && !actionIds.has(testCase.linkedActionId)) {
      throw new Error('Case ' + testCase.id + ' references missing action ' + testCase.linkedActionId + '.');
    }
  }
  for (const item of releaseChecklist) {
    if (!['FAIL', 'VERIFY', 'PASS'].includes(item.result)) {
      throw new Error('Checklist item ' + item.order + ' has an invalid result.');
    }
    for (const caseId of item.caseIds) {
      if (!caseIds.has(caseId)) {
        throw new Error('Checklist item ' + item.order + ' references missing case ' + caseId + '.');
      }
    }
  }
}

validateTraceability();

function appendMarkdownStatusDashboard(lines) {
  lines.push('## Read this first: match versus mismatch');
  lines.push('');
  lines.push('**Release decision: ' + model.decisionSummary.releaseDecision + '**');
  lines.push('');
  lines.push('### Simple release gate - process from top to bottom');
  lines.push('');
  lines.push('| Result | Release impact | Check | Current evidence | PASS when | Case |');
  lines.push('|---|---|---|---|---|---|');
  for (const item of releaseChecklist.slice().sort(function sort(a, b) { return a.order - b.order; })) {
    lines.push('| ' + item.result
      + ' | ' + escapeMarkdown(item.impact)
      + ' | ' + escapeMarkdown(item.check)
      + ' | ' + escapeMarkdown(item.evidence)
      + ' | ' + escapeMarkdown(item.passCriteria)
      + ' | ' + item.caseIds.join(', ') + ' |');
  }
  lines.push('');
  lines.push('**Coverage warning:** the saved execution used ' + model.scope.executedBrowsers.join(', ')
    + '. Edge, Firefox, WebKit/Safari, real mobile devices, orientation changes, safe-area behavior, Windows scaling, and font fallback remain **NOT TESTED / VERIFY**.');
  lines.push('');
  lines.push('A green page canvas does not automatically mean every child component fits. The checklist deliberately reports **page width** and **component bounds** as separate checks.');
  lines.push('');
  lines.push('| Status | Meaning | Count |');
  lines.push('|---|---|---:|');
  for (const item of statusLegend) {
    lines.push('| ' + item.label + ' | ' + item.meaning + ' | '
      + comparisonStatusCounts[item.status] + ' |');
  }
  lines.push('');
  lines.push('Process order: complete **MISMATCH / FIX** rows first, then close **PARTIAL MATCH / REVIEW**, and keep **MATCH / KEEP** as regression cases.');
  lines.push('');
  lines.push('### Quick page decision');
  lines.push('');
  lines.push('| Page | Decision | Main reason | Start case |');
  lines.push('|---|---|---|---|');
  lines.push('| Ledgers.cloud | REFERENCE ONLY | Useful visual direction, but it also has accessibility and asset defects. | Do not copy defects |');
  lines.push('| eStamp | MISMATCH / FIX | 36 unique contrast gaps, mobile controls outside the viewport, plus shared tray, preview, and footer problems. | UIUX-TC-001, UIUX-TC-011 |');
  lines.push('| Document Management | MISMATCH / FIX | 29 unique contrast gaps, sparse section rhythm, and shared problems. | UIUX-TC-001 |');
  lines.push('| Aadhaar eSign | MISMATCH / FIX | 31 unique contrast gaps, black CTA inconsistency, shared problems, and six images to verify. | UIUX-TC-001 |');
  lines.push('');
  lines.push('### Clear comparison list');
  lines.push('');
  lines.push('| Status | ID | Area | Affected pages | What is different | Required action | Priority | Case |');
  lines.push('|---|---|---|---|---|---|---|---|');
  const order = { MISMATCH: 0, 'NOT TESTED': 1, 'PARTIAL MATCH': 2, MATCH: 3 };
  const sorted = statusComparisons.slice().sort(function sort(a, b) {
    return order[a.status] - order[b.status]
      || priorityRank(a.priority) - priorityRank(b.priority)
      || a.id.localeCompare(b.id);
  });
  for (const item of sorted) {
    lines.push('| ' + statusLabel(item.status)
      + ' | ' + item.id
      + ' | ' + escapeMarkdown(item.area)
      + ' | ' + escapeMarkdown(item.affectedPages.join(', '))
      + ' | ' + escapeMarkdown(item.gap)
      + ' | ' + escapeMarkdown(item.fix)
      + ' | ' + item.priority
      + ' | ' + item.caseId + ' |');
  }
  lines.push('');
  lines.push('### Per-page status');
  lines.push('');
  lines.push('| Area | eStamp | Document Management | Aadhaar eSign |');
  lines.push('|---|---|---|---|');
  for (const item of statusComparisons) {
    lines.push('| ' + escapeMarkdown(item.area)
      + ' | ' + statusLabel(comparisonCell(item, 'estamp2').status)
      + ' | ' + statusLabel(comparisonCell(item, 'document-management').status)
      + ' | ' + statusLabel(comparisonCell(item, 'aadhar-esign').status) + ' |');
  }
  lines.push('');
}

function appendMarkdownSummary(lines) {
  lines.push('# DMS UI/UX comparison report');
  lines.push('');
  lines.push('Generated: ' + model.generatedAt);
  lines.push('');
  lines.push('Reference: [' + model.reference + '](' + model.reference + ')');
  lines.push('');
  appendMarkdownStatusDashboard(lines);
  lines.push('## Executive decision');
  lines.push('');
  lines.push('**Recommendation:** ' + model.executiveSummary.recommendation);
  lines.push('');
  lines.push(model.executiveSummary.outcome);
  lines.push('');
  lines.push('The report uses **unique component findings** for prioritization. Raw counts repeat the same rendered component across four viewports and are retained only as supporting evidence.');
  lines.push('');
  lines.push('| Page | Role | Valid captures | Unique objective findings | Unique contrast | Image distortion | Unique review items |');
  lines.push('|---|---|---:|---:|---:|---:|---:|');
  for (const page of pages) {
    lines.push('| ' + escapeMarkdown(page.label)
      + ' | ' + escapeMarkdown(page.role)
      + ' | ' + page.captures.valid + '/' + page.captures.total
      + ' | ' + page.findings.distinctObjective
      + ' | ' + (page.findings.objectiveByRule['color.text-contrast'] || 0)
      + ' | ' + (page.findings.objectiveByRule['media.image-distorted'] || 0)
      + ' | ' + page.findings.distinctReview + ' |');
  }
  lines.push('');
  lines.push('These counts are not beauty scores. They identify measurable defects and items requiring review.');
  lines.push('');
  lines.push('### What already works');
  lines.push('');
  for (const item of model.executiveSummary.strengths) lines.push('- ' + item);
  lines.push('');
  lines.push('### Important reference guardrail');
  lines.push('');
  lines.push(model.executiveSummary.caution);
  lines.push('');
  lines.push('The local pages successfully reuse the Ledgers header/footer, Inter-led typography, strong headline hierarchy, and broad product-story pattern. Their blue, green, and purple accents are useful intentional differences, but the eStamp component-bound issue must be fixed.');
  lines.push('');
}

function appendMarkdownActions(lines) {
  lines.push('## Prioritized fix plan');
  lines.push('');
  const sorted = actions.slice().sort(function sort(a, b) {
    return priorityRank(a.priority) - priorityRank(b.priority) || a.id.localeCompare(b.id);
  });
  for (const action of sorted) {
    lines.push('### ' + action.priority + ' - ' + action.id + ': ' + action.title);
    lines.push('');
    lines.push('- **Owner:** ' + action.owner);
    lines.push('- **Scope:** ' + action.scope.join(', '));
    lines.push('- **Finding:** ' + action.finding);
    lines.push('- **Fix:** ' + action.fix);
    lines.push('- **Done when:**');
    for (const criterion of action.acceptance) lines.push('  - ' + criterion);
    lines.push('');
  }
}

function appendMarkdownCases(lines) {
  lines.push('## Consolidated verification cases');
  lines.push('');
  lines.push('Downloadable forms: [JSON](combined-cases.json) | [CSV](combined-cases.csv)');
  lines.push('');
  const order = { MISMATCH: 0, 'PARTIAL MATCH': 1, MATCH: 2 };
  const sorted = verificationCases.slice().sort(function sort(a, b) {
    return order[a.statusBefore] - order[b.statusBefore]
      || priorityRank(a.priority) - priorityRank(b.priority)
      || a.id.localeCompare(b.id);
  });
  for (const testCase of sorted) {
    lines.push('### ' + testCase.id + ' - ' + testCase.title);
    lines.push('');
    lines.push('- **Current status:** ' + statusLabel(testCase.statusBefore));
    if (testCase.coverageType) lines.push('- **Coverage type:** ' + testCase.coverageType);
    if (testCase.evidenceStatus) lines.push('- **Evidence status:** ' + testCase.evidenceStatus);
    lines.push('- **Priority:** ' + testCase.priority);
    lines.push('- **Type:** ' + testCase.type);
    lines.push('- **Affected pages:** ' + testCase.affectedPages.join(', '));
    lines.push('- **Trace:** ' + testCase.linkedComparisonIds.join(', ')
      + (testCase.linkedActionId ? ' -> ' + testCase.linkedActionId : ' -> regression protection'));
    lines.push('- **Evidence:** ' + testCase.evidence);
    lines.push('- **Preconditions:**');
    for (const item of testCase.preconditions) lines.push('  - ' + item);
    lines.push('- **Steps:**');
    testCase.steps.forEach(function each(step, index) {
      lines.push('  ' + (index + 1) + '. ' + step.action);
    });
    lines.push('- **Expected result:** ' + testCase.expectedResult);
    lines.push('- **Acceptance criteria:**');
    for (const item of testCase.acceptanceCriteria) lines.push('  - ' + item);
    lines.push('');
  }
}

function appendMarkdownPages(lines) {
  lines.push('## Page-by-page evidence');
  lines.push('');
  for (const page of pages) {
    lines.push('### ' + page.label);
    lines.push('');
    lines.push(page.note);
    lines.push('');
    lines.push('- URL: [' + page.url + '](' + page.url + ')');
    lines.push('- Captures: ' + page.captures.valid + '/' + page.captures.total + ' valid; '
      + page.captures.noHorizontalOverflow + '/' + page.captures.total + ' with zero page-level horizontal overflow');
    lines.push('- Unique objective findings: ' + page.findings.distinctObjective
      + ' (' + page.findings.rawObjective + ' raw viewport occurrences)');
    lines.push('- Unique review items: ' + page.findings.distinctReview
      + ' (' + page.findings.rawReview + ' raw viewport occurrences)');
    if (page.checks.targetSize) {
      lines.push('- Tested 24px pointer targets: ' + page.checks.targetSize.passed + '/'
        + page.checks.targetSize.tested + ' passed');
    }
    if (page.checks.focus) {
      lines.push('- Tested focus states: ' + page.checks.focus.passed + '/'
        + page.checks.focus.tested + ' passed');
    }
    if (page.checks.clipping) {
      lines.push('- Clipping: ' + page.checks.clipping.failed + ' confirmed failures');
    }
    if (page.findings.namedContrast.length) {
      lines.push('- Representative control contrast: '
        + page.findings.namedContrast.map(function map(item) {
          return item.label + ' ' + item.evidence;
        }).join('; '));
    }
    if (page.findings.imageLoadUnconfirmed) {
      lines.push('- Mobile image review: ' + page.findings.imageLoadUnconfirmed
        + ' unique incomplete-image reviews with no failed request evidence');
    }
    lines.push('');
    lines.push('[Detailed HTML audit](' + page.artifacts.report + ') | '
      + '[Audit JSON](' + page.artifacts.audit + ') | '
      + '[Manual cases](' + page.artifacts.cases + ')');
    lines.push('');
    lines.push('![Desktop screenshot - ' + page.label + '](' + page.artifacts.screenshots[3] + ')');
    lines.push('');
    lines.push('![320px screenshot - ' + page.label + '](' + page.artifacts.screenshots[0] + ')');
    lines.push('');
  }
}

function appendMarkdownComparison(lines) {
  lines.push('## Reference versus local design decisions');
  lines.push('');
  lines.push('| Dimension | Ledgers.cloud reference | Local DMS pages | Recommended decision |');
  lines.push('|---|---|---|---|');
  for (const row of comparisonMatrix) {
    lines.push('| ' + escapeMarkdown(row.dimension)
      + ' | ' + escapeMarkdown(row.reference)
      + ' | ' + escapeMarkdown(row.local)
      + ' | ' + escapeMarkdown(row.decision) + ' |');
  }
  lines.push('');
  lines.push('## Desktop design-token alignment to the reference');
  lines.push('');
  lines.push('These percentages measure visual-token overlap between different pages. They are **alignment indicators, not quality scores**. Low values can be intentional where a product page needs a distinct accent or simpler content density.');
  lines.push('');
  lines.push('| Local page | Font family | Type scale | Palette | Spacing | Radii | Shadows |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const page of localPages) {
    const categories = page.comparison ? page.comparison.categories : {};
    lines.push('| ' + page.label
      + ' | ' + percent(categories['font-family'])
      + ' | ' + percent(categories['type-scale'])
      + ' | ' + percent(categories.palette)
      + ' | ' + percent(categories.spacing)
      + ' | ' + percent(categories.radii)
      + ' | ' + percent(categories.shadows) + ' |');
  }
  lines.push('');
  lines.push('Direction: retain the local product accents, then align shared typography, neutral colors, spacing, button construction, radii, and section rhythm.');
  lines.push('');
}

function appendMarkdownSystem(lines) {
  const system = model.recommendedDesignSystem;
  lines.push('## Recommended shared design system');
  lines.push('');
  lines.push('- **Typeface:** ' + system.fontFamily);
  lines.push('- **Font weights:** ' + system.fontWeights);
  lines.push('- **Type scale:** desktop H1 ' + system.typeScale.h1Desktop
    + '; mobile H1 ' + system.typeScale.h1Mobile
    + '; H2 ' + system.typeScale.h2
    + '; body ' + system.typeScale.body
    + '; small ' + system.typeScale.small);
  lines.push('- **Content width:** body copy ' + system.contentWidth.bodyMeasure
    + '; mobile gutter ' + system.contentWidth.mobileGutter
    + '; tablet gutter ' + system.contentWidth.tabletGutter
    + '; desktop rail ' + system.contentWidth.desktopRail
    + '; alignment tolerance ' + system.contentWidth.alignmentTolerance);
  lines.push('- **Spacing:** ' + system.spacing.join(', ') + 'px');
  lines.push('- **Radii:** controls ' + system.radii.control
    + '; buttons ' + system.radii.button
    + '; cards ' + system.radii.card
    + '; pills ' + system.radii.pill);
  lines.push('- **Controls:** ' + system.controls.touchHeight
    + '; desktop ' + system.controls.desktopHeight
    + '; focus ' + system.controls.focus);
  lines.push('');
  lines.push('| Semantic color | Recommendation |');
  lines.push('|---|---|');
  for (const entry of Object.entries(system.colors)) {
    lines.push('| ' + entry[0] + ' | ' + entry[1] + ' |');
  }
  lines.push('');
  lines.push('### Implementation starting point');
  lines.push('');
  lines.push('~~~css');
  lines.push(':root {');
  lines.push('  --action-blue: #2563eb;');
  lines.push('  --action-green: #15803d;');
  lines.push('  --action-purple: #7c3aed;');
  lines.push('  --text-strong: #0f172a;');
  lines.push('  --text-muted: #475569;');
  lines.push('  --radius-button: 12px;');
  lines.push('  --content-max: 1280px;');
  lines.push('  --copy-max: 65ch;');
  lines.push('}');
  lines.push('.page-shell { width: min(var(--content-max), calc(100% - 32px)); margin-inline: auto; }');
  lines.push('.prose { max-width: var(--copy-max); }');
  lines.push('.primary-action { min-height: 44px; padding: 12px 20px; border-radius: var(--radius-button); }');
  lines.push('.store-badge img { width: auto; height: 36px; object-fit: contain; }');
  lines.push('@media (max-width: 767px) {');
  lines.push('  main { padding-bottom: calc(85px + env(safe-area-inset-bottom)); }');
  lines.push('}');
  lines.push('~~~');
  lines.push('');
}

function appendMarkdownMethod(lines) {
  lines.push('## Method and limitations');
  lines.push('');
  lines.push('- Engine: ' + model.methodology.engine);
  lines.push('- Evidence: ' + model.methodology.evidence);
  lines.push('- Counting: ' + model.methodology.counting);
  lines.push('- Comparison: ' + model.methodology.comparison);
  for (const limitation of model.methodology.limitations) lines.push('- ' + limitation);
  lines.push('');
  lines.push('Standards references: [WCAG contrast minimum](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum), [WCAG target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum), and [WCAG reflow](https://www.w3.org/WAI/WCAG21/Understanding/reflow).');
  lines.push('');
}

function renderMarkdown() {
  const lines = [];
  appendMarkdownSummary(lines);
  appendMarkdownCases(lines);
  appendMarkdownActions(lines);
  appendMarkdownPages(lines);
  appendMarkdownComparison(lines);
  appendMarkdownSystem(lines);
  appendMarkdownMethod(lines);
  return lines.join('\n') + '\n';
}

function htmlAttribute(name, value) {
  const quote = String.fromCharCode(39);
  return ' ' + name + '=' + quote + escapeHtml(value) + quote;
}

function priorityClass(priority) {
  return priority === 'P0' ? 'p0' : priority === 'P1' ? 'p1' : 'p2';
}

function priorityRank(priority) {
  if (priority === 'P0') return 0;
  if (priority === 'P1') return 1;
  if (priority === 'P2') return 2;
  return 3;
}

function statusClass(status) {
  if (status === 'MATCH') return 'match';
  if (status === 'PARTIAL MATCH') return 'partial';
  if (status === 'NOT TESTED') return 'not-tested';
  return 'mismatch';
}

function statusLabel(status) {
  if (status === 'MATCH') return 'MATCH / KEEP';
  if (status === 'PARTIAL MATCH') return 'PARTIAL MATCH / REVIEW';
  if (status === 'NOT TESTED') return 'NOT TESTED / VERIFY';
  return 'MISMATCH / FIX';
}

function renderStatusBadge(status) {
  return '<span' + htmlAttribute('class', 'status-badge ' + statusClass(status))
    + '>' + escapeHtml(statusLabel(status)) + '</span>';
}

function releaseResultClass(result) {
  if (result === 'PASS') return 'pass';
  if (result === 'VERIFY') return 'verify';
  return 'fail';
}

function renderReleaseChecklistHtml() {
  const rows = releaseChecklist.slice().sort(function sort(a, b) {
    return a.order - b.order;
  }).map(function map(item) {
    const caseLinks = item.caseIds.map(function caseMap(caseId) {
      return '<a href=#case-' + escapeHtml(caseId) + '>' + escapeHtml(caseId) + '</a>';
    }).join(' ');
    return [
      '<tr>',
      '<td><span' + htmlAttribute('class', 'gate-result ' + releaseResultClass(item.result))
        + '>' + escapeHtml(item.result) + '</span></td>',
      '<td><strong>' + escapeHtml(item.impact) + '</strong></td>',
      '<th>' + escapeHtml(item.check) + '</th>',
      '<td>' + escapeHtml(item.evidence) + '</td>',
      '<td>' + escapeHtml(item.passCriteria) + '</td>',
      '<td class=gate-cases>' + caseLinks + '</td>',
      '</tr>',
    ].join('');
  }).join('');
  return [
    '<div class=gate-counts>',
    '<div class=fail><strong>' + releaseChecklistCounts.FAIL + '</strong><span>FAIL / FIX</span></div>',
    '<div class=verify><strong>' + releaseChecklistCounts.VERIFY + '</strong><span>VERIFY</span></div>',
    '<div class=pass><strong>' + releaseChecklistCounts.PASS + '</strong><span>PASS / KEEP</span></div>',
    '</div>',
    '<div class=table-wrap><table class=release-checklist>',
    '<thead><tr><th>Result</th><th>Release impact</th><th>Check</th><th>Current evidence</th><th>PASS when</th><th>Case</th></tr></thead>',
    '<tbody>' + rows + '</tbody></table></div>',
    '<p class=gate-note><strong>Important:</strong> page canvas width and child-component bounds are separate checks. A page can have no document scrollbar while one control still sits outside the viewport.</p>',
  ].join('');
}

function renderComparisonCard(comparison) {
  const action = comparison.linkedActionId
    ? '<a class=trace-chip href=#action-' + escapeHtml(comparison.linkedActionId) + '>'
      + escapeHtml(comparison.linkedActionId) + '</a>'
    : '<span class=trace-chip>Regression only</span>';
  return [
    '<article' + htmlAttribute('class', 'comparison-card ' + statusClass(comparison.status))
      + htmlAttribute('id', 'comparison-' + comparison.id) + '>',
    '<div class=comparison-head><div>' + renderStatusBadge(comparison.status)
      + '<code>' + escapeHtml(comparison.id) + '</code></div>',
    '<span' + htmlAttribute('class', 'priority ' + priorityClass(comparison.priority))
      + '>' + escapeHtml(comparison.priority) + '</span></div>',
    '<h3>' + escapeHtml(comparison.area) + '</h3>',
    '<p class=affected><strong>Affected:</strong> ' + escapeHtml(comparison.affectedPages.join(', ')) + '</p>',
    '<dl class=plain-compare>',
    '<div><dt>Reference / expected</dt><dd>' + escapeHtml(comparison.reference) + '</dd></div>',
    '<div><dt>Local actual</dt><dd>' + escapeHtml(comparison.local) + '</dd></div>',
    '<div><dt>What is different</dt><dd>' + escapeHtml(comparison.gap) + '</dd></div>',
    '<div><dt>Required action</dt><dd>' + escapeHtml(comparison.fix) + '</dd></div>',
    '</dl>',
    '<div class=trace-row><span>Trace:</span>' + action
      + '<a class=trace-chip href=#case-' + escapeHtml(comparison.caseId) + '>'
      + escapeHtml(comparison.caseId) + '</a></div>',
    '</article>',
  ].join('');
}

function renderLegendHtml() {
  return '<div class=status-legend>' + statusLegend.map(function map(item) {
    return '<div' + htmlAttribute('class', 'legend-item ' + statusClass(item.status)) + '>'
      + renderStatusBadge(item.status) + '<p>' + escapeHtml(item.meaning) + '</p></div>';
  }).join('') + '</div>';
}

function renderStatusGroup(status, open) {
  const items = statusComparisons.filter(function filter(item) {
    return item.status === status;
  }).sort(function sort(a, b) {
    return priorityRank(a.priority) - priorityRank(b.priority) || a.id.localeCompare(b.id);
  });
  const openAttribute = open ? ' open' : '';
  return [
    '<details' + htmlAttribute('class', 'status-group ' + statusClass(status)) + openAttribute + '>',
    '<summary>' + renderStatusBadge(status) + '<strong>' + items.length
      + ' comparison items</strong><span>' + (open ? 'Start here' : 'Open to review') + '</span></summary>',
    '<div class=comparison-grid>' + items.map(renderComparisonCard).join('') + '</div>',
    '</details>',
  ].join('');
}

function renderMatrixCell(comparison, pageId) {
  const cell = comparisonCell(comparison, pageId);
  const actionLink = cell.actionId
    ? '<a href=#action-' + escapeHtml(cell.actionId) + '>' + escapeHtml(cell.actionId) + '</a>'
    : '';
  return [
    '<td' + htmlAttribute('class', 'matrix-cell ' + statusClass(cell.status)) + '>',
    renderStatusBadge(cell.status),
    '<p>' + escapeHtml(cell.actual) + '</p>',
    '<div class=cell-links>' + actionLink,
    '<a href=#case-' + escapeHtml(cell.caseId) + '>' + escapeHtml(cell.caseId) + '</a></div>',
    '</td>',
  ].join('');
}

function renderPerPageStatusMatrix() {
  const statusOrder = { MISMATCH: 0, 'PARTIAL MATCH': 1, MATCH: 2 };
  const rows = statusComparisons.slice().sort(function sort(a, b) {
    return statusOrder[a.status] - statusOrder[b.status]
      || priorityRank(a.priority) - priorityRank(b.priority)
      || a.id.localeCompare(b.id);
  }).map(function map(comparison) {
    return [
      '<tr>',
      '<th><a href=#comparison-' + escapeHtml(comparison.id) + '>' + escapeHtml(comparison.id)
        + '</a><span>' + escapeHtml(comparison.area) + '</span></th>',
      '<td class=reference-cell>' + escapeHtml(comparison.reference) + '</td>',
      renderMatrixCell(comparison, 'estamp2'),
      renderMatrixCell(comparison, 'document-management'),
      renderMatrixCell(comparison, 'aadhar-esign'),
      '</tr>',
    ].join('');
  }).join('');
  return [
    '<div class=table-wrap><table class=status-matrix>',
    '<thead><tr><th>Area</th><th>Reference / expected</th><th>eStamp</th><th>Document Management</th><th>Aadhaar eSign</th></tr></thead>',
    '<tbody>' + rows + '</tbody></table></div>',
  ].join('');
}

function renderActionHtml(action) {
  return [
    '<article' + htmlAttribute('class', 'action-card ' + priorityClass(action.priority))
      + htmlAttribute('id', 'action-' + action.id) + '>',
    '<div class=action-head><span' + htmlAttribute('class', 'priority ' + priorityClass(action.priority)) + '>'
      + escapeHtml(action.priority) + '</span><code>' + escapeHtml(action.id) + '</code></div>',
    '<h3>' + escapeHtml(action.title) + '</h3>',
    '<p><strong>Finding.</strong> ' + escapeHtml(action.finding) + '</p>',
    '<p><strong>Fix.</strong> ' + escapeHtml(action.fix) + '</p>',
    '<dl class=owner><div><dt>Owner</dt><dd>' + escapeHtml(action.owner)
      + '</dd></div><div><dt>Scope</dt><dd>' + escapeHtml(action.scope.join(', ')) + '</dd></div></dl>',
    '<details><summary>Acceptance criteria</summary><ul>'
      + action.acceptance.map(function map(item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('')
      + '</ul></details>',
    '</article>',
  ].join('');
}

function renderCaseHtml(testCase) {
  const comparisonLinks = testCase.linkedComparisonIds.map(function map(id) {
    return '<a class=trace-chip href=#comparison-' + escapeHtml(id) + '>' + escapeHtml(id) + '</a>';
  }).join('');
  const actionLink = testCase.linkedActionId
    ? '<a class=trace-chip href=#action-' + escapeHtml(testCase.linkedActionId) + '>'
      + escapeHtml(testCase.linkedActionId) + '</a>'
    : '<span class=trace-chip>Regression protection</span>';
  const coverageLine = testCase.coverageType || testCase.evidenceStatus
    ? '<p class=affected><strong>Coverage:</strong> '
      + escapeHtml([testCase.evidenceStatus, testCase.coverageType].filter(Boolean).join(' / '))
      + '</p>'
    : '';
  return [
    '<article class=case-card' + htmlAttribute('id', 'case-' + testCase.id) + '>',
    '<div class=case-head><div>' + renderStatusBadge(testCase.statusBefore)
      + '<code>' + escapeHtml(testCase.id) + '</code></div>',
    '<div><span' + htmlAttribute('class', 'priority ' + priorityClass(testCase.priority))
      + '>' + escapeHtml(testCase.priority) + '</span><span class=case-type>'
      + escapeHtml(testCase.type) + '</span></div></div>',
    '<h3>' + escapeHtml(testCase.title) + '</h3>',
    '<p class=affected><strong>Pages:</strong> ' + escapeHtml(testCase.affectedPages.join(', ')) + '</p>',
    coverageLine,
    '<div class=case-evidence><strong>Evidence</strong><p>' + escapeHtml(testCase.evidence) + '</p></div>',
    '<details><summary>Preconditions and atomic steps</summary>',
    '<h4>Preconditions</h4><ul>'
      + testCase.preconditions.map(function map(item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('')
      + '</ul><h4>Steps</h4><ol>'
      + testCase.steps.map(function map(item) { return '<li>' + escapeHtml(item.action) + '</li>'; }).join('')
      + '</ol></details>',
    '<div class=expected><strong>Expected result</strong><p>' + escapeHtml(testCase.expectedResult) + '</p></div>',
    '<details><summary>Acceptance criteria</summary><ul>'
      + testCase.acceptanceCriteria.map(function map(item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('')
      + '</ul></details>',
    '<div class=trace-row><span>Trace:</span>' + comparisonLinks + actionLink + '</div>',
    '</article>',
  ].join('');
}

function renderRulePills(page) {
  return Object.entries(page.findings.objectiveByRule).map(function map(entry) {
    const label = entry[0] === 'color.text-contrast' ? 'Contrast'
      : entry[0] === 'media.image-distorted' ? 'Image distortion'
        : entry[0] === 'interaction.target-size' ? 'Target size'
          : entry[0] === 'media.asset-load-failed' ? 'Asset load'
            : entry[0];
    return '<span class=rule-pill><strong>' + entry[1] + '</strong> ' + escapeHtml(label) + '</span>';
  }).join('');
}

function renderContrastEvidence(page) {
  if (!page.findings.namedContrast.length) {
    return '<p class=muted>No named local CTA contrast sample is applicable to the reference page.</p>';
  }
  return '<div class=contrast-list>' + page.findings.namedContrast.map(function map(item) {
    return '<div><span>' + escapeHtml(item.label) + '</span><strong>' + escapeHtml(item.evidence)
      + '</strong><small>' + escapeHtml(item.viewport || '') + '</small></div>';
  }).join('') + '</div>';
}

function renderPageCard(page) {
  const target = page.checks.targetSize;
  const focus = page.checks.focus;
  const clipping = page.checks.clipping;
  const extraReview = page.findings.imageLoadUnconfirmed
    ? '<div class=notice><strong>Manual mobile image check:</strong> '
      + page.findings.imageLoadUnconfirmed
      + ' unique images were not confirmed complete, but no request failure proved them broken.</div>'
    : '';
  return [
    '<article class=page-card' + htmlAttribute('style', '--accent:' + page.accent) + '>',
    '<div class=page-card-head><div><span class=eyebrow>' + escapeHtml(page.role)
      + '</span><h3>' + escapeHtml(page.label) + '</h3></div>',
    '<span' + htmlAttribute('class', 'verdict ' + (page.verdict === 'pass' ? 'pass' : 'fail'))
      + '>' + escapeHtml(page.verdict) + '</span></div>',
    '<p>' + escapeHtml(page.note) + '</p>',
    '<div class=page-metrics>',
    '<div><strong>' + page.findings.distinctObjective + '</strong><span>unique objective</span></div>',
    '<div><strong>' + page.findings.distinctReview + '</strong><span>unique review</span></div>',
    '<div><strong>' + page.captures.valid + '/' + page.captures.total + '</strong><span>valid captures</span></div>',
    '<div><strong>' + page.captures.noHorizontalOverflow + '/' + page.captures.total
      + '</strong><span>no horizontal overflow</span></div>',
    '</div>',
    '<div class=rule-pills>' + renderRulePills(page) + '</div>',
    '<h4>Representative interactive contrast</h4>',
    renderContrastEvidence(page),
    '<div class=check-strip>',
    target ? '<span><strong>' + target.passed + '/' + target.tested + '</strong> 24px targets passed</span>' : '',
    focus ? '<span><strong>' + focus.passed + '/' + focus.tested + '</strong> focus samples passed</span>' : '',
    clipping ? '<span><strong>' + clipping.failed + '</strong> clipping failures</span>' : '',
    '</div>',
    extraReview,
    '<div class=artifact-links>',
    '<a' + htmlAttribute('href', page.artifacts.report) + '>Detailed report</a>',
    '<a' + htmlAttribute('href', page.artifacts.audit) + '>Audit JSON</a>',
    '<a' + htmlAttribute('href', page.artifacts.cases) + '>Manual cases</a>',
    '<a' + htmlAttribute('href', page.url) + '>Live URL</a>',
    '</div>',
    '</article>',
  ].join('');
}

function screenshotLabel(pathValue) {
  if (pathValue.indexOf('mobile-320') !== -1) return 'Mobile 320';
  if (pathValue.indexOf('mobile-light') !== -1) return 'Mobile 390';
  if (pathValue.indexOf('tablet') !== -1) return 'Tablet 768';
  return 'Desktop 1440';
}

function renderGallery(page) {
  const screenshots = page.artifacts.screenshots.map(function map(screenshot) {
    const label = screenshotLabel(screenshot);
    return [
      '<figure class=shot>',
      '<a' + htmlAttribute('href', screenshot) + '>',
      '<img' + htmlAttribute('src', screenshot)
        + htmlAttribute('alt', label + ' full-page capture of ' + page.label)
        + ' loading=lazy>',
      '</a>',
      '<figcaption>' + escapeHtml(label) + '</figcaption>',
      '</figure>',
    ].join('');
  }).join('');
  return [
    '<details class=gallery>',
    '<summary><span>' + escapeHtml(page.label) + '</span><small>4 full-page captures</small></summary>',
    '<div class=shot-grid>' + screenshots + '</div>',
    '</details>',
  ].join('');
}

function renderTokenTable() {
  const categories = ['font-family', 'type-scale', 'palette', 'spacing', 'radii', 'shadows'];
  const heading = categories.map(function map(category) {
    return '<th>' + escapeHtml(category.replace('-', ' ')) + '</th>';
  }).join('');
  const rows = localPages.map(function map(page) {
    const values = page.comparison ? page.comparison.categories : {};
    return '<tr><th>' + escapeHtml(page.label) + '</th>'
      + categories.map(function value(category) {
        return '<td>' + percent(values[category]) + '</td>';
      }).join('') + '</tr>';
  }).join('');
  return '<div class=table-wrap><table><thead><tr><th>Local page</th>' + heading
    + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function renderComparisonMatrix() {
  const rows = comparisonMatrix.map(function map(row) {
    return '<tr><th>' + escapeHtml(row.dimension) + '</th><td>'
      + escapeHtml(row.reference) + '</td><td>' + escapeHtml(row.local)
      + '</td><td><strong>' + escapeHtml(row.decision) + '</strong></td></tr>';
  }).join('');
  return '<div class=table-wrap><table><thead><tr><th>Dimension</th><th>Ledgers.cloud reference</th>'
    + '<th>Local DMS pages</th><th>Recommended decision</th></tr></thead><tbody>'
    + rows + '</tbody></table></div>';
}

function renderSystemHtml() {
  const system = model.recommendedDesignSystem;
  const swatches = [
    ['Blue', '#2563EB', '5.17:1'],
    ['Blue strong', '#1D4ED8', '6.70:1'],
    ['Green', '#15803D', '5.02:1'],
    ['Green strong', '#166534', '7.13:1'],
    ['Purple', '#7C3AED', '5.70:1'],
    ['Purple strong', '#6D28D9', '7.10:1'],
    ['Muted text', '#475569', '7.58:1'],
    ['Strong text', '#0F172A', '17.85:1'],
  ].map(function map(item) {
    return '<div class=swatch><span' + htmlAttribute('style', 'background:' + item[1])
      + '></span><div><strong>' + item[0] + '</strong><code>' + item[1]
      + '</code><small>' + item[2] + ' on white</small></div></div>';
  }).join('');
  return [
    '<div class=system-grid>',
    '<article><span class=eyebrow>Typography</span><h3>One calm scale</h3>',
    '<p><strong>' + escapeHtml(system.fontFamily) + '</strong></p>',
    '<dl class=spec-list>',
    '<div><dt>Weights</dt><dd>' + escapeHtml(system.fontWeights) + '</dd></div>',
    '<div><dt>Desktop H1</dt><dd>' + system.typeScale.h1Desktop + '</dd></div>',
    '<div><dt>Mobile H1</dt><dd>' + system.typeScale.h1Mobile + '</dd></div>',
    '<div><dt>H2</dt><dd>' + system.typeScale.h2 + '</dd></div>',
    '<div><dt>Body</dt><dd>' + system.typeScale.body + '</dd></div>',
    '<div><dt>Small</dt><dd>' + system.typeScale.small + '</dd></div>',
    '<div><dt>Body measure</dt><dd>' + escapeHtml(system.contentWidth.bodyMeasure) + '</dd></div>',
    '</dl></article>',
    '<article><span class=eyebrow>Components</span><h3>Shared construction</h3>',
    '<dl class=spec-list>',
    '<div><dt>Touch action</dt><dd>' + system.controls.touchHeight + '</dd></div>',
    '<div><dt>Desktop action</dt><dd>' + system.controls.desktopHeight + '</dd></div>',
    '<div><dt>Focus</dt><dd>' + system.controls.focus + '</dd></div>',
    '<div><dt>Gutters</dt><dd>' + escapeHtml(system.contentWidth.mobileGutter)
      + ' mobile / ' + escapeHtml(system.contentWidth.tabletGutter) + ' tablet</dd></div>',
    '<div><dt>Desktop rail</dt><dd>' + escapeHtml(system.contentWidth.desktopRail) + '</dd></div>',
    '<div><dt>Spacing</dt><dd>' + system.spacing.join(', ') + 'px</dd></div>',
    '<div><dt>Radii</dt><dd>8 control / 12 button / 16 card / full pill</dd></div>',
    '</dl></article>',
    '</div>',
    '<div class=swatches>' + swatches + '</div>',
    '<pre><code>:root {\n  --action-blue: #2563eb;\n  --action-green: #15803d;\n  --action-purple: #7c3aed;\n  --text-strong: #0f172a;\n  --text-muted: #475569;\n  --radius-button: 12px;\n  --content-max: 1280px;\n  --copy-max: 65ch;\n}\n\n.page-shell {\n  width: min(var(--content-max), calc(100% - 32px));\n  margin-inline: auto;\n}\n\n.prose { max-width: var(--copy-max); }\n\n.primary-action {\n  min-height: 44px;\n  padding: 12px 20px;\n  border-radius: var(--radius-button);\n}\n\n.store-badge img {\n  width: auto;\n  height: 36px;\n  object-fit: contain;\n}\n\n@media (max-width: 767px) {\n  main { padding-bottom: calc(85px + env(safe-area-inset-bottom)); }\n}</code></pre>',
  ].join('');
}

function baseStyles() {
  return [
    ':root{--ink:#0f172a;--muted:#475569;--line:#dbe3ef;--soft:#f4f7fb;--blue:#2563eb;--navy:#07152f;--green:#15803d;--amber:#b45309;--red:#b42318}',
    '*{box-sizing:border-box}',
    'html{scroll-behavior:smooth}',
    'body{margin:0;background:#f8fafc;color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;line-height:1.6}',
    'a{color:#1d4ed8;text-underline-offset:3px}',
    'a:hover{text-decoration-thickness:2px}',
    'img{max-width:100%;display:block}',
    '.shell{width:min(1180px,calc(100% - 40px));margin:0 auto}',
    '.hero{position:relative;overflow:hidden;background:radial-gradient(circle at 85% 5%,#234ea8 0,transparent 34%),radial-gradient(circle at 5% 90%,#0b6b61 0,transparent 32%),var(--navy);color:#fff;padding:72px 0 64px}',
    '.hero .shell{position:relative;z-index:1}',
    '.kicker,.eyebrow{display:block;color:#4f71ff;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}',
    '.hero .kicker{color:#8fb2ff}',
    'h1,h2,h3,h4,p{margin-top:0}',
    'h1{max-width:850px;margin-bottom:20px;font-size:clamp(38px,6vw,68px);line-height:1.04;letter-spacing:-.045em}',
    '.lede{max-width:780px;color:#cbd5e1;font-size:19px;line-height:1.7}',
    '.hero-meta{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}',
    '.hero-meta span{border:1px solid rgba(255,255,255,.22);border-radius:999px;background:rgba(255,255,255,.08);padding:7px 12px;font-size:13px}',
    '.jump{display:flex;flex-wrap:wrap;gap:8px;margin-top:30px}',
    '.jump a{border-radius:10px;background:#fff;color:#0f172a;padding:10px 14px;font-size:13px;font-weight:750;text-decoration:none}',
    'main section{padding:72px 0}',
    'main section:nth-child(even){background:#fff}',
    '.section-head{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,460px);gap:36px;align-items:end;margin-bottom:32px}',
    '.section-head h2{margin:6px 0 0;font-size:clamp(29px,4vw,44px);line-height:1.12;letter-spacing:-.035em}',
    '.section-head p{margin:0;color:var(--muted)}',
    '.decision{border-left:5px solid #f59e0b;border-radius:16px;background:#fffbeb;padding:24px 26px;margin-bottom:28px}',
    '.decision strong{display:block;font-size:19px;margin-bottom:4px}',
    '.metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}',
    '.metric{border:1px solid var(--line);border-radius:16px;background:#fff;padding:20px;box-shadow:0 10px 30px rgba(15,23,42,.05)}',
    '.metric strong{display:block;font-size:30px;line-height:1.1}',
    '.metric span{display:block;color:var(--muted);font-size:13px;margin-top:5px}',
    '.two-col{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-top:24px}',
    '.panel{border:1px solid var(--line);border-radius:18px;background:#fff;padding:24px}',
    '.panel h3{margin:4px 0 12px;font-size:21px}',
    '.panel ul{margin:0;padding-left:20px}',
  ].join('');
}

function componentStyles() {
  return [
    '.release-banner{display:grid;grid-template-columns:280px 1fr;gap:24px;align-items:center;border:2px solid #dc2626;border-radius:16px;background:#fef2f2;padding:20px 22px;margin-bottom:18px}.release-banner div span{display:block;color:#991b1b;font-size:11px;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.release-banner div strong{display:block;color:#7f1d1d;font-size:21px}.release-banner p{margin:0;color:#7f1d1d}',
    '.gate-counts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:14px 0}.gate-counts div{border:1px solid;border-radius:14px;padding:16px}.gate-counts strong{display:block;font-size:28px;line-height:1}.gate-counts span{display:block;margin-top:7px;font-size:11px;font-weight:900;letter-spacing:.08em}.gate-counts .fail{border-color:#fca5a5;background:#fef2f2;color:#7f1d1d}.gate-counts .verify{border-color:#fcd34d;background:#fffbeb;color:#78350f}.gate-counts .pass{border-color:#86efac;background:#f0fdf4;color:#14532d}',
    '.release-checklist{min-width:1180px}.release-checklist tbody th{min-width:180px}.release-checklist td:nth-child(4),.release-checklist td:nth-child(5){min-width:270px}.gate-result{display:inline-flex;border:1px solid;border-radius:999px;padding:5px 9px;font-size:10px;font-weight:900;letter-spacing:.06em}.gate-result.fail{border-color:#fca5a5;background:#fee2e2;color:#7f1d1d}.gate-result.verify{border-color:#fcd34d;background:#fef3c7;color:#78350f}.gate-result.pass{border-color:#86efac;background:#dcfce7;color:#14532d}.gate-cases{white-space:nowrap}.gate-cases a{display:inline-block;margin:2px 4px 2px 0;font-size:11px;font-weight:800}.gate-note{border-left:5px solid #2563eb;border-radius:10px;background:#eff6ff;color:#1e3a8a;padding:12px 14px;font-size:13px}',
    '.status-counts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:18px 0}.status-counts div{border:1px solid;border-radius:14px;padding:18px}.status-counts strong{display:block;font-size:30px;line-height:1}.status-counts span{display:block;margin-top:7px;font-size:11px;font-weight:900;letter-spacing:.08em}.status-counts .mismatch{border-color:#fca5a5;background:#fef2f2;color:#7f1d1d}.status-counts .partial{border-color:#fcd34d;background:#fffbeb;color:#78350f}.status-counts .match{border-color:#86efac;background:#f0fdf4;color:#14532d}',
    '.status-legend{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:18px 0 30px}.legend-item{border-left:5px solid;border-radius:12px;background:#fff;padding:15px}.legend-item.match{border-color:#16a34a}.legend-item.partial{border-color:#d97706}.legend-item.mismatch{border-color:#dc2626}.legend-item p{margin:8px 0 0;color:var(--muted);font-size:12px}',
    '.status-badge{display:inline-flex;align-items:center;border:1px solid;border-radius:999px;padding:4px 9px;font-size:10px;font-weight:900;letter-spacing:.04em;white-space:nowrap}.status-badge.match{border-color:#86efac;background:#dcfce7;color:#14532d}.status-badge.partial{border-color:#fcd34d;background:#fef3c7;color:#78350f}.status-badge.mismatch{border-color:#fca5a5;background:#fee2e2;color:#7f1d1d}.status-badge.not-tested{border-color:#93c5fd;background:#dbeafe;color:#1e3a8a}',
    '.reference-tag{display:inline-flex;border:1px solid #94a3b8;border-radius:999px;background:#f1f5f9;color:#334155;padding:4px 9px;font-size:10px;font-weight:900}.quick-decision td,.quick-decision th{vertical-align:middle}',
    '.status-group{border:1px solid var(--line);border-radius:16px;background:#fff;margin:12px 0;overflow:hidden}.status-group>summary{display:flex;align-items:center;gap:12px;cursor:pointer;padding:16px 18px}.status-group>summary strong{font-size:14px}.status-group>summary span:last-child{margin-left:auto;color:var(--muted);font-size:11px}.status-group.mismatch{border-color:#fca5a5}.status-group.partial{border-color:#fcd34d}.status-group.match{border-color:#86efac}',
    '.comparison-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;border-top:1px solid var(--line);padding:14px;background:#f8fafc}.comparison-card{border:1px solid var(--line);border-left:5px solid;border-radius:12px;background:#fff;padding:18px}.comparison-card.mismatch{border-left-color:#dc2626}.comparison-card.partial{border-left-color:#d97706}.comparison-card.match{border-left-color:#16a34a}.comparison-head{display:flex;justify-content:space-between;gap:12px}.comparison-head>div{display:flex;flex-wrap:wrap;gap:7px;align-items:center}.comparison-card h3{margin:12px 0 6px;font-size:19px}.affected{color:#475569;font-size:12px}',
    '.plain-compare{display:grid;gap:8px;margin:14px 0}.plain-compare div{border-radius:9px;background:#f8fafc;padding:9px 11px}.plain-compare dt{color:#64748b;font-size:10px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.plain-compare dd{margin:3px 0 0;color:#1e293b;font-size:12px}.trace-row{display:flex;align-items:center;flex-wrap:wrap;gap:7px;margin-top:12px}.trace-row>span:first-child{color:#64748b;font-size:10px;font-weight:900;text-transform:uppercase}.trace-chip{border:1px solid #bfdbfe;border-radius:999px;background:#eff6ff;color:#1d4ed8;padding:4px 8px;font-size:10px;font-weight:800;text-decoration:none}',
    '.action-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}',
    '.action-card{position:relative;border:1px solid var(--line);border-top:5px solid #64748b;border-radius:16px;background:#fff;padding:22px;box-shadow:0 10px 30px rgba(15,23,42,.045)}',
    '.action-card.p0{border-top-color:var(--red)}.action-card.p1{border-top-color:var(--amber)}.action-card.p2{border-top-color:#2563eb}',
    '.action-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}',
    '.priority{display:inline-flex;border-radius:999px;padding:4px 9px;font-size:11px;font-weight:900}.priority.p0{background:#fee2e2;color:#991b1b}.priority.p1{background:#fef3c7;color:#92400e}.priority.p2{background:#dbeafe;color:#1e40af}',
    '.action-card h3{font-size:20px;line-height:1.25}.action-card p{color:#334155;font-size:14px}.action-card details{border-top:1px solid var(--line);padding-top:12px}.action-card summary{cursor:pointer;font-weight:750}.action-card li{margin:6px 0}',
    '.owner{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0}.owner div,.spec-list div{border-radius:10px;background:var(--soft);padding:10px 12px}.owner dt,.spec-list dt{color:var(--muted);font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.owner dd,.spec-list dd{margin:2px 0 0;font-weight:650}',
    '.page-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}',
    '.page-card{border:1px solid var(--line);border-top:5px solid var(--accent);border-radius:18px;background:#fff;padding:24px;box-shadow:0 14px 40px rgba(15,23,42,.055)}',
    '.page-card-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.page-card-head h3{margin:4px 0 0;font-size:24px}.verdict{border-radius:999px;padding:5px 10px;font-size:11px;font-weight:900;text-transform:uppercase}.verdict.fail{background:#fee2e2;color:#991b1b}.verdict.pass{background:#dcfce7;color:#166534}',
    '.page-card>p{color:var(--muted)}',
    '.page-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:18px 0}.page-metrics div{border-radius:10px;background:var(--soft);padding:12px 9px}.page-metrics strong{display:block;font-size:20px}.page-metrics span{display:block;color:var(--muted);font-size:10px;line-height:1.35}',
    '.rule-pills{display:flex;flex-wrap:wrap;gap:7px;margin:14px 0 22px}.rule-pill{border:1px solid var(--line);border-radius:999px;padding:5px 9px;color:#334155;font-size:11px}.rule-pill strong{color:var(--ink)}',
    '.page-card h4{margin-bottom:10px;font-size:14px}.contrast-list{display:grid;gap:7px}.contrast-list div{display:grid;grid-template-columns:minmax(100px,1fr) auto auto;gap:10px;align-items:center;border-bottom:1px solid #eef2f7;padding:7px 0}.contrast-list span{font-size:13px}.contrast-list strong{color:#991b1b;font-size:12px}.contrast-list small{color:var(--muted);font-size:10px}',
    '.check-strip{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}.check-strip span{border-radius:8px;background:#ecfdf5;color:#166534;padding:6px 9px;font-size:11px}',
    '.notice{margin-top:14px;border-radius:10px;background:#fff7ed;color:#9a3412;padding:11px;font-size:12px}',
    '.artifact-links{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}.artifact-links a{border-radius:8px;background:#eff6ff;padding:7px 10px;font-size:12px;font-weight:750;text-decoration:none}',
    '.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:14px;background:#fff}table{width:100%;border-collapse:collapse;min-width:720px}th,td{border-bottom:1px solid var(--line);padding:13px 14px;text-align:left;vertical-align:top;font-size:13px}thead th{background:#eff6ff;color:#1e3a8a;font-size:11px;text-transform:uppercase;letter-spacing:.06em}tbody tr:last-child th,tbody tr:last-child td{border-bottom:0}.subheading{margin:34px 0 4px;font-size:21px}',
    '.status-matrix{min-width:1380px}.status-matrix tbody th{width:170px}.status-matrix tbody th span{display:block;margin-top:4px;color:#334155;font-size:12px}.status-matrix tbody th a{font-size:10px}.status-matrix .reference-cell{width:250px;color:#475569;background:#f8fafc}.matrix-cell{width:280px;border-left:4px solid}.matrix-cell.match{border-left-color:#16a34a;background:#f0fdf4}.matrix-cell.partial{border-left-color:#d97706;background:#fffbeb}.matrix-cell.mismatch{border-left-color:#dc2626;background:#fef2f2}.matrix-cell p{margin:8px 0;color:#334155;font-size:11px}.cell-links{display:flex;flex-wrap:wrap;gap:7px}.cell-links a{font-size:10px;font-weight:800}',
    '.case-downloads{display:flex;flex-wrap:wrap;gap:10px;margin:-12px 0 24px}.case-downloads a{border-radius:10px;background:#1d4ed8;color:#fff;padding:9px 13px;font-size:12px;font-weight:800;text-decoration:none}.case-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.case-card{border:1px solid var(--line);border-radius:16px;background:#fff;padding:20px;box-shadow:0 8px 24px rgba(15,23,42,.045)}.case-head{display:flex;justify-content:space-between;gap:12px}.case-head>div{display:flex;align-items:center;flex-wrap:wrap;gap:7px}.case-type{border-radius:999px;background:#e2e8f0;color:#334155;padding:4px 8px;font-size:10px;font-weight:800}.case-card h3{margin:13px 0 7px;font-size:19px}.case-evidence,.expected{border-radius:10px;padding:11px 12px;margin:12px 0}.case-evidence{background:#eff6ff}.expected{background:#ecfdf5}.case-evidence p,.expected p{margin:4px 0 0;font-size:12px}.case-card details{border-top:1px solid var(--line);padding-top:10px;margin-top:10px}.case-card summary{cursor:pointer;font-size:12px;font-weight:800}.case-card h4{margin:12px 0 4px;font-size:12px}.case-card li{margin:5px 0;font-size:12px}',
  ].join('');
}

function evidenceStyles() {
  return [
    '.gallery{border:1px solid var(--line);border-radius:14px;background:#fff;margin:12px 0;overflow:hidden}.gallery summary{display:flex;justify-content:space-between;align-items:center;cursor:pointer;padding:16px 18px;font-weight:800}.gallery summary small{color:var(--muted);font-weight:600}.gallery[open] summary{border-bottom:1px solid var(--line)}',
    '.shot-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;padding:14px}.shot{margin:0;border:1px solid var(--line);border-radius:10px;background:#f8fafc;overflow:hidden}.shot a{display:block;height:300px;overflow:hidden;background:#e2e8f0}.shot img{width:100%;height:auto}.shot figcaption{padding:9px 11px;color:#334155;font-size:12px;font-weight:750}',
    '.system-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.system-grid article{border:1px solid var(--line);border-radius:16px;background:#fff;padding:24px}.system-grid h3{margin:4px 0 16px}.spec-list{display:grid;gap:8px;margin:0}.spec-list div{display:grid;grid-template-columns:120px 1fr;gap:10px}',
    '.swatches{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:18px 0}.swatch{display:flex;align-items:center;gap:10px;border:1px solid var(--line);border-radius:12px;background:#fff;padding:10px}.swatch>span{width:38px;height:38px;flex:0 0 auto;border:1px solid rgba(15,23,42,.12);border-radius:10px}.swatch strong,.swatch code,.swatch small{display:block}.swatch strong{font-size:12px}.swatch code{font-size:11px}.swatch small{color:var(--muted);font-size:9px}',
    'pre{overflow:auto;border-radius:14px;background:#081225;color:#dbeafe;padding:22px;font-size:12px;line-height:1.65}',
    '.method-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.method-list div{border:1px solid var(--line);border-radius:12px;background:#fff;padding:15px}.method-list strong{display:block;margin-bottom:4px}.method-list p{margin:0;color:var(--muted);font-size:13px}',
    '.standards{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}.standards a{border:1px solid #bfdbfe;border-radius:999px;background:#eff6ff;padding:7px 10px;font-size:12px;text-decoration:none}',
    '.muted{color:var(--muted)}',
    'footer{background:#061025;color:#cbd5e1;padding:34px 0}footer p{margin:0;font-size:13px}',
    '@media(max-width:900px){.metric-grid,.page-metrics,.swatches{grid-template-columns:repeat(2,minmax(0,1fr))}.action-grid,.page-grid,.system-grid,.section-head,.comparison-grid,.case-grid,.release-banner{grid-template-columns:1fr}.shot-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.section-head{gap:12px}}',
    '@media(max-width:560px){.shell{width:min(100% - 24px,1180px)}.hero{padding:48px 0}.hero .lede{font-size:16px}main section{padding:52px 0}.metric-grid,.two-col,.page-metrics,.method-list,.swatches,.status-counts,.status-legend,.gate-counts{grid-template-columns:1fr}.action-grid,.page-grid{grid-template-columns:1fr}.shot-grid{grid-template-columns:1fr}.shot a{height:360px}.owner{grid-template-columns:1fr}.contrast-list div{grid-template-columns:1fr auto}.contrast-list small{grid-column:1/-1}.spec-list div{grid-template-columns:1fr}.jump a{flex:1 1 45%;text-align:center}.status-group>summary{align-items:flex-start;flex-wrap:wrap}.status-group>summary span:last-child{margin-left:0;width:100%}.case-head{align-items:flex-start;flex-direction:column}}',
    '@media print{.hero{padding:30px 0}.jump,.gallery img{display:none}main section{padding:30px 0}.action-card,.page-card,.panel{break-inside:avoid;box-shadow:none}}',
  ].join('');
}

function renderHeroHtml() {
  return [
    '<header class=hero><div class=shell>',
    '<span class=kicker>Independent visual audit</span>',
    '<h1>DMS UI/UX comparison and fix plan</h1>',
    '<p class=lede>Three local Ledgers DMS pages compared with the overall Ledgers.cloud experience across mobile, tablet, and desktop. The result separates measured defects from design judgement and turns both into a prioritized implementation plan.</p>',
    '<div class=hero-meta>',
    '<span>' + model.decisionSummary.mismatchCount + ' mismatches to fix</span>',
    '<span>' + model.decisionSummary.partialMatchCount + ' partial matches to review</span>',
    '<span>' + model.decisionSummary.matchCount + ' verified matches</span>',
    '<span>' + model.scope.validCaptureCount + '/' + model.scope.captureCount + ' valid captures</span>',
    '<span>' + model.decisionSummary.notTestedCaseCount + ' compatibility areas NOT TESTED</span>',
    '</div>',
    '<nav class=jump aria-label=Report-sections>',
    '<a href=#status-dashboard>Release gate</a><a href=#cases>Cases</a><a href=#fix-plan>Fix plan</a>',
    '<a href=#pages>Technical evidence</a><a href=#evidence>Screenshots</a><a href=#system>Design system</a>',
    '</nav>',
    '</div></header>',
  ].join('');
}

function renderDecisionFirstHtml() {
  return [
    '<section id=status-dashboard><div class=shell>',
    '<div class=section-head><div><span class=eyebrow>Read this first</span><h2>Simple release view: fail, verify, or pass</h2></div>',
    '<p>Process this table from top to bottom. Each row gives the current evidence, the exact passing condition, and the case to run.</p></div>',
    '<div class=release-banner><div><span>Release decision</span><strong>'
      + escapeHtml(model.decisionSummary.releaseDecision) + '</strong></div>',
    '<p>Four P0 areas block release. Cross-browser, real-mobile, and Windows scaling coverage is explicitly NOT TESTED and must be verified before release.</p></div>',
    '<p class=gate-note><strong>Executed:</strong> ' + escapeHtml(model.scope.executedBrowsers.join(', '))
      + ' at 320x568, 390x844, 768x1024, and 1440x900. <strong>NOT TESTED:</strong> Edge, Firefox, WebKit/Safari, real iOS/Android, orientation and dynamic mobile viewports, safe areas, Windows scaling, and slow or failed font delivery.</p>',
    '<h3 class=subheading>Release checklist</h3>',
    renderReleaseChecklistHtml(),
    '<h3 class=subheading>Detailed comparison status</h3>',
    '<div class=status-counts>',
    '<div class=mismatch><strong>' + model.decisionSummary.mismatchCount + '</strong><span>MISMATCH / FIX</span></div>',
    '<div class=partial><strong>' + model.decisionSummary.partialMatchCount + '</strong><span>PARTIAL / REVIEW</span></div>',
    '<div class=match><strong>' + model.decisionSummary.matchCount + '</strong><span>MATCH / KEEP</span></div>',
    '</div>',
    renderLegendHtml(),
    '<h3 class=subheading>Quick page decision</h3>',
    '<div class=table-wrap><table class=quick-decision><thead><tr><th>Page</th><th>Decision</th><th>Main reason</th><th>Start case</th></tr></thead><tbody>',
    '<tr><th>Ledgers.cloud</th><td><span class=reference-tag>REFERENCE ONLY</span></td><td>Useful visual direction, but it also contains accessibility and asset defects.</td><td>Do not copy defects</td></tr>',
    '<tr><th>eStamp</th><td>' + renderStatusBadge('MISMATCH') + '</td><td>36 unique contrast gaps, mobile controls outside the viewport, plus shared tray, preview, and footer problems.</td><td><a href=#case-UIUX-TC-001>UIUX-TC-001</a> <a href=#case-UIUX-TC-011>UIUX-TC-011</a></td></tr>',
    '<tr><th>Document Management</th><td>' + renderStatusBadge('MISMATCH') + '</td><td>29 unique contrast gaps, sparse section rhythm, and shared problems.</td><td><a href=#case-UIUX-TC-001>UIUX-TC-001</a></td></tr>',
    '<tr><th>Aadhaar eSign</th><td>' + renderStatusBadge('MISMATCH') + '</td><td>31 unique contrast gaps, black CTA inconsistency, shared problems, and six images to verify.</td><td><a href=#case-UIUX-TC-001>UIUX-TC-001</a></td></tr>',
    '</tbody></table></div>',
    '<h3 class=subheading>Comparison items by status</h3>',
    renderStatusGroup('MISMATCH', true),
    renderStatusGroup('PARTIAL MATCH', false),
    renderStatusGroup('MATCH', false),
    '<h3 class=subheading>Per-page status matrix</h3>',
    '<p class=muted>Every local cell states the status and current observation. Select its case ID to verify the fix or protect the match.</p>',
    renderPerPageStatusMatrix(),
    '</div></section>',
  ].join('');
}

function renderCasesHtml() {
  const order = { MISMATCH: 0, 'NOT TESTED': 1, 'PARTIAL MATCH': 2, MATCH: 3 };
  const sorted = verificationCases.slice().sort(function sort(a, b) {
    return order[a.statusBefore] - order[b.statusBefore]
      || priorityRank(a.priority) - priorityRank(b.priority)
      || a.id.localeCompare(b.id);
  });
  return [
    '<section id=cases><div class=shell>',
    '<div class=section-head><div><span class=eyebrow>Ready-to-run verification</span><h2>Most important cases appear first</h2></div>',
    '<p>Run P0 red cases first, then the blue NOT TESTED compatibility cases and P1 visual-system cases, followed by amber verification and green regression protection.</p></div>',
    '<div class=case-downloads><a href=combined-cases.json>Download case JSON</a>',
    '<a href=combined-cases.csv>Download case CSV</a></div>',
    '<div class=case-grid>' + sorted.map(renderCaseHtml).join('') + '</div>',
    '</div></section>',
  ].join('');
}

function renderExecutiveHtml() {
  return [
    '<section id=decision><div class=shell>',
    '<div class=section-head><div><span class=eyebrow>Executive decision</span><h2>Strong foundation, focused remediation needed</h2></div>',
    '<p>The design direction is coherent. Contrast, responsive component bounds, zoom, the fixed mobile tray, and preview readability are the immediate release risks.</p></div>',
    '<div class=decision><strong>Fix before UI/UX sign-off</strong>'
      + escapeHtml(model.executiveSummary.recommendation) + '</div>',
    '<div class=metric-grid>',
    '<div class=metric><strong>16/16</strong><span>valid target and reference captures</span></div>',
    '<div class=metric><strong>0</strong><span>page-level horizontal-overflow captures</span></div>',
    '<div class=metric><strong>4</strong><span>P0 release-blocking checks</span></div>',
    '<div class=metric><strong>4</strong><span>viewports: 320, 390, 768, 1440</span></div>',
    '</div>',
    '<div class=two-col>',
    '<article class=panel><span class=eyebrow>Keep</span><h3>What already works</h3><ul>'
      + model.executiveSummary.strengths.map(function map(item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('')
      + '</ul></article>',
    '<article class=panel><span class=eyebrow>Reference rule</span><h3>Borrow confidence, not defects</h3>',
    '<p>' + escapeHtml(model.executiveSummary.caution) + '</p>',
    '<p>The local product accents are useful. Align shared typography, neutral surfaces, buttons, spacing, radii, proof density, and section rhythm while retaining blue, green, and purple identities.</p></article>',
    '</div>',
    '</div></section>',
  ].join('');
}

function renderFixPlanHtml() {
  const sorted = actions.slice().sort(function sort(a, b) {
    return priorityRank(a.priority) - priorityRank(b.priority) || a.id.localeCompare(b.id);
  });
  return [
    '<section id=fix-plan><div class=shell>',
    '<div class=section-head><div><span class=eyebrow>Prioritized backlog</span><h2>Fix the system once, improve all three pages</h2></div>',
    '<p>P0 items block release. P1 items block visual sign-off. P2 items improve hierarchy, confidence, and conversion quality.</p></div>',
    '<div class=action-grid>' + sorted.map(renderActionHtml).join('') + '</div>',
    '</div></section>',
  ].join('');
}

function renderPagesHtml() {
  return [
    '<section id=pages><div class=shell>',
    '<div class=section-head><div><span class=eyebrow>Page evidence</span><h2>Measured results, deduplicated by component</h2></div>',
    '<p>Unique findings use rule ID plus stable element key. Raw occurrences remain in each detailed audit because the same defect may repeat at several viewports.</p></div>',
    '<div class=page-grid>' + pages.map(renderPageCard).join('') + '</div>',
    '</div></section>',
  ].join('');
}

function renderAlignmentHtml() {
  return [
    '<section id=alignment><div class=shell>',
    '<div class=section-head><div><span class=eyebrow>Reference comparison</span><h2>Alignment indicators, not quality scores</h2></div>',
    '<p>These desktop percentages show overlap in rendered design tokens between different page types. They do not measure beauty, usability, or release quality.</p></div>',
    renderComparisonMatrix(),
    '<h3 class=subheading>Desktop token-profile alignment</h3>',
    '<p class=muted>Use these values to locate shared-system drift. They are reference alignment indicators, not page-quality scores.</p>',
    renderTokenTable(),
    '<div class=two-col>',
    '<article class=panel><span class=eyebrow>Matches</span><h3>Shared Ledgers language</h3><ul>',
    '<li>Same navigation and footer family</li><li>Inter-led typography and 400-700 weight range</li>',
    '<li>Strong 36-38px desktop headline hierarchy</li><li>Hero, steps, benefits, FAQ, and conversion structure</li>',
    '<li>Core 8px and 16px spacing rhythm</li></ul></article>',
    '<article class=panel><span class=eyebrow>Improve</span><h3>Where the local pages fall behind</h3><ul>',
    '<li>Less section contrast and visual depth through the page middle</li><li>Less product proof, trust, and contextual conversion content</li>',
    '<li>More typography, spacing, radius, and component variants than needed</li>',
    '<li>Repeated low-contrast CTA, label, and demo-interface colors</li></ul></article>',
    '</div>',
    '</div></section>',
  ].join('');
}

function renderEvidenceHtml() {
  return [
    '<section id=evidence><div class=shell>',
    '<div class=section-head><div><span class=eyebrow>Visual evidence</span><h2>All 16 full-page captures</h2></div>',
    '<p>Open each group to compare 320px mobile, 390px mobile, 768px tablet, and 1440px desktop. Select any image for its full-resolution artifact.</p></div>',
    pages.map(renderGallery).join(''),
    '</div></section>',
  ].join('');
}

function renderDesignSystemSection() {
  return [
    '<section id=system><div class=shell>',
    '<div class=section-head><div><span class=eyebrow>Recommended baseline</span><h2>A shared system with product-specific accents</h2></div>',
    '<p>Use one neutral foundation and component library. Change the primary accent by product, but keep behavior, size, focus treatment, spacing, and radius consistent.</p></div>',
    renderSystemHtml(),
    '</div></section>',
  ].join('');
}

function renderMethodHtml() {
  const limitations = model.methodology.limitations.map(function map(item) {
    return '<div><strong>Limit</strong><p>' + escapeHtml(item) + '</p></div>';
  }).join('');
  return [
    '<section id=method><div class=shell>',
    '<div class=section-head><div><span class=eyebrow>Method</span><h2>What this report proves - and what it does not</h2></div>',
    '<p>Objective findings come from rendered measurements. Heuristics stay review items. Complex media backgrounds are never converted into invented flat-color contrast failures.</p></div>',
    '<div class=method-list>',
    '<div><strong>Engine</strong><p>' + escapeHtml(model.methodology.engine) + '</p></div>',
    '<div><strong>Evidence</strong><p>' + escapeHtml(model.methodology.evidence) + '</p></div>',
    '<div><strong>Counting</strong><p>' + escapeHtml(model.methodology.counting) + '</p></div>',
    '<div><strong>Comparison</strong><p>' + escapeHtml(model.methodology.comparison) + '</p></div>',
    limitations,
    '</div>',
    '<div class=standards>',
    '<a href=https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum>WCAG contrast minimum</a>',
    '<a href=https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum>WCAG target size minimum</a>',
    '<a href=https://www.w3.org/WAI/WCAG21/Understanding/reflow>WCAG reflow</a>',
    '</div>',
    '</div></section>',
  ].join('');
}

function renderHtml() {
  return [
    '<!doctype html><html lang=en><head><meta charset=utf-8>',
    '<meta' + htmlAttribute('name', 'viewport') + htmlAttribute('content', 'width=device-width,initial-scale=1') + '>',
    '<title>DMS UI/UX comparison and fix plan</title>',
    '<style>' + baseStyles() + componentStyles() + evidenceStyles() + '</style>',
    '</head><body>',
    renderHeroHtml(),
    '<main>',
    renderDecisionFirstHtml(),
    renderCasesHtml(),
    renderFixPlanHtml(),
    renderExecutiveHtml(),
    renderPagesHtml(),
    renderAlignmentHtml(),
    renderEvidenceHtml(),
    renderDesignSystemSection(),
    renderMethodHtml(),
    '</main>',
    '<footer><div class=shell><p>Generated ' + escapeHtml(model.generatedAt)
      + ' from saved rendered evidence. Detailed audit artifacts remain linked above.</p></div></footer>',
    '</body></html>',
  ].join('');
}

function csvCell(value) {
  const quote = String.fromCharCode(34);
  const text = String(value == null ? '' : value).replaceAll(quote, quote + quote);
  return quote + text + quote;
}

function renderCasesCsv() {
  const headers = [
    'id', 'title', 'statusBefore', 'evidenceStatus', 'coverageType',
    'priority', 'category', 'type', 'automatable',
    'affectedPages', 'linkedComparisonIds', 'linkedActionId', 'evidence',
    'preconditions', 'steps', 'expectedResult', 'acceptanceCriteria',
  ];
  const rows = verificationCases.map(function map(testCase) {
    return [
      testCase.id,
      testCase.title,
      testCase.statusBefore,
      testCase.evidenceStatus || '',
      testCase.coverageType || '',
      testCase.priority,
      testCase.category,
      testCase.type,
      testCase.automatable,
      testCase.affectedPages.join(' | '),
      testCase.linkedComparisonIds.join(' | '),
      testCase.linkedActionId || '',
      testCase.evidence,
      testCase.preconditions.join(' | '),
      testCase.steps.map(function step(item, index) {
        return (index + 1) + '. ' + item.action;
      }).join(' | '),
      testCase.expectedResult,
      testCase.acceptanceCriteria.join(' | '),
    ].map(csvCell).join(',');
  });
  return [headers.map(csvCell).join(','), ...rows].join('\n') + '\n';
}

const outputs = {
  html: path.join(outputRoot, 'combined-report.html'),
  markdown: path.join(outputRoot, 'combined-report.md'),
  json: path.join(outputRoot, 'combined-report.json'),
  casesJson: path.join(outputRoot, 'combined-cases.json'),
  casesCsv: path.join(outputRoot, 'combined-cases.csv'),
};

fs.writeFileSync(outputs.html, renderHtml());
fs.writeFileSync(outputs.markdown, renderMarkdown());
fs.writeFileSync(outputs.json, JSON.stringify(model, null, 2) + '\n');
fs.writeFileSync(outputs.casesJson, JSON.stringify({
  schemaVersion: '1.1',
  generatedAt: model.generatedAt,
  statusLegend: caseStatusLegend,
  cases: verificationCases,
}, null, 2) + '\n');
fs.writeFileSync(outputs.casesCsv, renderCasesCsv());

process.stdout.write(JSON.stringify({
  ok: true,
  generatedAt: model.generatedAt,
  outputs,
  decisionSummary: model.decisionSummary,
  verificationCases: verificationCases.length,
  pages: pages.map(function map(page) {
    return {
      id: page.id,
      validCaptures: page.captures.valid,
      distinctObjective: page.findings.distinctObjective,
      distinctReview: page.findings.distinctReview,
    };
  }),
}, null, 2) + '\n');
