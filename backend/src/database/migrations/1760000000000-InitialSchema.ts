import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Esquema inicial de StockGuard.
 * Restricciones de integridad reforzadas en la BD:
 *  - categorias: nombre unico sin distinguir mayusculas (indice sobre lower(name)).
 *  - productos: SKU unico, precio >= 0, stock >= 0, stock minimo >= 0, FK a categoria (RESTRICT).
 *  - movimientos: cantidad > 0, stocks >= 0, coherencia previous/resulting, clave de idempotencia unica,
 *    una sola reversion por movimiento (indice unico parcial), FK a producto y a movimiento original.
 *  - idempotency_records: clave primaria = clave de idempotencia.
 */
export class InitialSchema1760000000000 implements MigrationInterface {
  name = 'InitialSchema1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      CREATE TABLE "categories" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" varchar(80) NOT NULL,
        "description" varchar(500),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_categories" PRIMARY KEY ("id"),
        CONSTRAINT "chk_categories_name_not_blank" CHECK (length(btrim("name")) > 0)
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_categories_name_lower" ON "categories" (lower("name"))`);

    await queryRunner.query(`
      CREATE TABLE "products" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "sku" varchar(40) NOT NULL,
        "name" varchar(120) NOT NULL,
        "description" varchar(1000),
        "reference_price" numeric(12,2) NOT NULL,
        "stock" integer NOT NULL DEFAULT 0,
        "minimum_stock" integer NOT NULL DEFAULT 0,
        "category_id" uuid NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_products" PRIMARY KEY ("id"),
        CONSTRAINT "fk_products_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT,
        CONSTRAINT "chk_products_price_non_negative" CHECK ("reference_price" >= 0),
        CONSTRAINT "chk_products_stock_non_negative" CHECK ("stock" >= 0),
        CONSTRAINT "chk_products_minimum_stock_non_negative" CHECK ("minimum_stock" >= 0),
        CONSTRAINT "chk_products_sku_not_blank" CHECK (length(btrim("sku")) > 0)
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_products_sku" ON "products" ("sku")`);
    await queryRunner.query(`CREATE INDEX "idx_products_category" ON "products" ("category_id")`);
    await queryRunner.query(`CREATE INDEX "idx_products_active_name" ON "products" ("is_active", "name")`);

    await queryRunner.query(`CREATE TYPE "movement_type" AS ENUM ('IN', 'OUT')`);
    await queryRunner.query(`
      CREATE TABLE "inventory_movements" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "product_id" uuid NOT NULL,
        "type" "movement_type" NOT NULL,
        "quantity" integer NOT NULL,
        "reason" varchar(255) NOT NULL,
        "previous_stock" integer NOT NULL,
        "resulting_stock" integer NOT NULL,
        "idempotency_key" varchar(128) NOT NULL,
        "reverses_movement_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_inventory_movements" PRIMARY KEY ("id"),
        CONSTRAINT "fk_movements_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_movements_reverses" FOREIGN KEY ("reverses_movement_id") REFERENCES "inventory_movements"("id") ON DELETE RESTRICT,
        CONSTRAINT "chk_movements_quantity_positive" CHECK ("quantity" > 0),
        CONSTRAINT "chk_movements_stocks_non_negative" CHECK ("previous_stock" >= 0 AND "resulting_stock" >= 0),
        CONSTRAINT "chk_movements_stock_consistency" CHECK (
          ("type" = 'IN' AND "resulting_stock" = "previous_stock" + "quantity") OR
          ("type" = 'OUT' AND "resulting_stock" = "previous_stock" - "quantity")
        ),
        CONSTRAINT "chk_movements_reason_not_blank" CHECK (length(btrim("reason")) > 0)
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_movements_idempotency_key" ON "inventory_movements" ("idempotency_key")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_movements_single_reversal" ON "inventory_movements" ("reverses_movement_id") WHERE "reverses_movement_id" IS NOT NULL`,
    );
    await queryRunner.query(`CREATE INDEX "idx_movements_product_created" ON "inventory_movements" ("product_id", "created_at")`);
    await queryRunner.query(`CREATE INDEX "idx_movements_created" ON "inventory_movements" ("created_at")`);

    await queryRunner.query(`
      CREATE TABLE "idempotency_records" (
        "key" varchar(128) NOT NULL,
        "operation" varchar(40) NOT NULL,
        "request_hash" char(64) NOT NULL,
        "response_status" smallint NOT NULL,
        "response_body" json NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_idempotency_records" PRIMARY KEY ("key")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "idempotency_records"`);
    await queryRunner.query(`DROP TABLE "inventory_movements"`);
    await queryRunner.query(`DROP TYPE "movement_type"`);
    await queryRunner.query(`DROP TABLE "products"`);
    await queryRunner.query(`DROP TABLE "categories"`);
  }
}
