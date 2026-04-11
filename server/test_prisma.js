import dotenv from 'dotenv';
dotenv.config();

import prisma from './configs/prisma.js';

async function main() {
    try {
        console.log("Attempting to insert a mock user...");
        const user = await prisma.user.create({
            data: {
                id: "user_test_xyz123",
                email: "testuser@example.com",
                name: "Test User",
                image: "http://example.com/image.png"
            }
        });
        console.log("Successfully inserted user:", user);
        
        // Clean up
        await prisma.user.delete({ where: { id: "user_test_xyz123" } });
        console.log("Cleanup complete!");
    } catch (e) {
        console.error("PRISMA ERROR:", e);
    }
}

main();
