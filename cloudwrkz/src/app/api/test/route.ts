import { query } from '@/lib/db';

export async function GET() {
    try {
        const users = await query('SELECT * FROM users');
        return Response.json(users);
    } catch (error) {
        return Response.json({ error: 'Database error' }, { status: 500 });
    }
}