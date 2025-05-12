import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
    // Simulate checking session token from request headers
    const authHeader = request.headers.get('authorization');
    const sessionToken = authHeader?.split(' ')[1];

    if (!sessionToken) {
        return NextResponse.json(
            { active: false }
        );
    }

    // Dummy validation - in real world, you would verify the token
    if (sessionToken === 'dummy-valid-token') {
        return NextResponse.json({
            active: true,
            user: {
                id: 'usr_123456789',
                email: 'user@example.com',
                lastActive: new Date().toISOString(),
            },
        });
    }

    return NextResponse.json(
        { active: false }
    );
}
