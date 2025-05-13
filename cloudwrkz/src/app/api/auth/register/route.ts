import { NextRequest, NextResponse } from 'next/server';
import DB from '@/lib/db';

function validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validatePassword(password: string): boolean {
    // Example validation: at least 8 characters, 1 uppercase, 1 lowercase, 1 number
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{8,}$/;
    return passwordRegex.test(password);
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        
        if (!body.email || !body.password || !body.name) {
            const missingFields = [];
            if (!body.email) missingFields.push('email');
            if (!body.password) missingFields.push('password');
            if (!body.name) missingFields.push('name');

            return NextResponse.json(
                { error: `Missing required fields: ${missingFields.join(', ')}` },
                { status: 400 }
            );
        }

        // Example: Check if email is valid
        if (!validateEmail(body.email)) {
            return NextResponse.json(
                { error: 'Invalid email format' },
                { status: 400 }
            );
        }

        // Example: Check if password is valid
        if (!validatePassword(body.password)) {
            return NextResponse.json(
                { error: 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one number' },
                { status: 400 }
            );
        }
        
        return NextResponse.json(
            { 
                message: 'Registration successful',
                user: {
                    // Add user details here
                    email: body.email,
                    name: body.name,
                    password: body.password
                }
            },
            { status: 201 }
        );
    } catch (error) {
        return NextResponse.json(
            { error: 'Registration failed' },
            { status: 400 }
        );
    }
}

// Documentation route
export async function GET() {
    const documentation = {
        endpoint: '/api/auth/register',
        methods: {
            POST: {
                description: 'Register a new user',
                requestBody: {
                    type: 'application/json',
                    required: true,
                    // Add your expected request body fields here
                    schema: {
                        // example fields
                        email: 'string',
                        password: 'string',
                        name: 'string'
                    }
                },
                responses: {
                    '201': {
                        description: 'Registration successful',
                        content: {
                            message: 'Registration successful'
                        }
                    },
                    '400': {
                        description: 'Registration failed',
                        content: {
                            error: 'Registration failed'
                        }
                    }
                }
            }
        }
    };

    return NextResponse.json(documentation, { status: 200 });
}