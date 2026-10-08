import type { FlowCaseDefinition } from './agent-flow-cases';

type ProductTourCaseInput = Pick<
  FlowCaseDefinition,
  'id' | 'title' | 'description' | 'steps' | 'expectedResult' | 'tags'
> & Partial<Omit<
  FlowCaseDefinition,
  'id' | 'title' | 'description' | 'steps' | 'expectedResult' | 'tags'
>>;

function defineProductTourCase(
  input: ProductTourCaseInput,
): FlowCaseDefinition {
  return {
    module: 'Product Tour',
    category: 'Functional',
    scenarioType: 'Positive',
    type: 'Automation',
    priority: 'P1',
    severity: 'High',
    preconditions: [
      'A valid authenticated June session is available.',
      'The active business exposes Explore June AI.',
    ],
    automatable: true,
    writeOperation: false,
    ...input,
  };
}

export const PRODUCT_TOUR_FLOW_CASES: FlowCaseDefinition[] = [
  defineProductTourCase({
    id: 'PT-001',
    module: 'Platform overview tour',
    title: 'Complete the Platform Overview guided tour',
    description: 'Verify the seven recorded platform guidance steps and completion action.',
    steps: [
      'Open Explore June AI from the authenticated account menu.',
      'Launch Platform Overview.',
      'Verify all seven ordered step descriptions and counters.',
      'Complete the tour with Done.',
    ],
    expectedResult: 'The Platform Overview tour shows all seven recorded steps on Task and closes with Done.',
    tags: ['flow', 'product-tour', 'platform-overview', 'navigation'],
  }),
  defineProductTourCase({
    id: 'PT-002',
    module: 'Agents tour',
    title: 'Complete the Agents guided tour without creating an agent',
    description: 'Verify discovery and all New Agent setup guidance without submitting business data.',
    steps: [
      'Launch Agents from Explore June AI.',
      'Verify the four discovery and create-introduction steps.',
      'Verify all twelve New Agent guidance steps.',
      'Choose Done and cancel the empty draft.',
    ],
    expectedResult: 'All sixteen Agents steps appear in order and the empty New Agent draft is exited without creation.',
    tags: ['flow', 'product-tour', 'agents', 'e2e'],
  }),
  defineProductTourCase({
    id: 'PT-003',
    module: 'Tools tour',
    title: 'Complete the Tools guided tour without creating a tool',
    description: 'Verify tool discovery, API Details and Access guidance without saving.',
    steps: [
      'Launch Tools from Explore June AI.',
      'Verify all ten ordered tour steps.',
      'Choose Done and cancel the empty tool draft.',
    ],
    expectedResult: 'All ten Tools steps appear in order and no Tool is created.',
    tags: ['flow', 'product-tour', 'tools', 'e2e'],
  }),
  defineProductTourCase({
    id: 'PT-004',
    module: 'Connectors tour',
    title: 'Complete the Connectors guided tour without creating a connector',
    description: 'Verify connector discovery, Information and Access guidance without saving.',
    steps: [
      'Launch Connectors from Explore June AI.',
      'Verify all seven ordered tour steps.',
      'Choose Done and cancel the empty connector draft.',
    ],
    expectedResult: 'All seven Connectors steps appear in order and no Connector is created.',
    tags: ['flow', 'product-tour', 'connectors', 'e2e'],
  }),
  defineProductTourCase({
    id: 'PT-005',
    module: 'Knowledge tour',
    title: 'Complete the Knowledge guided tour without creating a knowledge base',
    description: 'Verify provider, discovery, Documents and Access guidance without initialization.',
    steps: [
      'Launch Knowledge from Explore June AI.',
      'Verify all ten ordered tour steps.',
      'Choose Done and cancel the empty Knowledge Base draft.',
    ],
    expectedResult: 'All ten Knowledge steps appear in order and no Knowledge Base is initialized.',
    tags: ['flow', 'product-tour', 'knowledge', 'e2e'],
  }),
  defineProductTourCase({
    id: 'PT-006',
    module: 'Guardrails tour',
    title: 'Complete the Guardrails guided tour without creating a guardrail',
    description: 'Verify guardrail discovery, API Details and Access guidance without saving.',
    steps: [
      'Launch Guardrails from Explore June AI.',
      'Verify all eight ordered tour steps.',
      'Choose Done and cancel the empty guardrail draft.',
    ],
    expectedResult: 'All eight Guardrails steps appear in order and no Guardrail is created.',
    tags: ['flow', 'product-tour', 'guardrails', 'e2e'],
  }),
  defineProductTourCase({
    id: 'PT-007',
    module: 'UI Components tour',
    title: 'Complete the UI Components guided tour without creating a component',
    description: 'Verify UI Component discovery, Designs and Visibility guidance without saving.',
    steps: [
      'Launch UI components from Explore June AI.',
      'Verify all nine ordered tour steps.',
      'Choose Done and cancel the empty UI Component draft.',
    ],
    expectedResult: 'All nine UI Components steps appear in order and no UI Component is created.',
    tags: ['flow', 'product-tour', 'ui-components', 'e2e'],
  }),
  defineProductTourCase({
    id: 'PT-008',
    module: 'Inbox tour',
    title: 'Complete the Inbox guided tour',
    description: 'Verify refresh, agent, sort, date, pagination and workspace guidance.',
    steps: [
      'Launch Inbox from Explore June AI.',
      'Verify all seven ordered tour steps.',
      'Complete the tour with Done.',
    ],
    expectedResult: 'The Inbox tour shows all seven recorded steps on the Inbox route and closes with Done.',
    tags: ['flow', 'product-tour', 'inbox', 'e2e'],
  }),
  defineProductTourCase({
    id: 'PT-009',
    module: 'Tour launcher',
    title: 'Show every recorded Explore June AI entry',
    description: 'Verify the authenticated launcher exposes the complete recorded tour inventory.',
    steps: [
      'Open the authenticated account menu.',
      'Open Explore June AI.',
      'Verify the eight recorded entries in the launcher.',
    ],
    expectedResult: 'Explore June AI lists Platform Overview, Agents, Tools, Connectors, Knowledge, Guardrails, UI components and Inbox.',
    tags: ['flow', 'product-tour', 'launcher', 'navigation'],
  }),
  defineProductTourCase({
    id: 'PT-010',
    module: 'Tour dismissal',
    title: 'Skip a guided tour without leaving the selected module',
    description: 'Verify Skip dismisses guidance without unintended navigation or creation.',
    scenarioType: 'Negative',
    steps: [
      'Launch Platform Overview.',
      'Advance once.',
      'Choose Skip.',
      'Verify the popover closes and Task remains selected.',
    ],
    expectedResult: 'Skip closes the active tour, keeps the configured route and creates no business record.',
    tags: ['flow', 'negative', 'product-tour', 'skip', 'navigation'],
  }),
  defineProductTourCase({
    id: 'PT-011',
    module: 'Tour navigation',
    title: 'Move backward within a guided tour',
    description: 'Verify Back returns to the preceding recorded step and counter.',
    scenarioType: 'Positive + Negative',
    steps: [
      'Launch Platform Overview.',
      'Advance from step one to step two.',
      'Choose Back.',
      'Verify the first description and Step 1 of 7 counter return.',
      'Skip the tour.',
    ],
    expectedResult: 'Back restores the immediately preceding tour step without closing or duplicating the popover.',
    tags: ['flow', 'negative', 'product-tour', 'back-navigation'],
  }),
  defineProductTourCase({
    id: 'PT-012',
    module: 'Tour authorization',
    title: 'Block anonymous access to the Product Tour launcher',
    description: 'Verify the authenticated Tour launcher is unavailable without a saved session.',
    category: 'Security',
    scenarioType: 'Negative + Security',
    securityArea: 'Authentication and unauthorized feature exposure',
    owaspReference: 'OWASP A01:2021 Broken Access Control',
    severity: 'Critical',
    steps: [
      'Open Task in a browser context with no storage state.',
      'Wait for authentication routing to settle.',
      'Verify the Explore June AI launcher is not available anonymously.',
    ],
    expectedResult: 'An anonymous visitor is redirected to authentication or cannot access Explore June AI controls.',
    tags: ['flow', 'negative', 'security', 'product-tour', 'authentication'],
  }),
];
