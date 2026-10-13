-- Novas tabelas/sequências criadas por relic_app herdam as permissões básicas do runtime.
-- Objetos imutáveis/sensíveis devem continuar revogando UPDATE/DELETE explicitamente na migration que os criar.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'relic_app') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE relic_app IN SCHEMA relic GRANT SELECT, INSERT, UPDATE ON TABLES TO relic_runtime';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE relic_app IN SCHEMA relic GRANT USAGE, SELECT ON SEQUENCES TO relic_runtime';
  END IF;
END;
$$;

-- Integridade comercial em profundidade: novas propostas só podem nascer com a política vigente.
-- Orçamentos históricos continuam válidos mesmo quando sua política é desativada posteriormente.
CREATE OR REPLACE FUNCTION relic.require_active_quote_policy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  is_active boolean;
BEGIN
  SELECT active INTO is_active
  FROM relic.pricing_settings
  WHERE id = NEW.policy_id;

  IF is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Novos orçamentos exigem a política de preços ativa';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER quote_requires_active_policy
BEFORE INSERT OR UPDATE OF policy_id ON relic.quotes
FOR EACH ROW
EXECUTE FUNCTION relic.require_active_quote_policy();
