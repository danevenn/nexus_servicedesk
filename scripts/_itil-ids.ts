import "dotenv/config";
import { prisma } from "@/lib/prisma";
async function main() {
  const changes = await prisma.ticket.findMany({
    where: { kind: "CHANGE", approvalState: { not: "NOT_REQUESTED" } },
    select: { id: true, ref: true, approvalState: true },
    orderBy: { approvalState: "asc" },
  });
  const problem = await prisma.ticket.findFirst({
    where: { kind: "PROBLEM", linkedIncidents: { some: {} } },
    select: { id: true, ref: true, _count: { select: { linkedIncidents: true } } },
  });
  console.log(JSON.stringify({ changes, problem }));
}
main().finally(() => prisma.$disconnect());