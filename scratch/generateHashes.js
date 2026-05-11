const bcrypt = require('bcrypt');

async function main() {
  const accounts = [
    { id: 'DR001', password: 'DrRahman@123' },
    { id: 'DR002', password: 'DrLim@123' },
    { id: 'DR003', password: 'DrAisha@123' },
  ];

  console.log('-- Run this SQL in Supabase to set real password hashes:\n');

  for (const acc of accounts) {
    const hash = await bcrypt.hash(acc.password, 10);
    console.log(`UPDATE doctors SET password_hash = '${hash}' WHERE staff_id = '${acc.id}';`);
  }
}

main();
