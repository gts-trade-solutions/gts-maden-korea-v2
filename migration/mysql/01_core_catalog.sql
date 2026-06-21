-- ===========================================================================
-- MadeNKorea — MySQL 8 schema  ·  Slice 01: Core catalog
-- Source: Supabase PostgreSQL 17 (project bjudxntmpfpbyloibloc), schema "public"
-- Tables: brands, categories, products, product_images
-- Generated 2026-06-16 as the WORKED REFERENCE for the Postgres→MySQL translation.
-- Target: MySQL 8.0.36, InnoDB, utf8mb4.
-- ===========================================================================
--
-- TRANSLATION RULEBOOK  (applies to every slice — keep consistent)
--   uuid                      -> CHAR(36)            UUIDs generated in the app layer
--   text (unique / indexed)   -> VARCHAR(n)          MySQL cannot UNIQUE/INDEX TEXT without a prefix
--   text (long / markdown)    -> MEDIUMTEXT
--   timestamptz               -> DATETIME(6)         store UTC; app handles timezone
--   now()                     -> DEFAULT CURRENT_TIMESTAMP(6)
--   numeric(p,s)              -> DECIMAL(p,s)
--   boolean                   -> TINYINT(1)          true -> 1 / false -> 0
--   integer / bigint          -> INT / BIGINT
--   jsonb                     -> JSON                defaults via DEFAULT (CAST('...' AS JSON))
--   tsvector + GIN index      -> DROPPED; replaced by a MySQL FULLTEXT index
--   GIN pg_trgm indexes       -> DROPPED; FULLTEXT / LIKE cover fuzzy search (quality differs)
--   partial index (WHERE ...) -> plain composite index (MySQL has no partial indexes)
--   updated_at trigger        -> ON UPDATE CURRENT_TIMESTAMP(6)
--   FK ON DELETE rule         -> preserved 1:1 (CASCADE / SET NULL / RESTRICT; NO ACTION == RESTRICT)
--
-- NOTE: products.vendor_id FK is deferred until the `vendors` table exists
--       (created in a later slice). It is included but commented out below.
-- ===========================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------------------------
-- brands
-- ----------------------------------------------------------------------------
CREATE TABLE brands (
  id             CHAR(36)      NOT NULL,
  slug           VARCHAR(255)  NOT NULL,
  name           VARCHAR(255)  NOT NULL,
  description    MEDIUMTEXT    NULL,
  created_at     DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  thumbnail_path VARCHAR(1024) NULL,
  thumbnail_url  VARCHAR(1024) NULL,
  active         TINYINT(1)    NOT NULL DEFAULT 1,
  `position`     INT           NOT NULL DEFAULT 10,
  updated_at     DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  brand_code     VARCHAR(64)   NULL,
  PRIMARY KEY (id),
  UNIQUE KEY brands_slug_key (slug),
  UNIQUE KEY brands_brand_code_key (brand_code),   -- nullable: MySQL allows multiple NULLs (matches PG)
  KEY brands_position_idx (`position`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------------------------------------------------------
-- categories  (self-referential parent_id)
-- ----------------------------------------------------------------------------
CREATE TABLE categories (
  id          CHAR(36)     NOT NULL,
  slug        VARCHAR(255) NOT NULL,
  name        VARCHAR(255) NOT NULL,
  description MEDIUMTEXT   NULL,
  parent_id   CHAR(36)     NULL,
  created_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY categories_slug_key (slug),
  KEY categories_parent_idx (parent_id),
  CONSTRAINT categories_parent_fk FOREIGN KEY (parent_id)
    REFERENCES categories (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------------------------------------------------------
-- products  (61 columns; search_tsv dropped in favour of FULLTEXT)
-- ----------------------------------------------------------------------------
CREATE TABLE products (
  id                   CHAR(36)      NOT NULL,
  sku                  VARCHAR(100)  NULL,
  slug                 VARCHAR(255)  NOT NULL,
  name                 VARCHAR(512)  NOT NULL,
  short_description    TEXT          NULL,
  description          MEDIUMTEXT    NULL,
  brand                VARCHAR(255)  NULL,                     -- legacy denormalized brand name
  price                DECIMAL(12,2) NULL,
  currency             VARCHAR(3)    NULL DEFAULT 'INR',
  country_of_origin    VARCHAR(100)  NULL,
  volume_ml            DECIMAL(10,2) NULL,
  net_weight_g         DECIMAL(10,2) NULL,
  attributes           JSON          NOT NULL DEFAULT (CAST('{}' AS JSON)),
  category_id          CHAR(36)      NOT NULL,
  hero_image_path      VARCHAR(1024) NULL,
  is_published         TINYINT(1)    NOT NULL DEFAULT 1,
  created_at           DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at           DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  brand_id             CHAR(36)      NULL,
  compare_at_price     DECIMAL(12,2) NULL,
  sale_price           DECIMAL(12,2) NULL,
  sale_starts_at       DATETIME(6)   NULL,
  sale_ends_at         DATETIME(6)   NULL,
  is_featured          TINYINT(1)    NOT NULL DEFAULT 0,
  is_trending          TINYINT(1)    NOT NULL DEFAULT 0,
  featured_rank        INT           NULL,
  new_until            DATETIME(6)   NULL,
  meta_title           VARCHAR(255)  NULL,
  meta_description     VARCHAR(512)  NULL,
  og_image_path        VARCHAR(1024) NULL,
  views_count          BIGINT        NOT NULL DEFAULT 0,
  purchases_count      BIGINT        NOT NULL DEFAULT 0,
  last_viewed_at       DATETIME(6)   NULL,
  last_purchased_at    DATETIME(6)   NULL,
  deleted_at           DATETIME(6)   NULL,
  -- search_tsv tsvector  -> intentionally DROPPED; see FULLTEXT index below
  vendor_id            CHAR(36)      NULL,
  track_inventory      TINYINT(1)    NOT NULL DEFAULT 1,
  stock_qty            INT           NOT NULL DEFAULT 0,
  ingredients_md       MEDIUMTEXT    NULL,
  additional_details_md MEDIUMTEXT   NULL,
  key_features_md      MEDIUMTEXT    NULL,
  faq                  JSON          NOT NULL DEFAULT (CAST('[]' AS JSON)),
  key_benefits         JSON          NOT NULL DEFAULT (CAST('[]' AS JSON)),
  additional_details   JSON          NOT NULL DEFAULT (CAST('{}' AS JSON)),
  made_in_korea        TINYINT(1)    NOT NULL DEFAULT 0,
  is_vegetarian        TINYINT(1)    NOT NULL DEFAULT 0,
  cruelty_free         TINYINT(1)    NOT NULL DEFAULT 0,
  toxin_free           TINYINT(1)    NOT NULL DEFAULT 0,
  paraben_free         TINYINT(1)    NOT NULL DEFAULT 0,
  video_path           VARCHAR(1024) NULL,
  promo_exempt         TINYINT(1)    NOT NULL DEFAULT 0,
  expiry_date          DATE          NULL,
  product_code         VARCHAR(64)   NULL,
  brand_code           VARCHAR(64)   NULL,
  hsn                  VARCHAR(20)   NULL,
  box_contents_md      MEDIUMTEXT    NULL,
  is_bundle            TINYINT(1)    NOT NULL DEFAULT 0,
  gross_weight_g       DECIMAL(8,2)  NULL,
  inventory_product_id CHAR(36)      NULL,
  purchase_price       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (id),
  UNIQUE KEY products_sku_key (sku),
  UNIQUE KEY products_slug_key (slug),
  UNIQUE KEY products_product_code_key (product_code),
  KEY products_brand_id_idx (brand_id),
  KEY products_category_idx (category_id),
  KEY products_vendor_idx (vendor_id),
  KEY idx_products_inventory_product (inventory_product_id),
  KEY products_pub_created_idx (is_published, created_at),       -- was partial+DESC in PG
  KEY products_featured_idx (is_published, is_featured, featured_rank),  -- was partial in PG
  KEY products_trending_idx (is_published, is_trending),         -- was partial in PG
  KEY products_new_until_idx (new_until),                        -- was partial in PG
  KEY products_is_bundle_idx (is_bundle),                        -- was partial in PG
  KEY idx_products_vendor_expiry_date (vendor_id, expiry_date),  -- was partial in PG
  FULLTEXT KEY products_ft (name, short_description),            -- replaces tsvector + trgm
  CONSTRAINT products_category_fk FOREIGN KEY (category_id)
    REFERENCES categories (id) ON DELETE RESTRICT,
  CONSTRAINT products_brand_fk FOREIGN KEY (brand_id)
    REFERENCES brands (id) ON DELETE SET NULL,
  CONSTRAINT products_inventory_self_fk FOREIGN KEY (inventory_product_id)
    REFERENCES products (id) ON DELETE RESTRICT
  -- , CONSTRAINT products_vendor_fk FOREIGN KEY (vendor_id)
  --     REFERENCES vendors (id) ON DELETE SET NULL   -- ENABLE after `vendors` slice
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------------------------------------------------------
-- product_images
-- ----------------------------------------------------------------------------
CREATE TABLE product_images (
  id           CHAR(36)      NOT NULL,
  product_id   CHAR(36)      NOT NULL,
  storage_path VARCHAR(512)  NOT NULL,    -- capped at 512 so (product_id, storage_path) fits a unique key
  alt          VARCHAR(512)  NULL,
  sort_order   INT           NOT NULL DEFAULT 0,
  created_at   DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY product_images_unique_per_path (product_id, storage_path),
  KEY product_images_product_idx (product_id),
  KEY product_images_product_sort (product_id, sort_order),
  KEY product_images_sort_idx (sort_order),
  CONSTRAINT product_images_product_fk FOREIGN KEY (product_id)
    REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET FOREIGN_KEY_CHECKS = 1;
