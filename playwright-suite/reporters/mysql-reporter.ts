import type { Reporter, TestCase, TestResult, FullResult } from '@playwright/test/reporter';
import mysql from 'mysql2/promise';
import { resolveEnvironmentConfig } from '../config/environment';

const ENVIRONMENT = resolveEnvironmentConfig();

/**
 * Writes every test result into the MySQL `test_cases` table.
 *
 * DB_WRITE_MODE=insert  append a new row per run (history)
 * DB_WRITE_MODE=update  keep one row per case, overwrite each run
 *
 * Silently no-ops when DB_HOST is unset, so local runs need no database.
 */
export default class MySqlReporter implements Reporter {
  private rows: any[] = [];

  onTestEnd(test: TestCase, result: TestResult) {
    const ann = (type: string) =>
      test.annotations.find((a) => a.type === type)?.description ?? '';

    this.rows.push({
      case_id: ann('caseId') || test.id,
      platform: "June",
      title: test.title.replace(/@\w+/g, '').trim(),
      module: test.parent.title,
      type: 'Automation',
      priority: ann('priority') || 'P3',
      severity: ann('severity') || 'Medium',
      expected_result: ann('expected'),
      actual_result: result.error?.message?.slice(0, 1000) ?? '',
      status: result.status === 'passed' ? 'Pass'
        : result.status === 'skipped' ? 'Skipped' : 'Fail',
      duration_ms: result.duration,
      browser: test.parent.project()?.name ?? '',
      environment: ENVIRONMENT.name,
      page_owner: Number(process.env.PAGE_OWNER_GID ?? 0),
      created_by: Number(process.env.CREATED_BY_GID ?? 0),
      executed_at: new Date(),
    });
  }

  async onEnd(_result: FullResult) {
    if (!process.env.DB_HOST) {
      console.log('[mysql-reporter] DB_HOST not set — skipping result logging.');
      return;
    }
    const mode = (process.env.DB_WRITE_MODE ?? 'insert').toLowerCase();
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    try {
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS test_cases (
          row_id BIGINT AUTO_INCREMENT PRIMARY KEY,
          case_id VARCHAR(64) NOT NULL,
          platform VARCHAR(128),
          title VARCHAR(512),
          module VARCHAR(128),
          type VARCHAR(32),
          priority VARCHAR(8),
          severity VARCHAR(16),
          expected_result TEXT,
          actual_result TEXT,
          status VARCHAR(16),
          duration_ms INT,
          browser VARCHAR(32),
          environment VARCHAR(32),
          page_owner INT,
          created_by INT,
          executed_at DATETIME,
          UNIQUE KEY uniq_case_env (case_id, environment, browser)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      const cols = Object.keys(this.rows[0] ?? {});
      if (!cols.length) return;

      const sql = mode === 'update'
        ? `INSERT INTO test_cases (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})
           ON DUPLICATE KEY UPDATE
             status=VALUES(status), actual_result=VALUES(actual_result),
             duration_ms=VALUES(duration_ms), executed_at=VALUES(executed_at)`
        : `INSERT INTO test_cases (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})
           ON DUPLICATE KEY UPDATE executed_at=VALUES(executed_at)`;

      for (const row of this.rows) {
        await conn.execute(sql, cols.map((c) => (row as any)[c]));
      }
      console.log(`[mysql-reporter] wrote ${this.rows.length} result(s) in ${mode} mode.`);
    } catch (err) {
      console.error('[mysql-reporter] failed:', (err as Error).message);
    } finally {
      await conn.end();
    }
  }
}
