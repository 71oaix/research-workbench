import { mkdirSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

export type Db = InstanceType<typeof Database>

const SCHEMA = `
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  goal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planning',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS steps (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id),
  label TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  input_artifacts TEXT NOT NULL DEFAULT '[]',
  output_artifact TEXT,
  agent_runtime_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id),
  step_id TEXT REFERENCES steps(id),
  name TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  abstract TEXT,
  authors TEXT NOT NULL DEFAULT '[]',
  year INTEGER,
  doi TEXT,
  url TEXT,
  citation_count INTEGER,
  raw TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(source, external_id)
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id),
  step_id TEXT REFERENCES steps(id),
  type TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_records (
  id TEXT PRIMARY KEY,
  workflow_id TEXT REFERENCES workflows(id),
  step_id TEXT REFERENCES steps(id),
  role TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cost_cny REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
`

export function createDb(dbPath = ':memory:'): Db {
  if (dbPath !== ':memory:') {
    mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true })
  }
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  return db
}
