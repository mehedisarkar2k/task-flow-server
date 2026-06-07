import { auth } from '../src/config/auth';
import { prisma } from '../src/config/prisma';

async function createAdmin() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error("Usage: bun run scripts/create-admin.ts <email> <password> <name>");
    process.exit(1);
  }

  const [email, password, name] = args;

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      console.error(`User with email ${email} already exists.`);
      process.exit(1);
    }

    console.log(`Creating ADMIN account for ${email}...`);

    // Use better-auth programmatic API to create the user
    // We pass 'as any' since role is a custom additional field that auth API might not strictly type
    const response = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
        role: "ADMIN",
      } as any
    });

    console.log("Successfully created admin account!");
    console.log("Response:", response);
    
    // Explicitly disconnect from the database after completion
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Failed to create admin account:");
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

createAdmin();
