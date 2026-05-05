const db = require('./database');

const sampleUsers = ['Hai', 'Minh', 'An', 'Linh'];

for (const username of sampleUsers) {
  db.prepare(`
    INSERT OR IGNORE INTO users (username, chips, wins, losses)
    VALUES (?, ?, ?, ?)
  `).run(username, 1000, 0, 0);
}

db.prepare(`
  INSERT OR IGNORE INTO rooms (id, name, status, max_players)
  VALUES (1, 'Phong Bai Tay 13 La', 'waiting', 4)
`).run();

console.log('Da tao database game.db va dien du lieu mau.');
console.log('Tai khoan mau: Hai, Minh, An, Linh');
console.log('Phong mau: Phong Bai Tay 13 La');
