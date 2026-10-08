const DEFINITIONS = [
  {
    id: 'UX-MAN-001',
    category: 'Typography',
    title: 'Review typography readability and rendering',
    issuePattern: /typograph|font|line.?height|letter.?spacing|line.?length|text/i,
    preconditions: [
      'Representative page content is available in every supported script and language.',
      'Browser zoom is set to 100% for the initial review.',
    ],
    steps: [
      'Open the first available desktop capture at its original size.',
      'Inspect the rendered font family in body copy.',
      'Inspect the rendered font weight in body copy.',
      'Inspect the rendered font size in body copy.',
      'Inspect the line height in each multi-line text block.',
      'Inspect long lines of text for comfortable reading length.',
      'Compare typography with every other captured viewport and theme.',
    ],
    expectedResult: 'Text is legible without strain; intended fonts render without a visible fallback or flash; body copy, labels, and headings use consistent sizes, weights, line heights, and spacing; long text remains readable at every captured viewport.',
  },
  {
    id: 'UX-MAN-002',
    category: 'Visual hierarchy',
    title: 'Confirm the page has a clear visual hierarchy',
    issuePattern: /hierarch|layout|spacing|alignment|consisten|heading/i,
    preconditions: [
      'The page is populated with representative content.',
      'The primary user goal for the page is known.',
    ],
    steps: [
      'View the page without interacting for five seconds.',
      'Identify the first element that attracts attention.',
      'Identify the page heading.',
      'Identify the primary action.',
      'Scan each content group from top to bottom.',
      'Compare the emphasis of primary, secondary, and destructive actions.',
    ],
    expectedResult: 'The page purpose, current context, primary content, and primary action are immediately distinguishable; spacing and alignment group related items; secondary information does not compete with the main task; destructive actions are clearly differentiated.',
  },
  {
    id: 'UX-MAN-003',
    category: 'Brand and color',
    title: 'Review brand and color consistency',
    issuePattern: /brand|color|palette|background|border|consisten/i,
    preconditions: [
      'The approved brand palette or a trusted reference is available.',
      'Every supported theme has been captured.',
    ],
    steps: [
      'Compare the page palette with the approved brand palette.',
      'Inspect the color of each primary action.',
      'Inspect the color of each secondary action.',
      'Inspect status colors used for success, warning, and error.',
      'Inspect repeated component colors across all captures.',
      'Record every unexplained color variation.',
    ],
    expectedResult: 'Brand colors are reproduced consistently; equivalent components use the same color treatment; semantic colors have one clear meaning; unapproved or near-duplicate colors are absent unless a documented state requires them.',
  },
  {
    id: 'UX-MAN-004',
    category: 'Brand and color',
    title: 'Verify meaning remains clear without color',
    issuePattern: /contrast|color|state|error|warning|success/i,
    preconditions: [
      'The page contains representative success, warning, error, selected, and disabled states.',
      'A greyscale or color-vision simulation is available.',
    ],
    steps: [
      'View the page in greyscale.',
      'Identify every error state.',
      'Identify every selected state.',
      'Identify every disabled state.',
      'Repeat the review with a common color-vision simulation.',
      'Compare uncertain combinations with the automated contrast evidence.',
    ],
    expectedResult: 'No instruction, status, validation result, selection, or control state relies on color alone; text, icons, patterns, borders, or position provide an additional cue; automated contrast failures are visually confirmed and indeterminate combinations receive a documented review.',
  },
  {
    id: 'UX-MAN-005',
    category: 'Interaction states',
    title: 'Review control states and feedback',
    issuePattern: /interaction|hover|focus|active|pressed|disabled|target|state/i,
    preconditions: [
      'The page contains representative links, buttons, form controls, and menus.',
      'The reviewer can use both a pointer and a keyboard.',
    ],
    steps: [
      'Hover each distinct interactive component.',
      'Focus each distinct interactive component with the keyboard.',
      'Activate each distinct interactive component.',
      'Inspect the pressed or selected state where applicable.',
      'Inspect the disabled state where applicable.',
      'Inspect the busy state where applicable.',
      'Compare equivalent states across repeated components.',
    ],
    expectedResult: 'Every interactive component has a visible and consistent default, hover, focus, active, selected, disabled, and busy treatment where applicable; state changes are noticeable without causing layout movement; disabled controls are distinguishable without appearing like missing content.',
  },
  {
    id: 'UX-MAN-006',
    category: 'Interaction states',
    title: 'Complete the primary task with the keyboard',
    issuePattern: /focus|keyboard|interaction|target|dialog|menu/i,
    preconditions: [
      'The primary task can be performed with safe test data.',
      'The page is reset to its initial state.',
    ],
    steps: [
      'Place keyboard focus at the start of the page.',
      'Move focus forward through every interactive element.',
      'Move focus backward through every interactive element.',
      'Open each interactive overlay with the keyboard.',
      'Close each interactive overlay with the keyboard.',
      'Complete the primary task without using a pointer.',
    ],
    expectedResult: 'Focus order follows the visual and task order; focus remains visible; no component traps focus; overlays return focus to their trigger; the primary task can be completed without a pointer.',
  },
  {
    id: 'UX-MAN-007',
    category: 'Responsive design',
    title: 'Review layout across captured viewports',
    issuePattern: /responsive|viewport|layout|overflow|clip|overlap|target/i,
    preconditions: [
      'A valid capture exists for every configured viewport.',
      'Representative minimum and maximum content lengths are available.',
    ],
    steps: [
      'Open the narrowest viewport capture.',
      'Inspect the page for horizontal scrolling.',
      'Inspect every content region for clipping.',
      'Inspect every content region for overlap.',
      'Repeat the review for each wider viewport.',
      'Resize through the spaces between configured breakpoints.',
      'Repeat the primary task at the narrowest viewport.',
    ],
    expectedResult: 'Content reflows without unintended horizontal scrolling, overlap, clipping, or inaccessible controls; navigation and primary actions remain usable; layout changes occur at sensible breakpoints rather than only at the exact captured widths.',
  },
  {
    id: 'UX-MAN-008',
    category: 'Zoom and text spacing',
    title: 'Verify browser zoom and reflow',
    issuePattern: /zoom|reflow|overflow|clip|layout|target/i,
    preconditions: [
      'A desktop browser is available at the audit target URL.',
      'The page is reset to its initial state.',
    ],
    steps: [
      'Set browser zoom to 200%.',
      'Inspect the page for clipped content.',
      'Inspect the page for overlapping content.',
      'Complete the primary task at 200% zoom.',
      'Set the viewport to 1280 CSS pixels wide.',
      'Set browser zoom to 400%.',
      'Inspect the page for two-dimensional scrolling.',
    ],
    expectedResult: 'All text and controls remain readable and operable at 200% zoom; at 400% zoom, content reflows to a single direction except for genuinely two-dimensional content such as data tables or maps; no instruction or action is lost.',
  },
  {
    id: 'UX-MAN-009',
    category: 'Zoom and text spacing',
    title: 'Verify custom text spacing does not break content',
    issuePattern: /typograph|spacing|clip|overflow|text/i,
    preconditions: [
      'A browser tool or stylesheet injector can override text spacing.',
      'The page contains headings, labels, body copy, and multi-line controls.',
    ],
    steps: [
      'Set line height to 1.5 times the font size.',
      'Set paragraph spacing to 2 times the font size.',
      'Set letter spacing to 0.12 times the font size.',
      'Set word spacing to 0.16 times the font size.',
      'Inspect every text region for clipping.',
      'Complete the primary task with the overrides active.',
    ],
    expectedResult: 'No text is clipped, overlapped, hidden, or made unusable by the spacing overrides; containers expand or reflow; controls and instructions remain available throughout the primary task.',
  },
  {
    id: 'UX-MAN-010',
    category: 'Content states',
    title: 'Review content clarity and resilience',
    issuePattern: /content|typograph|clip|overflow|consisten|layout/i,
    preconditions: [
      'Representative short, long, missing, and localized content is available.',
      'The page can be exercised without changing production data.',
      'The product vocabulary, locale, tone, and content style guide are available.',
    ],
    steps: [
      'Load the page with the shortest representative content.',
      'Inspect labels and instructions for clarity.',
      'Load the page with the longest representative content.',
      'Inspect long content for truncation.',
      'Load the page with optional content missing.',
      'Inspect the remaining layout for unexplained gaps.',
      'Review the page with the longest supported locale where available.',
      'Review every dictionary spelling finding in its full sentence.',
      'Review grammar, punctuation, capitalization, terminology, dates, numbers, and action labels.',
      'Approve legitimate names, abbreviations, and domain terms in the audit configuration.',
    ],
    expectedResult: 'Labels and instructions use concise, accurate, correctly spelled language; grammar, punctuation, capitalization, terminology, dates, and numbers follow the approved locale and content style; dictionary exceptions are intentional and recorded; long content wraps or truncates with an accessible recovery mechanism; missing optional content does not leave broken structure; localization does not obscure meaning or actions.',
  },
  {
    id: 'UX-MAN-011',
    category: 'Content states',
    title: 'Review the loading experience',
    issuePattern: /loading|busy|skeleton|layout|motion|content/i,
    preconditions: [
      'Network throttling is available in a safe environment.',
      'The page performs at least one asynchronous content request.',
    ],
    steps: [
      'Enable a slow network profile.',
      'Reload the page.',
      'Observe the first visible loading feedback.',
      'Observe the layout while content is loading.',
      'Observe the transition to loaded content.',
      'Activate an asynchronous action once.',
      'Inspect its busy feedback.',
    ],
    expectedResult: 'Loading feedback appears promptly; the page does not present a misleading blank or complete state; skeletons and placeholders preserve final layout dimensions; busy actions prevent accidental duplication; loading indicators disappear exactly once after completion.',
  },
  {
    id: 'UX-MAN-012',
    category: 'Content states',
    title: 'Review the empty-state experience',
    issuePattern: /empty|content|layout|interaction|consisten/i,
    preconditions: [
      'A safe account or fixture with no records is available.',
      'The reviewer can restore representative data after the check.',
    ],
    steps: [
      'Open the page with no records available.',
      'Identify the empty-state heading.',
      'Read the empty-state explanation.',
      'Identify the next recommended action.',
      'Activate the recommended action.',
    ],
    expectedResult: 'The empty state is distinguishable from loading and failure; it explains why no content is present; it offers an appropriate next action; the action is visible, keyboard accessible, and leads to the intended recovery or creation flow.',
  },
  {
    id: 'UX-MAN-013',
    category: 'Content states',
    title: 'Review error messaging and recovery',
    issuePattern: /error|invalid|failure|contrast|focus|interaction/i,
    preconditions: [
      'A safe environment permits validation and request failures to be triggered.',
      'The page contains representative user-entered data.',
    ],
    steps: [
      'Trigger one field-level validation error.',
      'Inspect the error message wording.',
      'Inspect the error association with its field.',
      'Trigger one page-level request failure.',
      'Inspect the page-level failure message.',
      'Activate the available recovery action.',
      'Confirm retained user input after recovery.',
    ],
    expectedResult: 'Each error states what happened and how to recover; field errors are adjacent and programmatically associated; focus moves to a useful location; page failures are distinct from empty states; retry succeeds without duplicate work; safe user input is retained.',
  },
  {
    id: 'UX-MAN-014',
    category: 'Imagery and media',
    title: 'Review imagery quality and purpose',
    issuePattern: /media|image|aspect|icon|illustrat|video/i,
    preconditions: [
      'All responsive image and media resources have finished loading.',
      'High-density and standard-density displays are available where practical.',
    ],
    steps: [
      'Inspect each informative image at its rendered size.',
      'Inspect each image for distortion.',
      'Inspect each image for unintended cropping.',
      'Inspect repeated icons for consistent size and stroke.',
      'Inspect decorative imagery for interference with text.',
      'Review media controls with the keyboard.',
    ],
    expectedResult: 'Images are sharp at their rendered density, preserve intended aspect ratios, and crop deliberately; icons are visually consistent; decorative media does not reduce readability; informative media has an equivalent description; media controls remain usable.',
  },
  {
    id: 'UX-MAN-015',
    category: 'Motion',
    title: 'Review motion and reduced-motion behavior',
    issuePattern: /motion|animation|transition|loading|interaction/i,
    preconditions: [
      'The reviewer can switch the operating-system reduced-motion preference.',
      'The page contains all representative animated interactions.',
    ],
    steps: [
      'Observe each animation at the default motion preference.',
      'Trigger each animated interaction once.',
      'Enable the reduced-motion preference.',
      'Reload the page.',
      'Trigger each animated interaction once.',
      'Inspect time-sensitive feedback without motion.',
    ],
    expectedResult: 'Motion communicates state without delaying tasks, obscuring content, or causing distraction; no unexpected animation flashes or loops indefinitely; reduced-motion mode removes or simplifies nonessential movement while preserving state and feedback.',
  },
  {
    id: 'UX-MAN-016',
    category: 'Usability',
    title: 'Complete the primary flow without prior instruction',
    issuePattern: /usability|interaction|layout|content|consisten|target|focus/i,
    preconditions: [
      'A representative user who did not design the page is available.',
      'Safe data and credentials for the primary flow are available.',
    ],
    steps: [
      'State the intended outcome without explaining the interface.',
      'Ask the representative user to begin the task.',
      'Observe the first action without intervening.',
      'Record each hesitation.',
      'Record each navigation reversal.',
      'Record each request for help.',
      'Ask the user to describe the completion state.',
    ],
    expectedResult: 'The user discovers the correct starting point, understands labels and feedback, completes the flow without external instruction or avoidable reversal, and can correctly explain whether the task succeeded.',
  },
];

const asArray = (value) => (Array.isArray(value) ? value : []);

function unique(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ''))];
}

function captureId(capture, index) {
  return String(capture?.id || capture?.captureId || capture?.key || `capture-${index + 1}`);
}

function captureLabel(capture, index) {
  const viewport = capture?.viewport?.name || capture?.viewportName || capture?.profile || '';
  const theme = capture?.theme || capture?.colorScheme || '';
  const checkpoint = capture?.checkpoint || capture?.name || capture?.label || '';
  return unique([checkpoint, viewport, theme]).join(' / ') || captureId(capture, index);
}

function screenshotPaths(capture) {
  const candidates = [
    capture?.screenshot,
    capture?.screenshotPath,
    capture?.fullPageScreenshot,
    capture?.artifacts?.screenshot,
    capture?.artifacts?.fullPage,
    ...asArray(capture?.screenshots),
    ...asArray(capture?.artifacts?.screenshots),
  ];
  return unique(candidates.map((entry) => (
    typeof entry === 'string' ? entry : entry?.path || entry?.file || entry?.href
  )));
}

function issueText(issue) {
  return [
    issue?.id,
    issue?.ruleId,
    issue?.category,
    issue?.title,
    issue?.message,
    issue?.expected,
    issue?.recommendation,
  ].filter(Boolean).join(' ');
}

function commonPreconditions(audit, captures) {
  const target = audit?.target?.finalUrl || audit?.target?.url || 'the audited URL';
  const validCaptureCount = captures.filter((capture) => capture?.valid !== false && capture?.status !== 'invalid').length;
  const executionStatus = audit?.executionStatus || 'unknown';
  return [
    `Open ${target} using the same data and authentication state as audit run ${audit?.runId || '(unidentified)'}.`,
    validCaptureCount
      ? `${validCaptureCount} captured state${validCaptureCount === 1 ? ' is' : 's are'} available as review evidence.`
      : 'Create at least one valid screenshot capture before completing the visual review.',
    executionStatus === 'complete' || executionStatus === 'completed' || executionStatus === 'success'
      ? 'The automated audit completed successfully.'
      : `The automated audit execution status is "${executionStatus}"; record unavailable evidence as blocked rather than passed.`,
  ];
}

function evidenceFor(audit, definition, captures, issues) {
  const related = issues.filter((issue) => definition.issuePattern.test(issueText(issue)));
  return {
    auditRunId: audit?.runId || null,
    captureIds: captures.map(captureId),
    captureLabels: captures.map(captureLabel),
    screenshots: unique(captures.flatMap(screenshotPaths)),
    relatedIssues: related.map((issue) => ({
      id: issue?.id || issue?.ruleId || null,
      ruleId: issue?.ruleId || null,
      class: issue?.class || issue?.classification || null,
      status: issue?.status || null,
      severity: issue?.severity || null,
      title: issue?.title || issue?.message || 'Untitled finding',
      captureId: issue?.location?.captureId || null,
    })),
  };
}

/**
 * Build a stable, project-independent manual UI/UX checklist enriched with
 * evidence collected by the supplied audit run.
 */
export function buildManualCases(audit = {}) {
  const captures = asArray(audit?.captures);
  const issues = asArray(audit?.issues);
  const shared = commonPreconditions(audit, captures);

  return DEFINITIONS.map((definition) => ({
    id: definition.id,
    category: definition.category,
    title: definition.title,
    preconditions: unique([...shared, ...definition.preconditions]),
    steps: definition.steps.map((action, index) => ({ step: index + 1, action })),
    expectedResult: definition.expectedResult,
    automatable: false,
    evidence: evidenceFor(audit, definition, captures, issues),
  }));
}

