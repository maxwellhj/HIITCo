CREATE TABLE IF NOT EXISTS planner_state (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL);
INSERT OR IGNORE INTO planner_state (id,version,data) VALUES (1,0,'{"events":[],"tasks":[]}');
