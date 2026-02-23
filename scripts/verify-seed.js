const Database = require('better-sqlite3');
const { join } = require('path');
const { homedir } = require('os');
const db = new Database(join(homedir(), '.codesession/sessions.db'));
const sessions = db.prepare('SELECT id, name, status, ai_cost, ai_tokens, files_changed, commits FROM sessions ORDER BY id DESC LIMIT 10').all();
sessions.forEach(s => {
  console.log('[' + s.id + '] ' + s.name + ' | ' + s.status + ' | $' + s.ai_cost.toFixed(2) + ' | ' + s.ai_tokens + ' tokens | ' + s.files_changed + ' files | ' + s.commits + ' commits');
});
console.log('---');
console.log('Total file changes:', db.prepare('SELECT COUNT(*) as c FROM file_changes').get().c);
console.log('Total AI calls:', db.prepare('SELECT COUNT(*) as c FROM ai_usage').get().c);
console.log('Total commits:', db.prepare('SELECT COUNT(*) as c FROM commits').get().c);
