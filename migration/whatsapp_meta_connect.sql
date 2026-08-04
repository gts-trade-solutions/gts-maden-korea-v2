-- WhatsApp "direct connect with Meta" infrastructure
-- Additive only (new nullable columns + new table). Safe to run on prod.
-- Applied via scripts that guard on information_schema so re-runs are no-ops.

-- 1) Meta template-sync fields on whatsapp_templates
ALTER TABLE whatsapp_templates
  ADD COLUMN provider_template_id VARCHAR(255) NULL,
  ADD COLUMN status               VARCHAR(64)  NULL,
  ADD COLUMN components           JSON         NULL,
  ADD COLUMN synced_at            DATETIME(6)  NULL;

-- 2) Inbound WhatsApp messages (customer replies) captured by the Meta webhook
CREATE TABLE whatsapp_inbound_messages (
  id            CHAR(36)     NOT NULL,
  wa_message_id VARCHAR(255) NOT NULL,
  from_phone    VARCHAR(255) NOT NULL,
  contact_id    CHAR(36)     NULL,
  type          VARCHAR(64)  NOT NULL DEFAULT 'text',
  text_body     MEDIUMTEXT   NULL,
  raw           JSON         NULL,
  received_at   DATETIME(6)  NULL,
  created_at    DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY whatsapp_inbound_messages_wa_message_id_unique (wa_message_id),
  KEY whatsapp_inbound_messages_from_phone_idx (from_phone),
  KEY whatsapp_inbound_messages_contact_id_idx (contact_id),
  CONSTRAINT whatsapp_inbound_messages_contact_fk
    FOREIGN KEY (contact_id) REFERENCES whatsapp_contacts (id)
    ON DELETE SET NULL ON UPDATE NO ACTION
) ENGINE=InnoDB;  -- inherits DB default charset/collation (utf8mb4_0900_ai_ci) so the FK matches whatsapp_contacts.id
