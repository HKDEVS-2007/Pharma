const Database = require('better-sqlite3');
const db = new Database('C:\\Users\\hamda\\AppData\\Roaming\\pharma\\pharmco.db');
db.prepare('UPDATE medicines SET lowstockthreshold = 4').run();
console.log('Updated all lowstockthreshold to 4');
