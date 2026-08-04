// Idempotent apply of migration/whatsapp_meta_connect.sql. Reads DATABASE_URL
// from the env file passed as argv[2]. Safe to re-run.
const fs = require("fs");
const { PrismaClient } = require("@prisma/client");
const envFile = process.argv[2] || ".env";
const url = fs.readFileSync(envFile, "utf8").match(/^DATABASE_URL\s*=\s*["']?([^"'\r\n]+)/m)[1];
const prisma = new PrismaClient({ datasources: { db: { url } } });
const db = new URL(url).pathname.slice(1);
const num = (r) => Number(r[0].c);
(async () => {
  const col = await prisma.$queryRawUnsafe(
    "SELECT COUNT(*) c FROM information_schema.columns WHERE table_schema=? AND table_name='whatsapp_templates' AND column_name='provider_template_id'", db);
  if (num(col) === 0) {
    await prisma.$executeRawUnsafe(
      "ALTER TABLE whatsapp_templates ADD COLUMN provider_template_id VARCHAR(255) NULL, ADD COLUMN status VARCHAR(64) NULL, ADD COLUMN components JSON NULL, ADD COLUMN synced_at DATETIME(6) NULL");
    console.log("  + whatsapp_templates: added provider_template_id/status/components/synced_at");
  } else console.log("  = whatsapp_templates columns already present");
  const tbl = await prisma.$queryRawUnsafe(
    "SELECT COUNT(*) c FROM information_schema.tables WHERE table_schema=? AND table_name='whatsapp_inbound_messages'", db);
  if (num(tbl) === 0) {
    // contact_id must share the referenced column's collation or the FK is
    // rejected (err 3780). It differs by environment (prod whatsapp_contacts.id
    // is utf8mb4_unicode_ci, local is utf8mb4_0900_ai_ci), so read it at runtime.
    const cr = await prisma.$queryRawUnsafe(
      "SELECT character_set_name cs, collation_name cl FROM information_schema.columns WHERE table_schema=? AND table_name='whatsapp_contacts' AND column_name='id'", db);
    const cs = cr[0].cs || cr[0].CS, cl = cr[0].cl || cr[0].CL;
    await prisma.$executeRawUnsafe(
      `CREATE TABLE whatsapp_inbound_messages (id CHAR(36) CHARACTER SET ${cs} COLLATE ${cl} NOT NULL, wa_message_id VARCHAR(255) NOT NULL, from_phone VARCHAR(255) NOT NULL, contact_id CHAR(36) CHARACTER SET ${cs} COLLATE ${cl} NULL, type VARCHAR(64) NOT NULL DEFAULT 'text', text_body MEDIUMTEXT NULL, raw JSON NULL, received_at DATETIME(6) NULL, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (id), UNIQUE KEY whatsapp_inbound_messages_wa_message_id_unique (wa_message_id), KEY whatsapp_inbound_messages_from_phone_idx (from_phone), KEY whatsapp_inbound_messages_contact_id_idx (contact_id), CONSTRAINT whatsapp_inbound_messages_contact_fk FOREIGN KEY (contact_id) REFERENCES whatsapp_contacts (id) ON DELETE SET NULL ON UPDATE NO ACTION) ENGINE=InnoDB`);
    console.log(`  + created whatsapp_inbound_messages (contact_id COLLATE ${cl})`);
  } else console.log("  = whatsapp_inbound_messages already exists");
  await prisma.$disconnect();
  console.log("apply OK on db:", db);
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
