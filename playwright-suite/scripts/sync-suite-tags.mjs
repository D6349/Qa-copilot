import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  automatedSuiteTags,
  normalizeTag,
} from '../test-cases/suite-tag-registry.mjs';

const EXPECTED_CASE_COUNT = 217;
const PRIMARY_TEST_FILES = Object.freeze([
  'tests/account/account.setup.ts',
  'tests/agents/agents-flow.spec.ts',
  'tests/tools/tools-flow.spec.ts',
  'tests/connectors/connectors-flow.spec.ts',
  'tests/knowledge/knowledge-flow.spec.ts',
  'tests/guardrails/guardrails-flow.spec.ts',
  'tests/ui-components/ui-components-flow.spec.ts',
  'tests/product-tour/product-tour-flow.spec.ts',
]);
const KNOWLEDGE_TEST_FILE = 'tests/knowledge/knowledge-flow.spec.ts';
const TEST_TITLE_PATTERN = /\btest(?:\.(?:only|skip|fixme))?\s*\(\s*(?:'((?:\\.|[^'\\\r\n])*)'|"((?:\\.|[^"\\\r\n])*)")/g;
const KNOWLEDGE_CASE_PATTERN = /\bknowledgeCase\s*\(\s*(?:'(KB-\d{3})'|"(KB-\d{3})")/g;
const CASE_ID_PATTERN = /^([A-Z]{2}-\d{3})(?=\s|$)/;
const TITLE_TAG_PATTERN = /@([A-Za-z][A-Za-z0-9-]*)\b/g;

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const suiteRoot = path.resolve(scriptDirectory, '..');
const argumentsList = process.argv.slice(2);
const checkOnly = argumentsList.includes('--check');
const unknownArguments = argumentsList.filter((value) => value !== '--check');

if (unknownArguments.length > 0) {
  throw new Error(
    'Unknown sync-suite-tags argument(s): ' + unknownArguments.join(', '),
  );
}

const caseLocations = new Map();
const duplicateCases = [];
const missingTags = [];
const filePlans = PRIMARY_TEST_FILES.map(prepareFilePlan);

assert.equal(
  duplicateCases.length,
  0,
  'Duplicate automated case IDs were found: ' + duplicateCases
    .map((item) => `${item.caseId} (${item.first}, ${item.duplicate})`)
    .join(', '),
);
assert.equal(
  caseLocations.size,
  EXPECTED_CASE_COUNT,
  `Expected exactly ${EXPECTED_CASE_COUNT} unique automated case IDs across `
    + `the eight primary test files; found ${caseLocations.size}.`,
);

if (checkOnly) {
  if (missingTags.length > 0) {
    console.error(
      `Suite tag check failed: ${missingTags.length} case title(s) are missing `
        + 'one or more registry tags.',
    );
    for (const item of missingTags) {
      console.error(
        `${item.file}:${item.line} ${item.caseId}: missing `
          + item.tags.map((tag) => `@${tag}`).join(' '),
      );
    }
    process.exitCode = 1;
  } else {
    console.log(
      `Suite tag check passed for ${EXPECTED_CASE_COUNT} unique automated cases `
        + `across ${PRIMARY_TEST_FILES.length} primary test files.`,
    );
  }
} else {
  let writtenFiles = 0;
  for (const plan of filePlans) {
    if (plan.source === plan.updatedSource) continue;
    fs.writeFileSync(plan.absolutePath, plan.updatedSource, 'utf8');
    writtenFiles += 1;
  }
  console.log(
    `Suite tags synchronized for ${EXPECTED_CASE_COUNT} unique automated cases: `
      + `${missingTags.length} title(s) updated in ${writtenFiles} file(s).`,
  );
}

function prepareFilePlan(relativePath) {
  const absolutePath = path.resolve(suiteRoot, relativePath);
  assert.equal(
    fs.existsSync(absolutePath),
    true,
    `Primary test file is missing: ${relativePath}`,
  );

  const source = fs.readFileSync(absolutePath, 'utf8');
  TEST_TITLE_PATTERN.lastIndex = 0;
  const updatedSource = source.replace(
    TEST_TITLE_PATTERN,
    (fullMatch, singleQuotedTitle, doubleQuotedTitle, matchOffset) => {
      const rawTitle = singleQuotedTitle ?? doubleQuotedTitle;
      const caseMatch = CASE_ID_PATTERN.exec(rawTitle);
      if (!caseMatch) return fullMatch;

      const caseId = caseMatch[1];
      const quote = singleQuotedTitle === undefined ? '"' : "'";
      const marker = quote + rawTitle + quote;
      const markerOffset = fullMatch.lastIndexOf(marker);
      assert.notEqual(
        markerOffset,
        -1,
        `Could not locate the title string for ${caseId} in ${relativePath}.`,
      );

      const titleOffset = matchOffset + markerOffset + 1;
      const location = `${relativePath}:${lineNumber(source, titleOffset)}`;
      trackCaseLocation(caseId, location);

      const existingTags = [...rawTitle.matchAll(TITLE_TAG_PATTERN)]
        .map((match) => normalizeTag(match[1]))
        .filter(Boolean);
      const existingTagSet = new Set(existingTags);
      const requiredTags = automatedSuiteTags(caseId, existingTags);
      const tagsToAppend = requiredTags.filter(
        (tag) => !existingTagSet.has(normalizeTag(tag)),
      );
      if (tagsToAppend.length === 0) return fullMatch;

      missingTags.push({
        caseId,
        file: relativePath,
        line: lineNumber(source, titleOffset),
        tags: tagsToAppend,
      });

      const trailingWhitespace = rawTitle.match(/\s*$/)?.[0] || '';
      const titleWithoutTrailingWhitespace = trailingWhitespace
        ? rawTitle.slice(0, -trailingWhitespace.length)
        : rawTitle;
      const updatedTitle = titleWithoutTrailingWhitespace
        + tagsToAppend.map((tag) => ` @${tag}`).join('')
        + trailingWhitespace;
      const titleStart = markerOffset + 1;
      return fullMatch.slice(0, titleStart)
        + updatedTitle
        + fullMatch.slice(titleStart + rawTitle.length);
    },
  );

  if (relativePath === KNOWLEDGE_TEST_FILE) {
    assert.match(
      source,
      /automatedSuiteTags\s*\(\s*definition\.id\s*,\s*definition\.tags\s*\)/,
      'Knowledge case titles must derive their tags from automatedSuiteTags.',
    );
    const knowledgeIds = [];
    KNOWLEDGE_CASE_PATTERN.lastIndex = 0;
    for (const match of source.matchAll(KNOWLEDGE_CASE_PATTERN)) {
      const caseId = match[1] ?? match[2];
      const idOffset = (match.index || 0) + match[0].indexOf(caseId);
      knowledgeIds.push(caseId);
      trackCaseLocation(
        caseId,
        `${relativePath}:${lineNumber(source, idOffset)}`,
      );
    }
    assert.deepEqual(
      knowledgeIds,
      Array.from(
        { length: 30 },
        (_unused, index) => `KB-${String(index + 1).padStart(3, '0')}`,
      ),
      'Knowledge cases must be literal, ordered KB-001 through KB-030 calls.',
    );
  }

  return { absolutePath, source, updatedSource };
}

function trackCaseLocation(caseId, location) {
  const previousLocation = caseLocations.get(caseId);
  if (previousLocation) {
    duplicateCases.push({
      caseId,
      first: previousLocation,
      duplicate: location,
    });
  } else {
    caseLocations.set(caseId, location);
  }
}

function lineNumber(source, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source.charCodeAt(index) === 10) line += 1;
  }
  return line;
}
