import { test, expect } from '@playwright/test';
import { AgentsPage, type AgentScope } from '../../pages/agents.page';

test.describe('Recorded June end-to-end flow', () => {
  test('AF-001 searches, filters and sorts agents @flow @smoke', async ({ page }) => {
    test.setTimeout(180_000);
    const agents = new AgentsPage(page);
    await agents.goto();

    const initialNames = await agents.visibleAgentNames();
    expect(initialNames.length).toBeGreaterThan(0);

    await test.step('Search for an agent visible in the active business', async () => {
      const targetName = initialNames[0];
      await agents.searchAgents.fill(targetName);
      await expect(agents.agentCard(targetName)).toBeVisible();
      const matches = await agents.visibleAgentNames();
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.every((name) => name.toLowerCase().includes(targetName.toLowerCase())))
        .toBeTruthy();

      await agents.searchAgents.clear();
      await expect(agents.agentCards).toHaveCount(initialNames.length);
    });

    await test.step('Exercise every recorded scope tab', async () => {
      const scopes: AgentScope[] = ['My Agents', 'Public Agents', 'Shared Agents', 'All'];
      for (const scope of scopes) await agents.selectScope(scope);
      await expect(agents.agentCards).toHaveCount(initialNames.length, { timeout: 30_000 });
    });

    await test.step('Exercise the recorded sort choices', async () => {
      await agents.sortBy('Ascending');
      await expect(agents.agentCards).toHaveCount(initialNames.length, { timeout: 60_000 });
      const ascending = await agents.visibleAgentNames();
      expect(ascending.length).toBeGreaterThan(0);

      await agents.sortBy('Descending');
      await expect(agents.agentCards).toHaveCount(initialNames.length, { timeout: 60_000 });
      const descending = await agents.visibleAgentNames();
      expect(descending).toEqual([...ascending].reverse());

      await agents.sortBy('Last Modified');
      await expect(agents.agentCards).toHaveCount(initialNames.length, { timeout: 30_000 });
    });
  });

  test('AF-002 navigates through New Chat, Search Chats and Exchange @flow', async ({ page }) => {
    const agents = new AgentsPage(page);
    await agents.goto();

    await test.step('Open a new chat draft without sending it', async () => {
      await agents.newChatButton.click();
      const prompt = page.getByRole('textbox', { name: 'Ask anything' });
      await expect(prompt).toBeVisible();
      await prompt.fill('Hello');
      await expect(prompt).toHaveValue('Hello');
    });

    await test.step('Open agent chat search', async () => {
      await agents.searchChatsButton.click();
      await page.getByRole('tab', { name: 'Agents' }).click();
      const search = page.getByRole('textbox', { name: 'Search chats...' });
      await expect(search).toBeVisible();
      await search.fill('s');
      await expect(search).toHaveValue('s');
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button').first().click();
      await expect(dialog).toBeHidden();
    });

    await test.step('Open Exchange and return to Agents', async () => {
      await agents.exchangeButton.click();
      await expect(page.getByRole('heading', { name: 'Exchange', exact: true })).toBeVisible();
      await expect(page.getByPlaceholder('Search exchange agents...')).toBeVisible();
      await agents.agentsButton.click();
      await agents.expectLoaded();
    });
  });

  test('AF-003 opens an existing agent task and returns @flow @regression', async ({ page }) => {
    test.setTimeout(120_000);
    const agents = new AgentsPage(page);
    await agents.goto();

    const [firstAgent] = await agents.visibleAgentNames();
    expect(firstAgent).toBeTruthy();
    await agents.agentCard(firstAgent).click();
    await expect(page).toHaveURL(/\/task\?(?:room|action)=/);
    await expect(page.getByRole('textbox', { name: 'Ask anything' })).toBeVisible();

    await expect(agents.agentsButton).toBeEnabled({ timeout: 60_000 });
    await agents.agentsButton.click();
    await agents.expectLoaded();
  });

  test('AF-004 opens the business switcher without changing account @flow', async ({ page }) => {
    const agents = new AgentsPage(page);
    await agents.goto();

    await agents.openAccountMenu();
    await page.getByRole('menuitem', { name: 'Switch Account' }).click();
    await expect(page.getByText('Select Business', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('AF-005 creates an agent from the recorded wizard @flow @write', async ({ page }) => {
    test.skip(
      process.env.RUN_WRITE_FLOW !== '1',
      'Creates real data. Set RUN_WRITE_FLOW=1 only in an approved QA environment.',
    );
    test.setTimeout(180_000);

    const agents = new AgentsPage(page);
    const agentName = `QA E2E ${Date.now().toString().slice(-8)}`;
    await agents.goto();
    await agents.createAgentButton.click();

    await page.getByRole('textbox', { name: 'Give your agent a short name' }).fill(agentName);
    await page.getByRole('menu', { name: 'Select the model' }).click();
    await page.getByRole('menuitem', { name: /GPT o3-mini/ }).first().click();
    await page.getByRole('textbox', { name: /Describe what this agent will/i })
      .fill('Temporary agent created by the reusable Playwright end-to-end flow.');
    await page.getByRole('button', { name: 'Generate agent details' }).click();

    for (const tab of [
      'Instructions', 'Tools', 'Connectors', 'Swarm', 'Knowledge',
      'Guardrail', 'UI Component', 'Access',
    ]) {
      const tabControl = page.getByRole('tab', { name: tab, exact: true });
      await expect(tabControl).toBeVisible({ timeout: 60_000 });
      await tabControl.click();
    }

    await expect(page.getByRole('textbox', { name: 'Search by employee mail' })).toBeVisible();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await agents.expectLoaded();
    await expect(agents.agentCard(agentName)).toBeVisible();
  });
});
