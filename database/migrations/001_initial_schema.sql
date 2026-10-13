CREATE SCHEMA IF NOT EXISTS relic;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'relic_runtime') THEN
    CREATE ROLE relic_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;

CREATE TABLE relic.users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK(length(name) BETWEEN 2 AND 120),
 email text NOT NULL UNIQUE CHECK(email = lower(email)), password_hash text NOT NULL,
 role text NOT NULL CHECK(role IN ('ADMIN','TEAM','COMMERCIAL')), active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE relic.sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES relic.users(id),
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expiry_idx ON relic.sessions(expires_at);
CREATE TABLE relic.clients (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK(length(name) BETWEEN 2 AND 160),
 email text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', document text NOT NULL DEFAULT '',
 address text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '', archived_at timestamptz,
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clients_name_idx ON relic.clients(lower(name));
CREATE TABLE relic.pricing_settings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), version integer NOT NULL UNIQUE CHECK(version > 0),
 name text NOT NULL, settings jsonb NOT NULL, active boolean NOT NULL DEFAULT false,
 created_by uuid REFERENCES relic.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX pricing_one_active ON relic.pricing_settings(active) WHERE active;
INSERT INTO relic.pricing_settings(version,name,settings,active) VALUES(1,'Política Relic v1.0',
 '{"finishingHourly":30,"paintingHourly":40,"modelingHourly":50,"reservePercent":12,"overheadPercent":10,"minimumMarginPercent":15,"defaultMarginPercent":20,"premiumMinPercent":25,"premiumMaxPercent":30,"maximumPixPercent":5,"validityDays":7,"depositPercent":50}',true);
CREATE TABLE relic.document_counters (
 kind text NOT NULL CHECK(kind IN ('ORC','PED')), year integer NOT NULL, value integer NOT NULL DEFAULT 1,
 PRIMARY KEY(kind,year)
);
CREATE TABLE relic.quotes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, client_id uuid NOT NULL REFERENCES relic.clients(id),
 client_snapshot jsonb NOT NULL, status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','SENT','APPROVED','REJECTED','EXPIRED','CANCELLED')),
 policy_id uuid NOT NULL REFERENCES relic.pricing_settings(id), policy_snapshot jsonb NOT NULL,
 subtotal_cents integer NOT NULL CHECK(subtotal_cents >= 0), shipping_cents integer NOT NULL DEFAULT 0 CHECK(shipping_cents >= 0),
 total_cents integer NOT NULL CHECK(total_cents = subtotal_cents + shipping_cents), cost_cents integer NOT NULL CHECK(cost_cents >= 0),
 profit_cents integer NOT NULL, valid_until date NOT NULL, lead_days integer NOT NULL CHECK(lead_days BETWEEN 1 AND 365),
 payment_terms text NOT NULL, notes text NOT NULL DEFAULT '', approved_at timestamptz,
 created_by uuid NOT NULL REFERENCES relic.users(id), version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quotes_client_idx ON relic.quotes(client_id);
CREATE INDEX quotes_status_idx ON relic.quotes(status,valid_until);
CREATE TABLE relic.quote_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), quote_id uuid NOT NULL REFERENCES relic.quotes(id),
 position integer NOT NULL, description text NOT NULL, character_name text NOT NULL DEFAULT '', scale text NOT NULL DEFAULT '',
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 1000), calculation jsonb NOT NULL,
 unit_price_cents integer NOT NULL CHECK(unit_price_cents > 0), total_cents integer NOT NULL CHECK(total_cents = unit_price_cents * quantity),
 UNIQUE(quote_id,position)
);
CREATE TABLE relic.orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, quote_id uuid NOT NULL UNIQUE REFERENCES relic.quotes(id),
 client_id uuid NOT NULL REFERENCES relic.clients(id), client_snapshot jsonb NOT NULL, commercial_snapshot jsonb NOT NULL,
 status text NOT NULL DEFAULT 'WAITING_PAYMENT' CHECK(status IN ('WAITING_PAYMENT','CONFIRMED','IN_PRODUCTION','READY','DELIVERED','CANCELLED')),
 total_cents integer NOT NULL CHECK(total_cents > 0), deposit_cents integer NOT NULL CHECK(deposit_cents > 0 AND deposit_cents <= total_cents),
 cost_cents integer NOT NULL CHECK(cost_cents >= 0), profit_cents integer NOT NULL, due_date date NOT NULL,
 notes text NOT NULL DEFAULT '', delivered_at timestamptz, version integer NOT NULL DEFAULT 1,
 created_by uuid NOT NULL REFERENCES relic.users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_client_idx ON relic.orders(client_id);
CREATE INDEX orders_status_idx ON relic.orders(status,due_date);
CREATE TABLE relic.order_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES relic.orders(id),
 quote_item_id uuid NOT NULL REFERENCES relic.quote_items(id), snapshot jsonb NOT NULL,
 UNIQUE(order_id,quote_item_id)
);
CREATE TABLE relic.production_steps (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES relic.orders(id),
 order_item_id uuid NOT NULL REFERENCES relic.order_items(id),
 stage text NOT NULL CHECK(stage IN ('PREPARATION','PRINTING','POST_PROCESSING','ASSEMBLY','PRIMING','PAINTING','FINALIZATION','QUALITY_CHECK','PACKAGING')),
 status text NOT NULL DEFAULT 'WAITING' CHECK(status IN ('WAITING','READY','IN_PROGRESS','PAUSED','COMPLETED','BLOCKED','CANCELLED')),
 position integer NOT NULL CHECK(position > 0), assigned_to uuid REFERENCES relic.users(id),
 estimated_hours numeric(10,2) NOT NULL DEFAULT 0 CHECK(estimated_hours >= 0), actual_hours numeric(10,2) NOT NULL DEFAULT 0 CHECK(actual_hours >= 0),
 started_at timestamptz, completed_at timestamptz, notes text NOT NULL DEFAULT '', version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(order_item_id,position), UNIQUE(order_item_id,stage), CHECK(completed_at IS NULL OR started_at IS NOT NULL)
);
CREATE INDEX production_order_idx ON relic.production_steps(order_id,status);
CREATE TABLE relic.payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES relic.orders(id),
 kind text NOT NULL CHECK(kind IN ('DEPOSIT','BALANCE','ADDITIONAL','REFUND')),
 method text NOT NULL CHECK(method IN ('PIX','CASH','CREDIT_CARD','DEBIT_CARD','BANK_TRANSFER','OTHER')),
 status text NOT NULL CHECK(status IN ('PENDING','RECEIVED','CANCELLED')),
 amount_cents integer NOT NULL CHECK(amount_cents > 0), received_at timestamptz,
 reference text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '', idempotency_key uuid NOT NULL UNIQUE,
 created_by uuid NOT NULL REFERENCES relic.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((status = 'RECEIVED') = (received_at IS NOT NULL))
);
CREATE INDEX payments_order_idx ON relic.payments(order_id,status);
CREATE TABLE relic.pricing_overrides (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), quote_item_id uuid NOT NULL REFERENCES relic.quote_items(id),
 original_cents integer NOT NULL, final_cents integer NOT NULL, minimum_cents integer NOT NULL,
 justification text NOT NULL CHECK(length(justification) >= 8), below_minimum boolean NOT NULL,
 authorized_by uuid NOT NULL REFERENCES relic.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE relic.files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid REFERENCES relic.orders(id), quote_id uuid REFERENCES relic.quotes(id),
 name text NOT NULL, url text NOT NULL, provider text NOT NULL DEFAULT 'LINK' CHECK(provider IN ('LINK','GOOGLE_DRIVE')),
 external_id text NOT NULL DEFAULT '', created_by uuid NOT NULL REFERENCES relic.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(num_nonnulls(order_id,quote_id) = 1), CHECK(url ~ '^https://')
);
CREATE TABLE relic.audit_log (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid REFERENCES relic.users(id), action text NOT NULL,
 entity_type text NOT NULL, entity_id uuid, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity_idx ON relic.audit_log(entity_type,entity_id,created_at);

CREATE FUNCTION relic.touch_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); NEW.version = OLD.version + 1; RETURN NEW; END $$;
CREATE TRIGGER clients_touch BEFORE UPDATE ON relic.clients FOR EACH ROW EXECUTE FUNCTION relic.touch_version();
CREATE TRIGGER quotes_touch BEFORE UPDATE ON relic.quotes FOR EACH ROW EXECUTE FUNCTION relic.touch_version();
CREATE TRIGGER orders_touch BEFORE UPDATE ON relic.orders FOR EACH ROW EXECUTE FUNCTION relic.touch_version();
CREATE TRIGGER steps_touch BEFORE UPDATE ON relic.production_steps FOR EACH ROW EXECUTE FUNCTION relic.touch_version();
CREATE FUNCTION relic.prevent_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Registro imutável'; END $$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON relic.audit_log FOR EACH ROW EXECUTE FUNCTION relic.prevent_mutation();
CREATE TRIGGER override_immutable BEFORE UPDATE OR DELETE ON relic.pricing_overrides FOR EACH ROW EXECUTE FUNCTION relic.prevent_mutation();
CREATE TRIGGER order_item_immutable BEFORE UPDATE OR DELETE ON relic.order_items FOR EACH ROW EXECUTE FUNCTION relic.prevent_mutation();
CREATE FUNCTION relic.protect_policy() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (to_jsonb(NEW) - 'active') IS DISTINCT FROM (to_jsonb(OLD) - 'active') THEN RAISE EXCEPTION 'Crie uma nova versão da política'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER policy_immutable BEFORE UPDATE ON relic.pricing_settings FOR EACH ROW EXECUTE FUNCTION relic.protect_policy();
CREATE FUNCTION relic.protect_quote_item() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE s text; BEGIN
 SELECT status INTO s FROM relic.quotes WHERE id = COALESCE(NEW.quote_id,OLD.quote_id);
 IF s <> 'DRAFT' THEN RAISE EXCEPTION 'Itens comerciais congelados'; END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER quote_items_frozen BEFORE INSERT OR UPDATE OR DELETE ON relic.quote_items FOR EACH ROW EXECUTE FUNCTION relic.protect_quote_item();
CREATE FUNCTION relic.protect_quote() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status <> 'DRAFT' AND (to_jsonb(NEW) - ARRAY['status','approved_at','updated_at','version']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','approved_at','updated_at','version']) THEN RAISE EXCEPTION 'Orçamento congelado'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER quote_frozen BEFORE UPDATE ON relic.quotes FOR EACH ROW EXECUTE FUNCTION relic.protect_quote();
CREATE FUNCTION relic.protect_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (to_jsonb(NEW) - ARRAY['status','notes','due_date','delivered_at','updated_at','version']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','notes','due_date','delivered_at','updated_at','version']) THEN RAISE EXCEPTION 'Pedido comercial congelado'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER order_frozen BEFORE UPDATE ON relic.orders FOR EACH ROW EXECUTE FUNCTION relic.protect_order();
CREATE FUNCTION relic.protect_payment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status <> 'PENDING' OR (to_jsonb(NEW) - ARRAY['status','received_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','received_at']) THEN RAISE EXCEPTION 'Pagamento imutável; registre um estorno'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER payment_frozen BEFORE UPDATE ON relic.payments FOR EACH ROW EXECUTE FUNCTION relic.protect_payment();

REVOKE ALL ON SCHEMA relic FROM PUBLIC;
GRANT USAGE ON SCHEMA relic TO relic_runtime;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA relic TO relic_runtime;
REVOKE UPDATE ON relic.audit_log,relic.pricing_overrides,relic.order_items FROM relic_runtime;
GRANT DELETE ON relic.sessions,relic.quote_items TO relic_runtime;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA relic TO relic_runtime;
