import path from 'node:path';
import {
  expect,
  type Locator,
  type Page,
} from '@playwright/test';

export type KnowledgeProvider = 'Qdrant' | 'Chroma';
export type KnowledgeTab = 'Information' | 'Documents' | 'Access';

export interface QdrantConnectionInput {
  apiKey: string;
  endpoint: string;
}

export interface ChromaConnectionInput {
  apiKey: string;
  tenant: string;
  database?: string;
  collection?: string;
}

export interface KnowledgeDocumentPayload {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/**
 * Stable, privacy-aware actions derived from the sanitized Knowledge recording.
 *
 * Provider controls have changed markup between releases, so the object starts
 * with accessible names and uses narrow placeholder/label fallbacks only when
 * the semantic locator is not visible. Connection controls are marked for the
 * suite's final-state evidence mask before any environment value is entered.
 */
export class KnowledgePage {
  readonly page: Page;
  readonly path = '/knowledge-base';
  readonly heading: Locator;
  readonly searchKnowledge: Locator;
  readonly createKnowledgeButton: Locator;
  readonly knowledgeCards: Locator;
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly informationTab: Locator;
  readonly documentsTab: Locator;
  readonly accessTab: Locator;
  readonly documentInput: Locator;
  readonly employeeSearchInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', {
      name: /knowledge(?:\s+base)?/i,
    }).first();
    this.searchKnowledge = page.getByRole('textbox', {
      name: /search.*knowledge/i,
    }).or(page.getByPlaceholder(/search.*knowledge/i)).first();
    this.createKnowledgeButton = page.getByRole('main').getByRole('button', {
      name: /^(?:knowledge base|create knowledge base|create new knowledge base|new knowledge base|add knowledge base|add new knowledge base)$/i,
    }).first();
    this.knowledgeCards = page.locator(
      '[data-slot="card"], article, [role="listitem"]',
    ).filter({
      has: page.locator('a[title], [role="heading"], [data-slot="card-title"]'),
    });
    this.nameInput = page.getByRole('textbox', {
      name: /knowledge.*name|name.*knowledge/i,
    }).or(page.getByPlaceholder('e.g. Product documentation')).first();
    this.descriptionInput = page.getByRole('textbox', {
      name: /description|describe the content/i,
    }).or(page.getByPlaceholder(/describe the content and how/i)).first();
    this.informationTab = page.getByRole('tab', {
      name: 'Information',
      exact: true,
    }).first();
    this.documentsTab = page.getByRole('tab', {
      name: 'Documents',
      exact: true,
    }).first();
    this.accessTab = page.getByRole('tab', {
      name: 'Access',
      exact: true,
    }).first();
    this.documentInput = page.locator('input[type="file"]').first();
    this.employeeSearchInput = page.getByRole('textbox', {
      name: /search by employee mail/i,
    }).or(page.getByPlaceholder(/search by employee mail/i)).first();
  }

  async goto(): Promise<void> {
    await this.page.goto(this.path, { waitUntil: 'domcontentloaded' });
    const ready = await this.waitForAnyVisible([
      this.heading,
      this.searchKnowledge,
      this.nameInput,
      this.providerButton('Qdrant'),
      this.providerButton('Chroma'),
    ], 30_000);

    if (!ready) {
      const login = this.page.getByRole('dialog', {
        name: /log in|sign up|sign in/i,
      });
      if (await login.isVisible().catch(() => false)) {
        throw new Error(
          'June authentication expired. Run "npm.cmd run auth:refresh" first.',
        );
      }
      throw new Error(
        'Knowledge Base did not load. Check the authenticated June session.',
      );
    }
    await expect(this.page).toHaveURL(
      new RegExp(this.path + '(?:[/?#]|$)'),
      { timeout: 30_000 },
    );
  }

  async openCreateForm(): Promise<void> {
    if (await this.nameInput.isVisible().catch(() => false)) return;
    await expect(this.createKnowledgeButton).toBeVisible();
    await this.createKnowledgeButton.click();
    await expect(this.nameInput).toBeVisible();
  }

  async cancelEditor(): Promise<void> {
    const editor = await this.firstVisible([
      this.page.getByRole('dialog').filter({ has: this.nameInput }),
      this.page.locator('[data-slot="dialog-content"]').filter({
        has: this.nameInput,
      }),
    ]);
    const scope = editor || this.page;
    const cancel = await this.firstVisible([
      scope.getByRole('button', { name: 'Cancel', exact: true }),
      scope.getByRole('button', { name: 'Close', exact: true }),
      scope.getByRole('button', { name: /close|dismiss/i }),
    ]);
    if (cancel) {
      await cancel.click();
    } else {
      await this.page.keyboard.press('Escape');
    }
    await this.page.goto(this.path, { waitUntil: 'domcontentloaded' });
  }

  providerButton(provider: KnowledgeProvider): Locator {
    return this.page.getByRole('button', {
      name: new RegExp('^\\s*' + provider + '(?:\\s+.*)?$', 'i'),
    }).first();
  }

  async openProvider(provider: KnowledgeProvider): Promise<Locator> {
    const button = this.providerButton(provider);
    await expect(button).toBeVisible();
    await button.click();
    const surface = await this.visibleProviderSurface(provider);
    await expect(surface).toBeVisible();
    return surface;
  }

  async providerPanel(provider: KnowledgeProvider): Promise<Locator> {
    return this.visibleProviderSurface(provider);
  }

  async providerSecretInput(provider: KnowledgeProvider): Promise<Locator> {
    const surface = await this.visibleProviderSurface(provider);
    return this.requireVisible([
      this.labeledEditableControl(
        surface,
        /api\s*key|credential|token/i,
      ),
      surface.locator('input[type="password"]'),
      surface.getByRole('textbox', {
        name: /[•*]{4,}|api\s*key|credential|token/i,
      }),
    ], provider + ' credential field');
  }

  async fillSyntheticProviderSecret(
    provider: KnowledgeProvider,
    syntheticValue: string,
  ): Promise<Locator> {
    await this.markEvidenceMask(await this.visibleProviderSurface(provider));
    const input = await this.providerSecretInput(provider);
    await this.markEvidenceMask(input);
    await input.fill(syntheticValue);
    return input;
  }

  async providerVerifyButton(provider: KnowledgeProvider): Promise<Locator> {
    const surface = await this.visibleProviderSurface(provider);
    return this.requireVisible([
      surface.getByRole('button', {
        name: /verify(?:\s+connection)?|test(?:\s+connection)?/i,
      }),
      this.page.getByRole('button', { name: 'Verify Connection', exact: true }),
    ], provider + ' Verify Connection action');
  }

  async connectionFields(provider: KnowledgeProvider): Promise<Locator[]> {
    const surface = await this.visibleProviderSurface(provider);
    const selectors = provider === 'Qdrant'
      ? [
        this.labeledEditableControl(surface, /api\s*key|credential|token/i),
        surface.locator('input[type="password"]'),
        surface.getByRole('textbox', { name: /[•*]{4,}|api\s*key|credential|token/i }),
        this.labeledEditableControl(surface, /endpoint|server.*url|url/i),
        surface.getByPlaceholder(/qdrant.*endpoint|https?:\/\//i),
      ]
      : [
        this.labeledEditableControl(surface, /api\s*key|credential|token/i),
        surface.locator('input[type="password"]'),
        surface.getByRole('textbox', { name: /[•*]{4,}|api\s*key|credential|token/i }),
        this.labeledEditableControl(surface, /tenant/i),
        surface.getByPlaceholder(/chroma.*tenant|your.*tenant/i),
        surface.getByRole('combobox'),
      ];
    return this.uniqueVisibleLocators(selectors);
  }

  async configureQdrant(input: QdrantConnectionInput): Promise<void> {
    const surface = await this.visibleProviderSurface('Qdrant');
    await this.markEvidenceMask(surface);
    const apiKey = await this.requireVisible([
      this.labeledEditableControl(surface, /api\s*key|credential|token/i),
      surface.locator('input[type="password"]'),
      surface.getByRole('textbox', { name: /[•*]{4,}|api\s*key|credential|token/i }),
    ], 'Qdrant credential field');
    const endpoint = await this.requireVisible([
      this.labeledEditableControl(surface, /endpoint|server.*url|url/i),
      surface.getByPlaceholder(/qdrant.*endpoint|https?:\/\//i),
      surface.getByRole('textbox').filter({
        hasNot: surface.locator('input[type="password"]'),
      }).nth(1),
    ], 'Qdrant endpoint field');
    await this.markEvidenceMask(apiKey);
    await this.markEvidenceMask(endpoint);
    await this.fillSensitiveValue(apiKey, input.apiKey, 'Qdrant credential');
    await this.fillSensitiveValue(endpoint, input.endpoint, 'Qdrant endpoint');
  }

  async configureChroma(input: ChromaConnectionInput): Promise<void> {
    const surface = await this.visibleProviderSurface('Chroma');
    await this.markEvidenceMask(surface);
    const apiKey = await this.requireVisible([
      this.labeledEditableControl(surface, /api\s*key|credential|token/i),
      surface.locator('input[type="password"]'),
      surface.getByRole('textbox', { name: /[•*]{4,}|api\s*key|credential|token/i }),
    ], 'Chroma credential field');
    const tenant = await this.requireVisible([
      this.labeledEditableControl(surface, /tenant/i),
      surface.getByPlaceholder(/chroma.*tenant|your.*tenant/i),
    ], 'Chroma tenant field');
    await this.markEvidenceMask(apiKey);
    await this.markEvidenceMask(tenant);
    await this.fillSensitiveValue(apiKey, input.apiKey, 'Chroma credential');
    await this.fillSensitiveValue(tenant, input.tenant, 'Chroma tenant');

    if (input.database) {
      await this.selectChromaDatabase(input.database, input.collection);
    }
    if (input.collection) await this.selectChromaCollection(input.collection);
  }

  async selectChromaDatabase(
    database: string,
    expectedCollection?: string,
  ): Promise<void> {
    const surface = await this.visibleProviderSurface('Chroma');
    const control = await this.chromaDatabaseControl();
    await this.markEvidenceMask(control);
    if (await control.evaluate((element) => element.tagName === 'SELECT')) {
      const selected = await control.selectOption({ label: database })
        .catch(() => control.selectOption(database));
      expect(selected.length).toBeGreaterThan(0);
      await expect(control.locator('option:checked')).toHaveText(database);
      return;
    }

    const databaseOptions = [
      this.page.getByRole('option', { name: database, exact: true }),
      this.page.getByRole('menuitem', { name: database, exact: true }),
    ];
    const collectionReady = expectedCollection
      ? [
        this.page.getByRole('option', {
          name: expectedCollection,
          exact: true,
        }),
        this.page.getByRole('menuitem', {
          name: expectedCollection,
          exact: true,
        }),
        this.page.getByText(expectedCollection, { exact: true }),
        surface.getByRole('combobox', { name: /collection/i }),
        surface.getByRole('button', {
          name: /collection|select.*collection/i,
        }),
      ]
      : [];
    const attempts = expectedCollection ? 3 : 1;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      let option = await this.firstVisible(databaseOptions);
      if (!option) {
        await control.click();
        await this.maskVisibleOptionSurface();
        if (
          expectedCollection
          && attempt > 0
          && await this.firstVisible(collectionReady)
        ) {
          return;
        }
        option = await this.requireVisible(
          databaseOptions,
          'Chroma database option',
        );
      }
      await option.click();
      await expect(control).toContainText(database);

      if (!expectedCollection) return;
      if (await this.waitForAnyVisible(collectionReady, 5_000)) return;
    }

    throw new Error(
      'Chroma collection did not load after selecting the configured database.',
    );
  }

  async selectChromaCollection(collection: string): Promise<void> {
    const deadline = Date.now() + 30_000;
    let labelledControl: Locator | null = null;
    do {
      const directOption = await this.firstVisible([
        this.page.getByRole('option', { name: collection, exact: true }),
        this.page.getByRole('menuitem', { name: collection, exact: true }),
        this.page.getByText(collection, { exact: true }),
      ]);
      if (directOption) {
        await directOption.click();
        return;
      }
      labelledControl = await this.chromaCollectionControl(false);
      if (labelledControl) break;
      await this.page.waitForTimeout(200);
    } while (Date.now() < deadline);

    if (labelledControl) {
      await this.markEvidenceMask(labelledControl);
      if (await labelledControl.evaluate(
        (element) => element.tagName === 'SELECT',
      )) {
        const selected = await labelledControl
          .selectOption({ label: collection })
          .catch(() => labelledControl.selectOption(collection));
        expect(selected.length).toBeGreaterThan(0);
        await expect(labelledControl.locator('option:checked'))
          .toHaveText(collection);
        return;
      }
      await labelledControl.click();
      await this.maskVisibleOptionSurface();
    }
    await this.chooseVisibleOption(
      collection,
      'Chroma collection option',
      30_000,
    );
  }

  async chromaDatabaseControl(): Promise<Locator> {
    const surface = await this.visibleProviderSurface('Chroma');
    return this.requireVisible([
      surface.getByRole('combobox', { name: /database/i }),
      surface.getByRole('button', { name: /database|select.*database/i }),
      surface.getByRole('combobox').first(),
    ], 'Chroma database selector');
  }

  async chromaCollectionControl(required = true): Promise<Locator | null> {
    const surface = await this.visibleProviderSurface('Chroma');
    const control = await this.firstVisible([
      surface.getByRole('combobox', { name: /collection/i }),
      surface.getByRole('button', { name: /collection|select.*collection/i }),
      surface.getByRole('combobox').nth(1),
    ]);
    if (!control && required) {
      throw new Error('Unable to locate visible Chroma collection selector.');
    }
    return control;
  }

  async verifyProviderConnection(provider: KnowledgeProvider): Promise<void> {
    const surface = await this.visibleProviderSurface(provider);
    const verify = await this.providerVerifyButton(provider);
    const verifiedText = /(?:connection\s+(?:verified|successful)|verified\s+successfully|successfully\s+(?:connected|verified)|connected\s+successfully|^\s*(?:connected|verified)\s*[.!]?\s*$)/i;
    const panelOutcome = surface.getByText(verifiedText);
    const toastSurface = this.page.locator([
      '[role="alert"]',
      '[role="status"]',
      '[data-sonner-toast]',
      '[data-radix-toast-viewport] > *',
    ].join(', '));
    const connectionToast = toastSurface.filter({ hasText: verifiedText });
    const providerToast = toastSurface
      .filter({ hasText: new RegExp(provider, 'i') })
      .filter({ hasText: /verified|connected|success/i });
    const panelCountBefore = await panelOutcome.count();
    const toastCountBefore = await connectionToast.or(providerToast).count();
    await verify.click();
    await expect.poll(async () => {
      const panelCount = await panelOutcome.count();
      if (
        panelCount > panelCountBefore
        && await panelOutcome.last().isVisible().catch(() => false)
      ) {
        return true;
      }
      const correlatedToast = connectionToast.or(providerToast);
      const toastCount = await correlatedToast.count();
      return toastCount > toastCountBefore
        && await correlatedToast.last().isVisible().catch(() => false);
    }, {
      message: provider + ' verification did not produce a correlated success state.',
      timeout: 60_000,
    }).toBe(true);
  }

  async closeProvider(): Promise<void> {
    const verify = this.page.getByRole('button', {
      name: /verify(?:\s+connection)?|test(?:\s+connection)?/i,
    });
    const surface = await this.requireVisible([
      this.page.getByRole('dialog').filter({ has: verify }),
      this.page.locator('[data-slot="dialog-content"]').filter({ has: verify }),
      this.page.locator('div.fixed.inset-0.z-50').filter({ has: verify }),
    ], 'provider dialog');
    const control = await this.requireVisible([
      surface.locator('[data-slot="dialog-close"]'),
      surface.getByRole('button', { name: 'Close', exact: true }),
      surface.getByRole('button', {
        name: /^(?:close|dismiss|[×✕✖✗✘x])$/i,
      }),
    ], 'provider Close action');
    await control.click();
    await expect(surface).toBeHidden();
  }

  async fillInformation(options: {
    name: string;
    description?: string;
  }): Promise<void> {
    await expect(this.nameInput).toBeVisible();
    await this.nameInput.fill(options.name);
    if (options.description !== undefined) {
      await this.revealDescription();
      await expect(this.descriptionInput).toBeVisible();
      await this.descriptionInput.fill(options.description);
    }
  }

  async revealDescription(): Promise<void> {
    if (await this.descriptionInput.isVisible().catch(() => false)) return;
    const show = await this.requireVisible([
      this.page.getByRole('button', { name: /\+?\s*show/i }),
      this.page.getByText('+ Show', { exact: true }),
    ], 'description Show action');
    await show.click();
    await expect(this.descriptionInput).toBeVisible();
  }

  async providerSelectionControl(): Promise<Locator> {
    const surface = await this.editorSurface();
    const providerValue = /^(?:select provider|qdrant|chroma|pinecone)$/i;
    return this.requireVisible([
      surface.getByRole('combobox', { name: /provider/i }),
      surface.getByRole('combobox').filter({ hasText: providerValue }),
      surface.getByRole('button', { name: providerValue }),
    ], 'Knowledge provider selector');
  }

  async selectKnowledgeProvider(provider: KnowledgeProvider): Promise<void> {
    const control = await this.providerSelectionControl();
    await control.click();
    await this.chooseVisibleOption(provider, provider + ' provider option');
    await expect(control).toContainText(provider);
  }

  async providerCollectionControl(
    provider: KnowledgeProvider,
  ): Promise<Locator> {
    const surface = await this.editorSurface();
    const collectionName = new RegExp(
      '(?:select\\s+)?' + provider + '\\s+collection|collection',
      'i',
    );
    const exactCollectionText = new RegExp(
      '^\\s*(?:select\\s+)?' + provider + '\\s+collection\\s*$',
      'i',
    );
    const visibleCollectionText = surface.getByText(exactCollectionText);
    const control = await this.requireVisible([
      surface.getByRole('combobox', { name: collectionName }),
      surface.getByRole('button', { name: collectionName }),
      surface.getByRole('combobox').filter({ hasText: collectionName }),
      surface.getByRole('button').filter({ hasText: collectionName }),
      visibleCollectionText.locator(
        'xpath=ancestor-or-self::*[self::button or @role=combobox][1]',
      ),
      surface.getByRole('combobox').nth(1),
    ], provider + ' collection selector', 60_000);
    await this.markEvidenceMask(control);
    return control;
  }

  async selectProviderCollection(
    provider: KnowledgeProvider,
    collection: string,
  ): Promise<void> {
    const control = await this.providerCollectionControl(provider);
    const currentValue = (await control.textContent() || '').trim();
    if (currentValue.includes(collection)) {
      await expect(control).toContainText(collection);
      return;
    }
    await expect(control).toBeEnabled({ timeout: 60_000 });
    await control.click();
    await this.maskVisibleOptionSurface();
    await this.chooseVisibleOption(
      collection,
      provider + ' collection option',
      30_000,
    );
    const selectedControl = await this.providerCollectionControl(provider);
    await expect(selectedControl).toContainText(collection);
  }

  async initializedStatus(): Promise<Locator> {
    const surface = await this.editorSurface();
    return this.requireVisible([
      surface.getByRole('button', { name: 'Initialized', exact: true }),
      surface.getByText('Initialized', { exact: true }),
    ], 'Knowledge Initialized status');
  }

  async openIndexConfiguration(
    provider: KnowledgeProvider,
  ): Promise<Locator> {
    const surface = await this.editorSurface();
    const escapedProvider = provider.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exactName = new RegExp(
      '^\\s*' + escapedProvider + '\\s+index\\s*$',
      'i',
    );
    const trigger = await this.requireVisible([
      surface.getByRole('button', { name: exactName }),
      surface.getByRole('button', {
        name: new RegExp(
          '(?:' + escapedProvider + '.*index|index.*' + escapedProvider + ')',
          'i',
        ),
      }),
    ], provider + ' index configuration action');
    await trigger.click();
    const indexSurface = await this.indexSurface(provider);
    await expect(indexSurface).toBeVisible();
    return indexSurface;
  }

  async indexNameInput(provider: KnowledgeProvider): Promise<Locator> {
    const surface = await this.indexSurface(provider);
    return this.requireVisible([
      surface.getByRole('textbox', {
        name: this.indexNamePattern(provider),
      }),
      surface.getByPlaceholder(/(?:chroma|qdrant|index).*name/i),
    ], provider + ' index name');
  }

  async fillIndexName(
    provider: KnowledgeProvider,
    name: string,
  ): Promise<void> {
    const input = await this.indexNameInput(provider);
    await input.fill(name);
    await expect(input).toHaveValue(name);
  }

  async selectIndexEmbeddingModel(
    provider: KnowledgeProvider,
    model: string,
  ): Promise<void> {
    const surface = await this.indexSurface(provider);
    const optionName = this.embeddingOptionPattern(model);
    const directOption = await this.firstVisible([
      surface.getByRole('option', { name: optionName }),
      surface.getByRole('radio', { name: optionName }),
      surface.locator('[data-slot="select-item"]').filter({
        hasText: optionName,
      }),
    ]);
    if (directOption) {
      await directOption.click();
      await this.expectIndexEmbeddingModelSelected(provider, model);
      return;
    }

    const control = await this.requireVisible([
      surface.getByRole('combobox', { name: /embedding|model/i }),
      surface.getByRole('button', {
        name: /select embedding model|embedding (?:small|large)/i,
      }),
    ], provider + ' index embedding selector');
    await control.click();
    const option = await this.requireVisible([
      this.page.getByRole('option', { name: optionName }),
      this.page.getByRole('menuitem', { name: optionName }),
    ], model + ' index embedding option');
    await option.click();
    await expect(control).toContainText(model);
  }

  async expectIndexEmbeddingModelSelected(
    provider: KnowledgeProvider,
    model: string,
  ): Promise<void> {
    const surface = await this.indexSurface(provider);
    const optionName = this.embeddingOptionPattern(model);
    await this.requireVisible([
      surface.getByRole('option', {
        name: optionName,
        selected: true,
      }),
      surface.getByRole('radio', {
        name: optionName,
        checked: true,
      }),
      surface.locator([
        '[aria-selected="true"]',
        '[aria-checked="true"]',
        '[data-state="checked"]',
        '[data-state="selected"]',
      ].join(', ')).filter({ hasText: optionName }),
      surface.getByRole('combobox', { name: /embedding|model/i }).filter({
        hasText: model,
      }),
      surface.getByRole('button', { name: optionName }),
    ], 'selected ' + model + ' index embedding model');
  }

  async saveIndexConfiguration(provider: KnowledgeProvider): Promise<void> {
    const surface = await this.indexSurface(provider);
    const save = await this.requireVisible([
      surface.getByRole('button', { name: 'Save', exact: true }),
    ], provider + ' index Save action');
    await expect(save).toBeEnabled();
    await save.click();
  }

  async closeIndexConfiguration(provider: KnowledgeProvider): Promise<void> {
    const surface = await this.visibleIndexSurface(provider);
    if (!surface) return;
    // The surface is the nearest nested dialog containing the index-name
    // field, so its exact Close action cannot target the outer editor.
    const close = await this.requireVisible([
      surface.getByRole('button', { name: 'Close', exact: true }),
      surface.locator('[data-slot="dialog-close"]'),
      surface.getByRole('button', { name: 'Cancel', exact: true }),
    ], provider + ' index Close action');
    await close.click();
    await expect(surface).toBeHidden();
  }

  async visibleKnowledgeProviderOptions(): Promise<string[]> {
    const control = await this.providerSelectionControl();
    await control.click();
    try {
      const options = this.page.getByRole('option');
      await expect(options.first()).toBeVisible();
      return (await options.allTextContents())
        .map((value) => value.trim())
        .filter(Boolean);
    } finally {
      await this.page.keyboard.press('Escape').catch(() => undefined);
    }
  }

  async embeddingControl(): Promise<Locator> {
    const surface = await this.editorSurface();
    return this.requireVisible([
      surface.getByRole('combobox', { name: /embedding|model/i }),
      surface.getByRole('combobox').filter({
        hasText: /select embedding model|embedding (?:small|large)/i,
      }),
      surface.getByRole('button', {
        name: /select embedding model|embedding (?:small|large)/i,
      }),
      surface.getByRole('combobox').nth(1),
    ], 'embedding model selector');
  }

  async selectEmbeddingModel(model: string): Promise<void> {
    const control = await this.embeddingControl();
    await control.click();
    const escapedModel = model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const optionName = new RegExp(
      '^\\s*' + escapedModel
        + '(?:\\s*(?:\\d+\\s*dim|light\\s+icon))?\\s*$',
      'i',
    );
    const option = await this.requireVisible([
      this.page.getByRole('option', { name: optionName }),
      this.page.getByRole('menuitem', { name: optionName }),
      this.page.locator('[data-slot="select-item"]').filter({
        hasText: optionName,
      }),
    ], 'embedding model option');
    await option.click();
    await expect(control).toContainText(model);
  }

  async visibleEmbeddingOptions(): Promise<string[]> {
    const control = await this.embeddingControl();
    await control.click();
    try {
      const options = this.page.getByRole('option', {
        name: /^\s*Embedding (?:Small|Large)\b/i,
      });
      await expect(options.first()).toBeVisible();
      return (await options.allTextContents())
        .map((value) => value
          .replace(/\s*(?:\d+\s*dim|light\s+icon)\s*$/i, '')
          .trim())
        .filter(Boolean);
    } finally {
      await this.page.keyboard.press('Escape').catch(() => undefined);
    }
  }

  async initialize(): Promise<void> {
    const button = await this.requireVisible([
      this.page.getByRole('button', { name: 'Initialize', exact: true }),
      this.page.getByRole('button', { name: /create.*knowledge/i }),
    ], 'Initialize action');
    await button.click();
    // Access and Update can already be visible before initialization. Waiting
    // for either of them lets the flow close the editor while the initialize
    // request is still completing. Documents is exposed only after the
    // provider index has finished initializing, so use it as the correlated
    // completion signal and also verify the persisted status.
    await expect(this.documentsTab).toBeVisible({ timeout: 60_000 });
    await expect(this.accessTab).toBeVisible({ timeout: 60_000 });
    await expect(await this.initializedStatus()).toBeVisible();
  }

  tab(name: KnowledgeTab): Locator {
    if (name === 'Information') return this.informationTab;
    if (name === 'Documents') return this.documentsTab;
    return this.accessTab;
  }

  async openTab(name: KnowledgeTab): Promise<void> {
    const tab = this.tab(name);
    await expect(tab).toBeVisible();
    await tab.click();
    await expect(tab).toHaveAttribute('data-state', 'active');
  }

  async uploadDocument(
    file: string | KnowledgeDocumentPayload,
  ): Promise<void> {
    await this.openTab('Documents');
    await expect(this.documentInput).toBeAttached();
    await expect(this.documentInput).toBeEnabled();
    await this.documentInput.setInputFiles(file);
    const fileName = typeof file === 'string' ? path.basename(file) : file.name;
    await expect(
      this.page.getByText(fileName, { exact: true }),
    ).toBeVisible({ timeout: 60_000 });
  }

  async documentRow(fileName: string): Promise<Locator> {
    const exactName = this.page.getByText(fileName, { exact: true });
    await expect(exactName).toBeVisible({ timeout: 60_000 });
    return exactName.locator('xpath=ancestor-or-self::*[self::tr or @role="row" or @data-slot="card"][1]');
  }

  async submitUpdate(): Promise<void> {
    const button = await this.requireVisible([
      this.page.getByRole('button', { name: 'Update', exact: true }),
      this.page.getByRole('button', { name: /save changes/i }),
    ], 'Knowledge Update action');
    await button.click();
  }

  knowledgeCard(name: string): Locator {
    return this.knowledgeCardMatches(name).first();
  }

  knowledgeCardMatches(name: string): Locator {
    return this.knowledgeCards.filter({
      has: this.page.getByText(name, { exact: true }),
    });
  }

  async exactKnowledgeCardCount(name: string): Promise<number> {
    if (await this.searchKnowledge.isVisible().catch(() => false)) {
      await this.searchKnowledge.fill(name);
      await this.page.waitForTimeout(250);
    }
    return this.knowledgeCardMatches(name).count();
  }

  async expectExactKnowledgeCardCount(
    name: string,
    expectedCount: number,
  ): Promise<void> {
    await expect.poll(
      () => this.exactKnowledgeCardCount(name),
      { timeout: 60_000 },
    ).toBe(expectedCount);
    if (expectedCount === 0) {
      await this.page.waitForTimeout(500);
      expect(await this.exactKnowledgeCardCount(name)).toBe(0);
    }
  }

  async knowledgeNames(): Promise<string[]> {
    const titled = this.knowledgeCards.locator(
      'a[title], [data-slot="card-title"], [role="heading"]',
    );
    return (await titled.allTextContents())
      .map((name) => name.trim())
      .filter(Boolean);
  }

  async visibleKnowledgeNames(): Promise<string[]> {
    await expect(this.knowledgeCards.first()).toBeVisible({ timeout: 30_000 });
    return this.knowledgeNames();
  }

  async searchForExact(name: string): Promise<Locator> {
    await this.expectExactKnowledgeCardCount(name, 1);
    const card = this.knowledgeCard(name);
    await expect(card).toBeVisible({ timeout: 60_000 });
    return card;
  }

  async clearSearch(): Promise<void> {
    if (await this.searchKnowledge.isVisible().catch(() => false)) {
      await this.searchKnowledge.clear();
      await expect(this.searchKnowledge).toHaveValue('');
    }
  }

  async openActionsExact(name: string): Promise<Locator> {
    const card = await this.searchForExact(name);
    await card.hover();
    const trigger = await this.requireVisible([
      card.getByRole('button', { name: /actions|more|options|menu/i }),
      card.locator('[data-slot="dropdown-menu-trigger"]'),
      card.locator('button[aria-haspopup="menu"]'),
      card.locator('button').last(),
    ], 'Knowledge card actions');
    await trigger.click();
    const menu = this.page.getByRole('menu').filter({
      has: this.page.getByRole('menuitem'),
    }).last();
    await expect(menu).toBeVisible();
    return menu;
  }

  async openEditExact(name: string): Promise<void> {
    const menu = await this.openActionsExact(name);
    const edit = menu.getByRole('menuitem', { name: /edit/i }).first();
    await expect(edit).toBeVisible();
    await edit.click();
    await expect(this.nameInput).toBeVisible();
  }

  async openDeleteConfirmationExact(
    targetName: string,
    runCreatedExactName: string,
    runMarker: string,
  ): Promise<Locator> {
    this.assertRunCreatedTarget(targetName, runCreatedExactName, runMarker);
    const card = await this.searchForExact(runCreatedExactName);
    await this.expectExactKnowledgeCardCount(runCreatedExactName, 1);
    await expect(card).toContainText(runCreatedExactName);
    await expect(
      card.getByText(runCreatedExactName, { exact: true }).first(),
    ).toBeVisible();
    const menu = await this.openActionsExact(runCreatedExactName);
    const deleteItem = menu.getByRole('menuitem', {
      name: /^delete(?:\s+knowledge(?:\s+base)?)?$/i,
    }).or(menu.getByText('Delete', { exact: true })).first();
    await expect(deleteItem).toBeVisible();
    await deleteItem.click();
    const confirmation = this.page.getByRole('alertdialog').filter({
      has: this.page.getByRole('button', { name: 'Delete', exact: true }),
    }).or(this.page.getByRole('dialog').filter({
      has: this.page.getByRole('button', { name: 'Delete', exact: true }),
    })).first();
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText(runCreatedExactName);
    return confirmation;
  }

  async cancelDeleteExact(
    targetName: string,
    runCreatedExactName: string,
    runMarker: string,
  ): Promise<void> {
    const confirmation = await this.openDeleteConfirmationExact(
      targetName,
      runCreatedExactName,
      runMarker,
    );
    await confirmation.getByRole('button', {
      name: /cancel|close/i,
    }).click();
    await expect(confirmation).toBeHidden();
    await expect(this.knowledgeCard(runCreatedExactName)).toBeVisible();
  }

  async confirmDeleteExact(
    targetName: string,
    runCreatedExactName: string,
    runMarker: string,
  ): Promise<void> {
    const confirmation = await this.openDeleteConfirmationExact(
      targetName,
      runCreatedExactName,
      runMarker,
    );
    await expect(confirmation).toContainText(runCreatedExactName);
    await confirmation.getByRole('button', {
      name: 'Delete',
      exact: true,
    }).click();
    await expect(confirmation).toBeHidden({ timeout: 60_000 });
    if (await this.searchKnowledge.isVisible().catch(() => false)) {
      await this.searchKnowledge.fill(runCreatedExactName);
    }
    await expect(this.knowledgeCard(runCreatedExactName)).toHaveCount(0, {
      timeout: 60_000,
    });
  }

  private assertRunCreatedTarget(
    targetName: string,
    runCreatedExactName: string,
    runMarker: string,
  ): void {
    if (
      !targetName
      || !runMarker
      || runMarker.length < 8
      || targetName !== runCreatedExactName
      || !targetName.includes(runMarker)
    ) {
      throw new Error(
        'Refusing destructive Knowledge action: target is not the exact '
        + 'Knowledge Base name created by this run.',
      );
    }
  }

  private async visibleProviderSurface(
    provider: KnowledgeProvider,
  ): Promise<Locator> {
    const providerText = new RegExp(provider, 'i');
    return this.requireVisible([
      this.page.getByRole('dialog').filter({ hasText: providerText }),
      this.page.locator('[data-slot="dialog-content"]').filter({ hasText: providerText }),
      this.page.locator('form').filter({ hasText: providerText }),
      this.page.locator('main')
        .filter({ has: this.providerButton(provider) })
        .filter({
          has: this.page.getByRole('button', {
            name: /verify(?:\s+connection)?|test(?:\s+connection)?/i,
          }),
        }),
    ], provider + ' connection panel');
  }

  private indexNamePattern(provider: KnowledgeProvider): RegExp {
    const escapedProvider = provider.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(
      '^\\s*(?:' + escapedProvider + '|index)(?:\\s+index)?\\s+name\\s*$',
      'i',
    );
  }

  private embeddingOptionPattern(model: string): RegExp {
    const escapedModel = model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('^\\s*' + escapedModel + '\\b', 'i');
  }

  private indexSurfaceCandidates(provider: KnowledgeProvider): Locator[] {
    const nameInput = this.page.getByRole('textbox', {
      name: this.indexNamePattern(provider),
    });
    const save = this.page.getByRole('button', {
      name: 'Save',
      exact: true,
    });
    return [
      nameInput.locator(`xpath=ancestor::*[@role='dialog'][1]`)
        .filter({ has: save }),
      nameInput.locator(
        `xpath=ancestor::*[@data-slot='dialog-content'][1]`,
      ).filter({ has: save }),
      nameInput.locator('xpath=ancestor::form[1]').filter({ has: save }),
    ];
  }

  private async visibleIndexSurface(
    provider: KnowledgeProvider,
  ): Promise<Locator | null> {
    return this.firstVisible(this.indexSurfaceCandidates(provider));
  }

  private async indexSurface(provider: KnowledgeProvider): Promise<Locator> {
    return this.requireVisible(
      this.indexSurfaceCandidates(provider),
      provider + ' index configuration dialog',
    );
  }

  private async editorSurface(): Promise<Locator> {
    return this.requireVisible([
      this.page.getByRole('dialog').filter({
        has: this.nameInput,
      }),
      this.page.locator('[data-slot="dialog-content"]').filter({
        has: this.nameInput,
      }),
      this.page.locator('form').filter({
        has: this.nameInput,
      }),
    ], 'Knowledge editor');
  }

  private async chooseVisibleOption(
    value: string,
    description: string,
    timeout = 10_000,
  ): Promise<void> {
    try {
      const option = await this.requireVisible([
        this.page.getByRole('option', { name: value, exact: true }),
        this.page.getByRole('menuitem', { name: value, exact: true }),
        this.page.getByText(value, { exact: true }),
      ], description, timeout);
      await option.click();
    } catch {
      throw new Error('Unable to select the configured ' + description + '.');
    }
  }

  private async markEvidenceMask(locator: Locator): Promise<void> {
    await locator.evaluate((element) => {
      element.setAttribute('data-evidence-mask', 'true');
      element.setAttribute('autocomplete', 'off');
    });
  }

  private async fillSensitiveValue(
    locator: Locator,
    value: string,
    description: string,
  ): Promise<void> {
    try {
      await locator.fill(value);
    } catch {
      throw new Error('Unable to fill the configured ' + description + '.');
    }
  }

  private async maskVisibleOptionSurface(): Promise<void> {
    const surface = await this.firstVisible([
      this.page.getByRole('listbox'),
      this.page.getByRole('menu'),
      this.page.locator('[data-radix-popper-content-wrapper]'),
    ]);
    if (surface) await this.markEvidenceMask(surface);
  }

  private async uniqueVisibleLocators(
    candidates: Locator[],
  ): Promise<Locator[]> {
    const visible: Locator[] = [];
    const handles = new Set<unknown>();
    for (const candidate of candidates) {
      const locator = candidate.first();
      if (!await locator.isVisible().catch(() => false)) continue;
      const handle = await locator.elementHandle().catch(() => null);
      if (!handle || handles.has(handle)) continue;
      handles.add(handle);
      visible.push(locator);
    }
    return visible;
  }

  private labeledEditableControl(
    surface: Locator,
    name: RegExp,
  ): Locator {
    const editable = surface.locator([
      'input',
      'textarea',
      'select',
      '[contenteditable="true"]',
      '[role="textbox"]',
      '[role="combobox"]',
    ].join(', '));
    return editable.and(surface.getByLabel(name));
  }

  private async requireVisible(
    candidates: Locator[],
    description: string,
    timeout = 10_000,
  ): Promise<Locator> {
    const deadline = Date.now() + timeout;
    do {
      const visible = await this.firstVisible(candidates);
      if (visible) return visible;
      await this.page.waitForTimeout(100);
    } while (Date.now() < deadline);
    throw new Error('Unable to locate visible ' + description + '.');
  }

  private async firstVisible(
    candidates: Locator[],
  ): Promise<Locator | null> {
    for (const candidate of candidates) {
      const count = await candidate.count().catch(() => 0);
      for (let index = 0; index < count; index += 1) {
        const locator = candidate.nth(index);
        if (await locator.isVisible().catch(() => false)) return locator;
      }
    }
    return null;
  }

  private async waitForAnyVisible(
    candidates: Locator[],
    timeout: number,
  ): Promise<Locator | null> {
    const deadline = Date.now() + timeout;
    do {
      const visible = await this.firstVisible(candidates);
      if (visible) return visible;
      await this.page.waitForTimeout(100);
    } while (Date.now() < deadline);
    return null;
  }
}
