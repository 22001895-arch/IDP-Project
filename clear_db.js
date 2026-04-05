const sqlite3 = require('sqlite3').verbose();

// Connect to your existing database file
const db = new sqlite3.Database('./patient_data.sqlite', (err) => {
    if (err) {
        console.error("❌ Error connecting to database:", err.message);
        return;
    }
    console.log("🗄️ Connected to database.");
});

// Run the SQL command to delete all rows
db.run(`DELETE FROM patients`, function(err) {
    if (err) {
        console.error("❌ Failed to clear database:", err.message);
    } else {
        // 'this.changes' tells you how many rows were deleted
        console.log(`✅ Success! Database is now empty. Deleted ${this.changes} rows.`);
    }
    
    // Close the connection
    db.close();
});