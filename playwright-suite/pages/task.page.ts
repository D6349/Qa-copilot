import { type Locator, type Page, expect } from '@playwright/test';

export interface PdfAttachmentInput {
  fileName: string;
  mimeType: string;
  documentText: string;
}

/** Task chat, connected-connector and attachment behavior. */
export class TaskPage {
  readonly page: Page;
  readonly taskPath = '/task';
  readonly prompt: Locator;
  readonly composer: Locator;
  readonly addConnectorButton: Locator;
  readonly fileInput: Locator;
  readonly sendButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.prompt = page.locator('textarea[placeholder="Ask anything"]');
    this.composer = this.prompt.locator('xpath=..');
    this.addConnectorButton = this.composer.getByTitle('Add connector');
    this.fileInput = this.composer.locator('input[type="file"]');
    this.sendButton = this.composer.locator('button:has(svg.lucide-send)');
  }

  async startNewChat(): Promise<void> {
    await this.page.goto(this.taskPath, { waitUntil: 'domcontentloaded' });
    await expect(this.prompt).toBeVisible({ timeout: 30_000 });
    await expect(this.prompt).toBeEnabled({ timeout: 30_000 });
    await expect.poll(
      () => new URL(this.page.url()).searchParams.has('room'),
      { message: 'A new chat must start without an existing room.' },
    ).toBe(false);
  }

  async enterMessage(message: string): Promise<void> {
    requireText(message, 'Chat message');
    await expect(this.prompt).toBeVisible({ timeout: 30_000 });
    await expect(this.prompt).toBeEnabled({ timeout: 30_000 });
    await this.prompt.fill(message);
    await expect(this.prompt).toHaveValue(message);
    await expect(this.sendButton).toBeEnabled();
  }

  async sendMessageAndWaitForCompletion(
    message: string,
    completionTimeoutMs: number,
  ): Promise<void> {
    await this.enterMessage(message);
    await this.prompt.press('Enter');
    await this.page.waitForURL(
      (url) => url.pathname === this.taskPath
        && url.searchParams.has('room'),
      { timeout: 90_000 },
    );
    await expect(this.page.getByText(message, { exact: true }))
      .toBeVisible({ timeout: 90_000 });
    await expect(this.prompt).toHaveValue('');
    await this.waitForCompletion(completionTimeoutMs);
  }

  async selectConnectedConnector(connectorName: string): Promise<void> {
    requireText(connectorName, 'Connector name');
    await expect(this.addConnectorButton).toBeVisible({ timeout: 30_000 });
    await this.addConnectorButton.click();

    const connectorSubmenu = this.page
      .locator('[data-slot="dropdown-menu-sub-trigger"]')
      .filter({ hasText: /^Connectors$/ });
    await expect(connectorSubmenu).toBeVisible();
    await connectorSubmenu.hover();

    const connector = this.page
      .locator('[role="menuitem"][data-connector-id]')
      .filter({ hasText: exactText(connectorName) });
    await expect(connector).toBeVisible({ timeout: 30_000 });
    await connector.click();

    // The multi-select connector menu intentionally remains open after a pick.
    await this.page.keyboard.press('Escape');
    if (await this.addConnectorButton.getAttribute('aria-expanded') === 'true') {
      await this.page.keyboard.press('Escape');
    }
    await expect(this.selectedConnectorRemoveButton(connectorName))
      .toBeVisible();
  }

  async expectConnectedConnectorSelected(
    connectorName: string,
  ): Promise<void> {
    await expect(this.selectedConnectorRemoveButton(connectorName))
      .toBeVisible();
  }

  async removeConnectedConnector(connectorName: string): Promise<void> {
    const remove = this.selectedConnectorRemoveButton(connectorName);
    if (await remove.isVisible().catch(() => false)) {
      await remove.click();
      await expect(remove).toBeHidden();
    }
  }

  async uploadPdf(input: PdfAttachmentInput): Promise<void> {
    validatePdfInput(input);
    await this.expectActiveRoom();
    await expect(this.fileInput).toBeAttached({ timeout: 30_000 });
    await this.fileInput.setInputFiles({
      name: input.fileName,
      mimeType: input.mimeType,
      buffer: buildPdf(input.documentText),
    });
    await expect(this.page.getByText(input.fileName, { exact: true }))
      .toBeVisible();
    await expect(this.pendingAttachmentRemoveButton(input.fileName))
      .toBeVisible();
  }

  async submitAttachedDocumentAndWaitForCompletion(
    message: string,
    fileName: string,
    completionTimeoutMs: number,
  ): Promise<void> {
    await expect(this.pendingAttachmentRemoveButton(fileName)).toBeVisible();
    await this.enterMessage(message);
    await this.prompt.press('Enter');
    await expect(this.page.getByText(message, { exact: true }))
      .toBeVisible({ timeout: 90_000 });
    await expect(this.prompt).toHaveValue('');
    await expect(this.pendingAttachmentRemoveButton(fileName)).toBeHidden({
      timeout: 30_000,
    });
    await this.waitForCompletion(completionTimeoutMs);
  }

  async removePendingAttachment(fileName: string): Promise<void> {
    const remove = this.pendingAttachmentRemoveButton(fileName);
    if (await remove.isVisible().catch(() => false)) {
      await remove.click();
      await expect(remove).toBeHidden();
    }
  }

  async clearComposer(): Promise<void> {
    if (
      await this.prompt.isVisible().catch(() => false)
      && await this.prompt.isEnabled().catch(() => false)
    ) {
      await this.prompt.fill('');
      await expect(this.prompt).toHaveValue('');
    }
  }

  async expectActiveRoom(): Promise<void> {
    await expect.poll(
      () => {
        const url = new URL(this.page.url());
        return url.pathname === this.taskPath
          && url.searchParams.has('room');
      },
      {
        message: 'Expected an active task room before uploading a file.',
        timeout: 30_000,
      },
    ).toBe(true);
  }

  private selectedConnectorRemoveButton(connectorName: string): Locator {
    return this.composer.getByRole('button', {
      name: `Remove ${connectorName}`,
      exact: true,
    });
  }

  private pendingAttachmentRemoveButton(fileName: string): Locator {
    return this.composer.getByRole('button', {
      name: `Remove ${fileName}`,
      exact: true,
    });
  }

  private async waitForCompletion(timeoutMs: number): Promise<void> {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 30_000) {
      throw new Error(
        'Chat completion timeout must be an integer of at least 30000 ms.',
      );
    }

    // Very fast responses can complete before the disabled state is observed.
    await expect(this.prompt).toBeDisabled({ timeout: 5_000 })
      .catch(() => undefined);
    await expect(this.prompt).toBeEnabled({ timeout: timeoutMs });
  }
}

function validatePdfInput(input: PdfAttachmentInput): void {
  requireText(input.fileName, 'PDF file name');
  requireText(input.documentText, 'PDF document text');
  if (input.mimeType !== 'application/pdf') {
    throw new Error('PDF MIME type must be application/pdf.');
  }
  if (!/\.pdf$/i.test(input.fileName) || /[\\/]/.test(input.fileName)) {
    throw new Error(
      'PDF file name must end in .pdf and must not contain a path.',
    );
  }
}

function buildPdf(documentText: string): Buffer {
  const printable = documentText
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/[\\()]/g, '\\$&');
  const stream = `BT /F1 14 Tf 72 720 Td (${printable}) Tj ET\n`;
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}endstream\nendobj\n`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += object;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += String(offsets[index]).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
}

function exactText(value: string): RegExp {
  return new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

function requireText(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required.`);
  }
}
