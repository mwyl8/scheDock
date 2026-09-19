import { PrismaClient } from "@prisma/client";

const BERTHS = [
  { name: "North Pier West", lengthFt: 410 },
  { name: "North Pier Face", lengthFt: 75 },
  { name: "North Pier East", lengthFt: 240 },
  { name: "Inner Channel", lengthFt: 55 },
  { name: "South Float West", lengthFt: 90 },
  { name: "South Float East", lengthFt: 90 },
] as const;

async function main() {
  const prisma = new PrismaClient();
  for (const berth of BERTHS) {
    await prisma.berth.upsert({
      where: { name: berth.name },
      create: berth,
      update: { lengthFt: berth.lengthFt },
    });
  }
  console.log(`Seeded ${BERTHS.length} berths`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
