import mysql from 'mysql2/promise';

// Create a connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

// Function to execute queries
export async function query(sql: string, values?: any) {
    const [results] = await pool.execute(sql, values);
    return results;
}

// Initialize the database: create users table and default admin user
async function initializeDatabase() {
    try {
        // Create users table if it doesn't exist
        await query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                role ENUM('admin', 'user') DEFAULT 'user',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Users table created or already exists.');

        // Check if admin user exists
        const [existingAdmin] = await pool.execute(
            'SELECT 1 FROM users WHERE username = ? AND role = ?',
            ['admin', 'admin']
        );

        if (Array.isArray(existingAdmin) && existingAdmin.length === 0) {
            // Insert default admin user (password: 'admin123' - in production, hash this!)
            await query(
                'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
                ['testuser', 'admin123', 'admin']
            );
            console.log('Default admin user created.');
        } else {
            console.log('Admin user already exists.');
        }
    } catch (error) {
        console.error('Error initializing database:', error);
        throw error;
    }
}

// Run initialization when the module is loaded
initializeDatabase().catch((err) => {
    console.error('Failed to initialize database:', err);
});

export default pool;