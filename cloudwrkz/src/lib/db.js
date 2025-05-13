import mysql from 'mysql2/promise'

const pool = mysql.createPool({
    host: 'localhost',
    user: 'user',
    password: 'password',
    database: 'database'
});

export default pool;