import { PrismaClient } from '../generated/prisma';
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: {
      id: { in: ['HVHaU8u7iwnfGBEnGhUgvLuGhHf4JwWF', 'zXsj4FcGEkpEGHASls6HRY19lmjGnQ4P'] }
    }
  });
  console.log("Users found:", users.map(u => ({ id: u.id, name: u.name })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
