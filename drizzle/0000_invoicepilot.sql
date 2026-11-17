CREATE TABLE runs (
 id TEXT PRIMARY KEY NOT NULL,
 owner_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 status TEXT NOT NULL,
 invoice_key TEXT,
 file_hash TEXT NOT NULL,
 po_id TEXT,
 total_cents INTEGER NOT NULL DEFAULT 0,
 is_demo INTEGER NOT NULL DEFAULT 0,
 payload TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX runs_owner_created ON runs(owner_id, created_at);
--> statement-breakpoint
CREATE TABLE claims (
 owner_id TEXT NOT NULL,
 invoice_key TEXT NOT NULL,
 run_id TEXT NOT NULL,
 PRIMARY KEY(owner_id, invoice_key)
);
--> statement-breakpoint
CREATE TABLE approvals (
 run_id TEXT PRIMARY KEY NOT NULL,
 owner_id TEXT NOT NULL,
 po_id TEXT NOT NULL,
 total_cents INTEGER NOT NULL DEFAULT 0
);
