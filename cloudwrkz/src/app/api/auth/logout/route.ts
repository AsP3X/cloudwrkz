import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        // Create a response
        const response = NextResponse.json(
            { message: 'Logged out successfully' },
            { status: 200 }
        );

        // Clear any auth cookies if they exist
        response.cookies.delete('session');
        // Add any other cookies that need to be cleared here

        return response;
    } catch (error) {
        return NextResponse.json(
            { error: 'Logout failed' },
            { status: 500 }
        );
    }
}

export async function GET() {
    return NextResponse.json({
        endpoint: '/api/auth/logout',
        methods: {
            POST: {
                description: 'Logs out the user by clearing session cookies',
                response: {
                    success: { status: 200, body: { message: 'Logged out successfully' } },
                    error: { status: 500, body: { error: 'Logout failed' } }
                }
            }
        }
    }, { status: 200 });
}