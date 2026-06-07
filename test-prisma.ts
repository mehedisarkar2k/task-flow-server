import { PrismaClient } from './generated/prisma';
try {
  const prisma = new PrismaClient({ log: ['query'] });
  console.log("Success");
} catch (e) {
  console.error(e);
}
