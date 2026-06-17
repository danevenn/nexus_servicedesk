-- AlterTable
ALTER TABLE "Widget" ADD COLUMN     "h" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "w" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "x" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "y" INTEGER NOT NULL DEFAULT 0;

-- Backfill: empaqueta los widgets existentes en la cuadrícula de 12 columnas
-- a partir de su orden lineal (position) y su ancho/tipo previos.
--   width 1→4 col, 2→8, 3→12   ·   alto: STAT 3, LIST 7, gráficas 6
DO $$
DECLARE
  d        RECORD;
  wgt      RECORD;
  cur_x    INT;
  cur_y    INT;
  row_h    INT;
  ww       INT;
  hh       INT;
BEGIN
  FOR d IN SELECT id FROM "Dashboard" LOOP
    cur_x := 0; cur_y := 0; row_h := 0;
    FOR wgt IN
      SELECT id, kind, width FROM "Widget"
      WHERE "dashboardId" = d.id
      ORDER BY position ASC, "createdAt" ASC
    LOOP
      ww := CASE wgt.width WHEN 2 THEN 8 WHEN 3 THEN 12 ELSE 4 END;
      hh := CASE wgt.kind::text WHEN 'STAT' THEN 3 WHEN 'LIST' THEN 7 ELSE 6 END;
      IF cur_x + ww > 12 THEN
        cur_x := 0;
        cur_y := cur_y + row_h;
        row_h := 0;
      END IF;
      UPDATE "Widget" SET x = cur_x, y = cur_y, w = ww, h = hh WHERE id = wgt.id;
      cur_x := cur_x + ww;
      IF hh > row_h THEN row_h := hh; END IF;
    END LOOP;
  END LOOP;
END $$;
