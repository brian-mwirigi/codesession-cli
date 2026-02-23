const Database = require('better-sqlite3');
const { join } = require('path');
const { homedir } = require('os');
const db = new Database(join(homedir(), '.codesession/sessions.db'));
const changes = db.prepare('SELECT session_id, file_path, change_type FROM file_changes ORDER BY session_id, id').all();
changes.forEach(c => console.log('[session ' + c.session_id + '] ' + c.change_type.padEnd(10) + ' ' + c.file_path));
