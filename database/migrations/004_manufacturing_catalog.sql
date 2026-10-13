-- Catálogo de fabricação: tecnologias, impressoras, materiais e jobs operacionais.
CREATE TABLE relic.manufacturing_technologies (
  code text PRIMARY KEY CHECK(code ~ '^[A-Z0-9_]+$'),
  name text NOT NULL UNIQUE,
  material_unit text NOT NULL CHECK(material_unit IN ('ML','G')),
  print_time_model text NOT NULL CHECK(print_time_model IN ('BATCH_LAYER','ADDITIVE')),
  description text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO relic.manufacturing_technologies(code,name,material_unit,print_time_model,description) VALUES
  ('MSLA','Resina MSLA','ML','BATCH_LAYER','Tempo de job compartilhado por camada/placa; material medido em mililitros.'),
  ('FDM','Filamento FDM','G','ADDITIVE','Tempo de impressão normalmente aditivo por peça/job; material medido em gramas.');

CREATE TABLE relic.printers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technology_code text NOT NULL REFERENCES relic.manufacturing_technologies(code),
  name text NOT NULL UNIQUE CHECK(length(name) BETWEEN 2 AND 120),
  manufacturer text NOT NULL DEFAULT '' CHECK(length(manufacturer) <= 120),
  model text NOT NULL DEFAULT '' CHECK(length(model) <= 160),
  rated_power_watts numeric(10,2) NOT NULL DEFAULT 0 CHECK(rated_power_watts >= 0),
  estimated_average_power_watts numeric(10,2) CHECK(estimated_average_power_watts > 0),
  build_x_mm numeric(10,2) NOT NULL DEFAULT 0 CHECK(build_x_mm >= 0),
  build_y_mm numeric(10,2) NOT NULL DEFAULT 0 CHECK(build_y_mm >= 0),
  build_z_mm numeric(10,2) NOT NULL DEFAULT 0 CHECK(build_z_mm >= 0),
  purchase_cost_cents integer NOT NULL DEFAULT 0 CHECK(purchase_cost_cents >= 0),
  machine_hourly_cents integer NOT NULL DEFAULT 0 CHECK(machine_hourly_cents >= 0),
  maintenance_reserve_percent numeric(6,2) NOT NULL DEFAULT 0 CHECK(maintenance_reserve_percent BETWEEN 0 AND 100),
  active boolean NOT NULL DEFAULT true,
  notes text NOT NULL DEFAULT '' CHECK(length(notes) <= 4000),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX printers_technology_idx ON relic.printers(technology_code,active);

CREATE TABLE relic.materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technology_code text NOT NULL REFERENCES relic.manufacturing_technologies(code),
  name text NOT NULL UNIQUE CHECK(length(name) BETWEEN 2 AND 160),
  manufacturer text NOT NULL DEFAULT '' CHECK(length(manufacturer) <= 120),
  variant text NOT NULL DEFAULT '' CHECK(length(variant) <= 120),
  unit text NOT NULL CHECK(unit IN ('ML','G')),
  package_quantity numeric(12,3) NOT NULL CHECK(package_quantity > 0),
  package_price_cents integer NOT NULL CHECK(package_price_cents >= 0),
  waste_percent numeric(6,2) NOT NULL DEFAULT 0 CHECK(waste_percent BETWEEN 0 AND 100),
  supplier text NOT NULL DEFAULT '' CHECK(length(supplier) <= 200),
  active boolean NOT NULL DEFAULT true,
  notes text NOT NULL DEFAULT '' CHECK(length(notes) <= 4000),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX materials_technology_idx ON relic.materials(technology_code,active);

CREATE FUNCTION relic.validate_material_unit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected_unit text;
BEGIN
  SELECT material_unit INTO expected_unit
  FROM relic.manufacturing_technologies
  WHERE code = NEW.technology_code AND active;
  IF expected_unit IS NULL THEN
    RAISE EXCEPTION 'Tecnologia de fabricação inexistente ou inativa';
  END IF;
  IF NEW.unit <> expected_unit THEN
    RAISE EXCEPTION 'Unidade do material incompatível com a tecnologia';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER materials_validate_unit
BEFORE INSERT OR UPDATE OF technology_code,unit ON relic.materials
FOR EACH ROW EXECUTE FUNCTION relic.validate_material_unit();

CREATE TABLE relic.manufacturing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES relic.order_items(id),
  printer_id uuid NOT NULL REFERENCES relic.printers(id),
  material_id uuid NOT NULL REFERENCES relic.materials(id),
  technology_code text NOT NULL REFERENCES relic.manufacturing_technologies(code),
  position integer NOT NULL CHECK(position > 0),
  status text NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED','READY','RUNNING','COMPLETED','FAILED','CANCELLED')),
  output_quantity integer NOT NULL DEFAULT 1 CHECK(output_quantity BETWEEN 1 AND 10000),
  estimated_material_amount numeric(12,3) NOT NULL DEFAULT 0 CHECK(estimated_material_amount >= 0),
  actual_material_amount numeric(12,3) CHECK(actual_material_amount >= 0),
  estimated_minutes integer NOT NULL DEFAULT 0 CHECK(estimated_minutes >= 0),
  actual_minutes integer CHECK(actual_minutes >= 0),
  snapshot jsonb NOT NULL DEFAULT '{}',
  notes text NOT NULL DEFAULT '' CHECK(length(notes) <= 4000),
  created_by uuid NOT NULL REFERENCES relic.users(id),
  started_at timestamptz,
  completed_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_item_id,position),
  CHECK(completed_at IS NULL OR started_at IS NOT NULL)
);
CREATE INDEX manufacturing_jobs_order_item_idx ON relic.manufacturing_jobs(order_item_id,status);
CREATE INDEX manufacturing_jobs_printer_idx ON relic.manufacturing_jobs(printer_id,status);

CREATE FUNCTION relic.validate_manufacturing_job_refs() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE printer_tech text; material_tech text;
BEGIN
  SELECT technology_code INTO printer_tech FROM relic.printers WHERE id = NEW.printer_id;
  SELECT technology_code INTO material_tech FROM relic.materials WHERE id = NEW.material_id;
  IF printer_tech IS NULL OR material_tech IS NULL THEN
    RAISE EXCEPTION 'Impressora ou material não encontrado';
  END IF;
  IF printer_tech <> NEW.technology_code OR material_tech <> NEW.technology_code THEN
    RAISE EXCEPTION 'Impressora, material e tecnologia precisam ser compatíveis';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER manufacturing_jobs_validate_refs
BEFORE INSERT OR UPDATE OF printer_id,material_id,technology_code ON relic.manufacturing_jobs
FOR EACH ROW EXECUTE FUNCTION relic.validate_manufacturing_job_refs();

CREATE TRIGGER printers_touch BEFORE UPDATE ON relic.printers
FOR EACH ROW EXECUTE FUNCTION relic.touch_version();
CREATE TRIGGER materials_touch BEFORE UPDATE ON relic.materials
FOR EACH ROW EXECUTE FUNCTION relic.touch_version();
CREATE TRIGGER manufacturing_jobs_touch BEFORE UPDATE ON relic.manufacturing_jobs
FOR EACH ROW EXECUTE FUNCTION relic.touch_version();

-- Equipamentos atuais da Relic. Custos operacionais permanecem zerados até calibração real.
INSERT INTO relic.printers(
  technology_code,name,manufacturer,model,rated_power_watts,
  build_x_mm,build_y_mm,build_z_mm,notes
) VALUES
  ('MSLA','Saturn 4 12K','ELEGOO','Saturn 4 12K',144,218.88,122.88,220,
   'Potência de referência baseada na alimentação oficial 24 V / 6 A. Média real de consumo deve ser calibrada antes do uso comercial.'),
  ('FDM','Ender-3 V3 SE','Creality','Ender-3 V3 SE',350,220,220,250,
   'Potência nominal oficial de 350 W. Média real de consumo deve ser calibrada antes do uso comercial.');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'relic_runtime') THEN
    GRANT SELECT ON relic.manufacturing_technologies TO relic_runtime;
    GRANT SELECT,INSERT,UPDATE ON relic.printers,relic.materials,relic.manufacturing_jobs TO relic_runtime;
  END IF;
END;
$$;
