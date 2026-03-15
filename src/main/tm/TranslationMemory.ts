import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'
import { levenshteinDistance, distanceToScore, MIN_FUZZY_SCORE, sortSuggestions } from '@shared/utils/scoring'
import type { Suggestion } from '@shared/types/plugins'

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA cache_size = -2000;
PRAGMA temp_store = MEMORY;

CREATE TABLE IF NOT EXISTS translations (
  id          TEXT PRIMARY KEY,
  srclang     TEXT NOT NULL,
  lang        TEXT NOT NULL,
  source      TEXT NOT NULL,
  translation TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS translations_fts USING fts5(
  source,
  content = 'translations',
  content_rowid = 'rowid',
  tokenize = 'unicode61'
);

CREATE TRIGGER IF NOT EXISTS tl_ai AFTER INSERT ON translations BEGIN
  INSERT INTO translations_fts(rowid, source) VALUES (new.rowid, new.source);
END;

CREATE TRIGGER IF NOT EXISTS tl_ad AFTER DELETE ON translations BEGIN
  INSERT INTO translations_fts(translations_fts, rowid, source) VALUES ('delete', old.rowid, old.source);
END;

CREATE TRIGGER IF NOT EXISTS tl_au AFTER UPDATE OF source ON translations BEGIN
  INSERT INTO translations_fts(translations_fts, rowid, source) VALUES ('delete', old.rowid, old.source);
  INSERT INTO translations_fts(rowid, source) VALUES (new.rowid, new.source);
END;

CREATE INDEX IF NOT EXISTS idx_exact ON translations (srclang, lang, source);
CREATE INDEX IF NOT EXISTS idx_updated ON translations (srclang, lang, updated_at DESC);

CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (1, unixepoch());
`

let instance: TranslationMemory | null = null

export class TranslationMemory {
  private db: Database.Database

  private constructor() {
    const dbPath = join(app.getPath('userData'), 'tm.sqlite')
    this.db = new Database(dbPath)
    this.db.exec(SCHEMA)
  }

  static get(): TranslationMemory {
    if (!instance) instance = new TranslationMemory()
    return instance
  }

  /** Insert or update a translation pair */
  upsert(srclang: string, lang: string, source: string, translation: string): string {
    const now = Math.floor(Date.now() / 1000)
    // Check for existing exact match
    const existing = this.db
      .prepare('SELECT id FROM translations WHERE srclang=? AND lang=? AND source=?')
      .get(srclang, lang, source) as { id: string } | undefined

    if (existing) {
      this.db
        .prepare('UPDATE translations SET translation=?, updated_at=? WHERE id=?')
        .run(translation, now, existing.id)
      return existing.id
    } else {
      const id = uuidv4()
      this.db
        .prepare(
          'INSERT INTO translations (id, srclang, lang, source, translation, created_at, updated_at) VALUES (?,?,?,?,?,?,?)'
        )
        .run(id, srclang, lang, source, translation, now, now)
      return id
    }
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM translations WHERE id=?').run(id)
  }

  clearAll(): void {
    this.db.prepare('DELETE FROM translations').run()
  }

  /** Query TM for suggestions, combining exact + fuzzy match */
  query(srclang: string, lang: string, sourceText: string, limit = 9): Suggestion[] {
    // 1. Exact match
    const exact = this.db
      .prepare(
        'SELECT id, translation, updated_at FROM translations WHERE srclang=? AND lang=? AND source=? ORDER BY updated_at DESC LIMIT 1'
      )
      .get(srclang, lang, sourceText) as { id: string; translation: string; updated_at: number } | undefined

    const results: Suggestion[] = []

    if (exact) {
      results.push({
        id: exact.id,
        text: exact.translation,
        score: 1.0,
        storedAt: exact.updated_at,
        source: 'TM'
      })
    }

    // 2. Fuzzy match via FTS5, then re-rank by Levenshtein
    if (results.length < limit) {
      // Build FTS query: each word prefixed for partial match
      const words = sourceText.trim().split(/\s+/).filter(Boolean)
      if (words.length > 0) {
        const ftsQuery = words.map((w) => `"${w.replace(/"/g, '')}"`).join(' OR ')
        try {
          const fuzzyRows = this.db
            .prepare(
              `SELECT t.id, t.source, t.translation, t.updated_at
               FROM translations_fts fts
               JOIN translations t ON t.rowid = fts.rowid
               WHERE translations_fts MATCH ? AND t.srclang=? AND t.lang=?
               LIMIT 30`
            )
            .all(ftsQuery, srclang, lang) as Array<{
              id: string
              source: string
              translation: string
              updated_at: number
            }>

          const alreadyIds = new Set(results.map((r) => r.id))

          for (const row of fuzzyRows) {
            if (alreadyIds.has(row.id)) continue
            const dist = levenshteinDistance(sourceText.toLowerCase(), row.source.toLowerCase())
            const score = distanceToScore(dist)
            if (score >= MIN_FUZZY_SCORE) {
              results.push({
                id: row.id,
                text: row.translation,
                score,
                storedAt: row.updated_at,
                source: 'TM'
              })
              alreadyIds.add(row.id)
            }
          }
        } catch {
          // FTS query can fail on unusual input; ignore and return what we have
        }
      }
    }

    return sortSuggestions(results).slice(0, limit)
  }

  /** Bulk upsert pre-filtered translation pairs (source → translation) */
  importItems(
    sourceLanguage: string,
    targetLanguage: string,
    items: Array<{ source: string; translation: string }>
  ): number {
    const insert = this.db.transaction(
      (rows: Array<{ source: string; translation: string }>) => {
        let count = 0
        for (const row of rows) {
          this.upsert(sourceLanguage, targetLanguage, row.source, row.translation)
          count++
        }
        return count
      }
    )
    return insert(items)
  }

  stats(): { entryCount: number; dbSizeBytes: number } {
    const { count } = this.db.prepare('SELECT COUNT(*) as count FROM translations').get() as {
      count: number
    }
    const { page_count, page_size } = this.db
      .prepare('PRAGMA page_count')
      .get() as { page_count: number; page_size?: number }
    const pageSizeRow = this.db.prepare('PRAGMA page_size').get() as { page_size: number }
    return {
      entryCount: count,
      dbSizeBytes: page_count * pageSizeRow.page_size
    }
  }
}
