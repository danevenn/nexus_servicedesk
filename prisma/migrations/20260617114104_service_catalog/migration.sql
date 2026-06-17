-- CreateTable
CREATE TABLE "ServiceCatalogItem" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortDescription" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "icon" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "impactDefault" INTEGER NOT NULL DEFAULT 2,
    "urgencyDefault" INTEGER NOT NULL DEFAULT 2,
    "fields" JSONB NOT NULL DEFAULT '[]',
    "assignmentGroupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCatalogItem_slug_key" ON "ServiceCatalogItem"("slug");

-- CreateIndex
CREATE INDEX "ServiceCatalogItem_category_idx" ON "ServiceCatalogItem"("category");

-- CreateIndex
CREATE INDEX "ServiceCatalogItem_active_idx" ON "ServiceCatalogItem"("active");

-- AddForeignKey
ALTER TABLE "ServiceCatalogItem" ADD CONSTRAINT "ServiceCatalogItem_assignmentGroupId_fkey" FOREIGN KEY ("assignmentGroupId") REFERENCES "AssignmentGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
