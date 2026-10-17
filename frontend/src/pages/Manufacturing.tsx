import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Printer, Package, Plus, Edit3, Archive, RotateCcw } from 'lucide-react';
import {
  useData,
  useAuth,
  useAction,
  api,
  send,
  Header,
  Field,
  Form,
  Button,
  Modal,
  Feedback,
  Loading,
  ErrorBox,
  Empty,
  Metric,
  money,
  num,
  type Row,
} from '../lib';

const unitLabel = (unit: string) => (unit === 'ML' ? 'mL' : 'g');

function SetupReview({ printers, materials }: { printers: Row[]; materials: Row[] }) {
  const { data, error, loading } = useData<Row[]>('/policies');
  const policy = data?.find((p) => p.active);
  const active = printers.filter((p) => p.active);
  const pending = active.filter((p) => !Number(p.machine_hourly_cents) || !Number(p.estimated_average_power_watts));
  const missingMaterial = active.filter((p) => !materials.some((m) => m.active && m.technology_code === p.technology_code));
  const freeMaterials = materials.filter((m) => m.active && !Number(m.package_price_cents));
  return (
    <section className="panel" aria-labelledby="setup-title">
      <div className="panel-heading"><div><span className="eyebrow">ANTES DO PRIMEIRO ORÇAMENTO</span><h2 id="setup-title">Conferência dos custos</h2></div></div>
      <ErrorBox error={error} />
      {loading ? <Loading /> : !error && <>
        <p className="muted">Use preços de compra e medições reais. Os valores atuais continuam disponíveis para simulações.</p>
        <ul>
          {!active.length && <li>Cadastre uma impressora ativa para trabalhos de impressão.</li>}
          {missingMaterial.map((p) => <li key={p.id}>{p.name}: cadastre um material ativo de tecnologia {p.technology_code}.</li>)}
          {freeMaterials.map((m) => <li key={m.id}>{m.name}: confira o preço da embalagem, atualmente zerado.</li>)}
          {pending.map((p) => <li key={p.id}>{p.name}: confira {[
            ...(!Number(p.machine_hourly_cents) ? ['o custo de máquina por hora (zerado)'] : []),
            ...(!Number(p.estimated_average_power_watts) ? ['o consumo médio (sem medição)'] : []),
          ].join(' e ')}.</li>)}
          {!policy || !Number(policy.settings.electricityKwh) ? <li>Informe a tarifa efetiva de energia em <Link to="/settings?tab=POLICIES">Configurações → Precificação</Link>.</li> : <li>Energia cadastrada: {money(policy.settings.electricityKwh * 100)}/kWh. Confira se corresponde à tarifa atual.</li>}
        </ul>
        <p className="fine-print">Edite impressoras e materiais nas listas abaixo. Custos zerados podem ser intencionais, mas precisam ser conferidos. Potência nominal não substitui medição de consumo médio.</p>
      </>}
    </section>
  );
}

function printerDraft(row?: Row, technologyCode = 'MSLA'): Row {
  return row
    ? {
        technologyCode: row.technology_code,
        name: row.name,
        manufacturer: row.manufacturer,
        model: row.model,
        ratedPowerWatts: Number(row.rated_power_watts),
        estimatedAveragePowerWatts:
          row.estimated_average_power_watts === null ? '' : Number(row.estimated_average_power_watts),
        buildXmm: Number(row.build_x_mm),
        buildYmm: Number(row.build_y_mm),
        buildZmm: Number(row.build_z_mm),
        purchaseCostReais: Number(row.purchase_cost_cents ?? 0) / 100,
        machineHourlyReais: Number(row.machine_hourly_cents ?? 0) / 100,
        maintenanceReservePercent: Number(row.maintenance_reserve_percent ?? 0),
        active: row.active,
        notes: row.notes,
        version: row.version,
      }
    : {
        technologyCode,
        name: '',
        manufacturer: '',
        model: '',
        ratedPowerWatts: 0,
        estimatedAveragePowerWatts: '',
        buildXmm: 0,
        buildYmm: 0,
        buildZmm: 0,
        purchaseCostReais: 0,
        machineHourlyReais: 0,
        maintenanceReservePercent: 0,
        active: true,
        notes: '',
      };
}

function printerPayload(row: Row) {
  return {
    technologyCode: row.technologyCode,
    name: row.name,
    manufacturer: row.manufacturer,
    model: row.model,
    ratedPowerWatts: num(String(row.ratedPowerWatts)),
    estimatedAveragePowerWatts:
      row.estimatedAveragePowerWatts === '' ? null : num(String(row.estimatedAveragePowerWatts)),
    buildXmm: num(String(row.buildXmm)),
    buildYmm: num(String(row.buildYmm)),
    buildZmm: num(String(row.buildZmm)),
    purchaseCostCents: Math.round(num(String(row.purchaseCostReais)) * 100),
    machineHourlyCents: Math.round(num(String(row.machineHourlyReais)) * 100),
    maintenanceReservePercent: num(String(row.maintenanceReservePercent)),
    active: Boolean(row.active),
    notes: row.notes,
    ...(row.version ? { version: row.version } : {}),
  };
}

function materialDraft(row?: Row, technologyCode = 'MSLA'): Row {
  return row
    ? {
        technologyCode: row.technology_code,
        name: row.name,
        manufacturer: row.manufacturer,
        variant: row.variant,
        packageQuantity: Number(row.package_quantity),
        packagePriceReais: Number(row.package_price_cents ?? 0) / 100,
        wastePercent: Number(row.waste_percent),
        supplier: row.supplier,
        active: row.active,
        notes: row.notes,
        version: row.version,
      }
    : {
        technologyCode,
        name: '',
        manufacturer: '',
        variant: '',
        packageQuantity: 1000,
        packagePriceReais: 0,
        wastePercent: 0,
        supplier: '',
        active: true,
        notes: '',
      };
}

function materialPayload(row: Row) {
  return {
    technologyCode: row.technologyCode,
    name: row.name,
    manufacturer: row.manufacturer,
    variant: row.variant,
    packageQuantity: num(String(row.packageQuantity)),
    packagePriceCents: Math.round(num(String(row.packagePriceReais)) * 100),
    wastePercent: num(String(row.wastePercent)),
    supplier: row.supplier,
    active: Boolean(row.active),
    notes: row.notes,
    ...(row.version ? { version: row.version } : {}),
  };
}

export function Manufacturing() {
  const { user } = useAuth();
  const admin = user!.role === 'ADMIN';
  const technologies = useData<Row[]>('/manufacturing/technologies');
  const printers = useData<Row[]>(
    `/manufacturing/printers${admin ? '?includeInactive=true' : ''}`,
  );
  const materials = useData<Row[]>(
    `/manufacturing/materials${admin ? '?includeInactive=true' : ''}`,
  );
  const jobs = useData<Row[]>('/manufacturing/jobs');
  const [printer, setPrinter] = useState<Row | null>(null);
  const [material, setMaterial] = useState<Row | null>(null);
  const action = useAction();

  const technology = (code: string) => technologies.data?.find((t) => t.code === code);

  const savePrinter = async () => {
    if (!printer) return;
    const payload = printerPayload(printer);
    await api(
      printer.version ? `/manufacturing/printers/${printer.id}` : '/manufacturing/printers',
      send(printer.version ? 'PATCH' : 'POST', payload),
    );
    setPrinter(null);
    await printers.reload();
  };

  const saveMaterial = async () => {
    if (!material) return;
    const payload = materialPayload(material);
    await api(
      material.version ? `/manufacturing/materials/${material.id}` : '/manufacturing/materials',
      send(material.version ? 'PATCH' : 'POST', payload),
    );
    setMaterial(null);
    await materials.reload();
  };

  const loading = technologies.loading || printers.loading || materials.loading || jobs.loading;
  const error = technologies.error || printers.error || materials.error || jobs.error;

  return (
    <>
      <Header
        eyebrow="CAPACIDADE DO ATELIÊ"
        title="Fabricação"
        subtitle="Impressoras, tecnologias e materiais que sustentam o custo real de cada criação."
        action={
          admin ? (
            <div className="button-row">
              <button
                onClick={() =>
                  setPrinter(printerDraft(undefined, technologies.data?.[0]?.code ?? 'MSLA'))
                }
              >
                <Plus size={16} /> Impressora
              </button>
              <button
                className="primary"
                onClick={() =>
                  setMaterial(materialDraft(undefined, technologies.data?.[0]?.code ?? 'MSLA'))
                }
              >
                <Plus size={16} /> Material
              </button>
            </div>
          ) : undefined
        }
      />
      <Feedback action={action} />
      <ErrorBox error={error} />
      {loading ? (
        <Loading />
      ) : (
        <>
          <div className="metrics three-metrics">
            <Metric
              label="Impressoras ativas"
              value={printers.data?.filter((p) => p.active).length ?? 0}
              detail="Equipamentos disponíveis"
              accent
            />
            <Metric
              label="Materiais ativos"
              value={materials.data?.filter((m) => m.active).length ?? 0}
              detail="Resinas e filamentos cadastrados"
            />
            <Metric
              label="Jobs registrados"
              value={jobs.data?.length ?? 0}
              detail="Jobs vinculados a pedidos"
            />
          </div>

          {admin && !error && <SetupReview printers={printers.data ?? []} materials={materials.data ?? []} />}
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">MODELO DE FABRICAÇÃO</span>
                <h2>Tecnologias</h2>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tecnologia</th>
                    <th>Material</th>
                    <th>Modelo de tempo</th>
                    <th>Regra</th>
                  </tr>
                </thead>
                <tbody>
                  {technologies.data?.map((t) => (
                    <tr key={t.code}>
                      <td>
                        <strong>{t.name}</strong>
                        <small>{t.code}</small>
                      </td>
                      <td>{unitLabel(t.material_unit)}</td>
                      <td>{t.print_time_model === 'BATCH_LAYER' ? 'Por placa/camada' : 'Aditivo'}</td>
                      <td>{t.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">EQUIPAMENTOS</span>
                <h2>
                  <Printer size={19} /> Impressoras
                </h2>
              </div>
            </div>
            {!printers.data?.length ? (
              <Empty title="Nenhuma impressora cadastrada" text="Cadastre o primeiro equipamento." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Impressora</th>
                      <th>Tecnologia</th>
                      <th>Volume útil</th>
                      <th>Potência</th>
                      <th>Custo máquina</th>
                      <th>Estado</th>
                      {admin && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {printers.data.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                          <small>
                            {[p.manufacturer, p.model].filter(Boolean).join(' · ') || 'Modelo não informado'}
                          </small>
                        </td>
                        <td>{p.technology_name}</td>
                        <td>
                          {Number(p.build_x_mm)} × {Number(p.build_y_mm)} × {Number(p.build_z_mm)} mm
                        </td>
                        <td>
                          {Number(p.rated_power_watts)} W
                          <small>
                            {p.estimated_average_power_watts
                              ? `média calibrada ${Number(p.estimated_average_power_watts)} W`
                              : 'média real ainda não calibrada'}
                          </small>
                        </td>
                        <td>
                          {p.machine_hourly_cents === undefined
                            ? 'Restrito'
                            : `${money(p.machine_hourly_cents)}/h`}
                        </td>
                        <td>
                          <span className={`tag ${p.active ? 'green' : ''}`}>
                            {p.active ? 'Ativa' : 'Inativa'}
                          </span>
                        </td>
                        {admin && (
                          <td>
                            <div className="button-row">
                              <button
                                className="icon-button"
                                aria-label={`Editar ${p.name}`}
                                onClick={() => setPrinter({ id: p.id, ...printerDraft(p) })}
                              >
                                <Edit3 size={16} />
                              </button>
                              <button
                                className="icon-button"
                                aria-label={`${p.active ? 'Desativar' : 'Reativar'} ${p.name}`}
                                onClick={() =>
                                  void action.run(async () => {
                                    const draft = {
                                      id: p.id,
                                      ...printerDraft(p),
                                      active: !p.active,
                                    };
                                    await api(
                                      `/manufacturing/printers/${p.id}`,
                                      send('PATCH', printerPayload(draft)),
                                    );
                                    await printers.reload();
                                  }, p.active ? 'Impressora desativada.' : 'Impressora reativada.')
                                }
                              >
                                {p.active ? <Archive size={16} /> : <RotateCcw size={16} />}
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="fine-print">
              Potência nominal é uma referência de equipamento; consumo médio para energia deve ser
              calibrado com medição real antes de entrar na precificação.
            </p>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">INSUMOS</span>
                <h2>
                  <Package size={19} /> Materiais
                </h2>
              </div>
            </div>
            {!materials.data?.length ? (
              <Empty
                title="Nenhum material cadastrado"
                text="Cadastre as resinas e filamentos realmente comprados pela Relic."
              />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Material</th>
                      <th>Tecnologia</th>
                      <th>Embalagem</th>
                      <th>Custo unitário</th>
                      <th>Perda</th>
                      <th>Estado</th>
                      {admin && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {materials.data.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <strong>{m.name}</strong>
                          <small>
                            {[m.manufacturer, m.variant, m.supplier].filter(Boolean).join(' · ') ||
                              'Sem detalhes adicionais'}
                          </small>
                        </td>
                        <td>{m.technology_name}</td>
                        <td>
                          {Number(m.package_quantity).toLocaleString('pt-BR')} {unitLabel(m.unit)}
                        </td>
                        <td>
                          {m.unit_cost_cents === undefined
                            ? 'Restrito'
                            : `${money(Number(m.unit_cost_cents))}/${unitLabel(m.unit)}`}
                        </td>
                        <td>{Number(m.waste_percent).toLocaleString('pt-BR')}%</td>
                        <td>
                          <span className={`tag ${m.active ? 'green' : ''}`}>
                            {m.active ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        {admin && (
                          <td>
                            <div className="button-row">
                              <button
                                className="icon-button"
                                aria-label={`Editar ${m.name}`}
                                onClick={() => setMaterial({ id: m.id, ...materialDraft(m) })}
                              >
                                <Edit3 size={16} />
                              </button>
                              <button
                                className="icon-button"
                                aria-label={`${m.active ? 'Desativar' : 'Reativar'} ${m.name}`}
                                onClick={() =>
                                  void action.run(async () => {
                                    const draft = {
                                      id: m.id,
                                      ...materialDraft(m),
                                      active: !m.active,
                                    };
                                    await api(
                                      `/manufacturing/materials/${m.id}`,
                                      send('PATCH', materialPayload(draft)),
                                    );
                                    await materials.reload();
                                  }, m.active ? 'Material desativado.' : 'Material reativado.')
                                }
                              >
                                {m.active ? <Archive size={16} /> : <RotateCcw size={16} />}
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {printer && (
            <Modal
              title={printer.version ? 'Editar impressora' : 'Nova impressora'}
              onClose={() => setPrinter(null)}
              wide
            >
              <Form className="modal-body" onSubmit={() => void action.run(savePrinter, 'Impressora salva.')}>
                <div className="form-grid three">
                  <Field label="Nome *">
                    <input
                      required
                      minLength={2}
                      maxLength={120}
                      value={printer.name}
                      onChange={(e) => setPrinter({ ...printer, name: e.target.value })}
                    />
                  </Field>
                  <Field label="Fabricante">
                    <input
                      maxLength={120}
                      value={printer.manufacturer}
                      onChange={(e) => setPrinter({ ...printer, manufacturer: e.target.value })}
                    />
                  </Field>
                  <Field label="Modelo">
                    <input
                      maxLength={160}
                      value={printer.model}
                      onChange={(e) => setPrinter({ ...printer, model: e.target.value })}
                    />
                  </Field>
                  <Field label="Tecnologia">
                    <select
                      value={printer.technologyCode}
                      onChange={(e) => setPrinter({ ...printer, technologyCode: e.target.value })}
                    >
                      {technologies.data?.map((t) => (
                        <option key={t.code} value={t.code}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Potência nominal (W)">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={printer.ratedPowerWatts}
                      onChange={(e) => setPrinter({ ...printer, ratedPowerWatts: num(e.target.value) })}
                    />
                  </Field>
                  <Field label="Consumo médio calibrado (W)" hint="Deixe vazio até medir o equipamento.">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={printer.estimatedAveragePowerWatts}
                      onChange={(e) =>
                        setPrinter({
                          ...printer,
                          estimatedAveragePowerWatts:
                            e.target.value === '' ? '' : num(e.target.value),
                        })
                      }
                    />
                  </Field>
                  {(['X', 'Y', 'Z'] as const).map((axis) => (
                    <Field key={axis} label={`Volume ${axis} (mm)`}>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={printer[`build${axis}mm`]}
                        onChange={(e) =>
                          setPrinter({ ...printer, [`build${axis}mm`]: num(e.target.value) })
                        }
                      />
                    </Field>
                  ))}
                  <Field label="Custo de aquisição (R$)" hint="Referência do equipamento. Não calcula automaticamente o custo por hora.">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={printer.purchaseCostReais}
                      onChange={(e) =>
                        setPrinter({ ...printer, purchaseCostReais: num(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Custo da máquina (R$/h)" hint="Informe o custo por hora definido para o equipamento. Energia e reserva de manutenção são calculadas separadamente.">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={printer.machineHourlyReais}
                      onChange={(e) =>
                        setPrinter({ ...printer, machineHourlyReais: num(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Reserva de manutenção (%)" hint="Percentual aplicado sobre o custo de máquina por hora.">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={printer.maintenanceReservePercent}
                      onChange={(e) =>
                        setPrinter({ ...printer, maintenanceReservePercent: num(e.target.value) })
                      }
                    />
                  </Field>
                </div>
                <Field label="Observações">
                  <textarea
                    maxLength={4000}
                    value={printer.notes}
                    onChange={(e) => setPrinter({ ...printer, notes: e.target.value })}
                  />
                </Field>
                <p className="fine-print">
                  Tecnologia selecionada: {technology(printer.technologyCode)?.description}
                </p>
                <Feedback action={action} />
                <Button className="primary" busy={action.busy}>
                  Salvar impressora
                </Button>
              </Form>
            </Modal>
          )}

          {material && (
            <Modal
              title={material.version ? 'Editar material' : 'Novo material'}
              onClose={() => setMaterial(null)}
              wide
            >
              <Form className="modal-body" onSubmit={() => void action.run(saveMaterial, 'Material salvo.')}>
                <div className="form-grid three">
                  <Field label="Nome *">
                    <input
                      required
                      minLength={2}
                      maxLength={160}
                      value={material.name}
                      onChange={(e) => setMaterial({ ...material, name: e.target.value })}
                    />
                  </Field>
                  <Field label="Fabricante">
                    <input
                      maxLength={120}
                      value={material.manufacturer}
                      onChange={(e) => setMaterial({ ...material, manufacturer: e.target.value })}
                    />
                  </Field>
                  <Field label="Cor / variante">
                    <input
                      maxLength={120}
                      value={material.variant}
                      onChange={(e) => setMaterial({ ...material, variant: e.target.value })}
                    />
                  </Field>
                  <Field label="Tecnologia">
                    <select
                      value={material.technologyCode}
                      onChange={(e) => setMaterial({ ...material, technologyCode: e.target.value })}
                    >
                      {technologies.data?.map((t) => (
                        <option key={t.code} value={t.code}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label={`Quantidade da embalagem (${unitLabel(
                      technology(material.technologyCode)?.material_unit ?? 'G',
                    )})`}
                  >
                    <input
                      required
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={material.packageQuantity}
                      onChange={(e) =>
                        setMaterial({ ...material, packageQuantity: num(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Preço da embalagem (R$)">
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      value={material.packagePriceReais}
                      onChange={(e) =>
                        setMaterial({ ...material, packagePriceReais: num(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Reserva de perda (%)">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={material.wastePercent}
                      onChange={(e) => setMaterial({ ...material, wastePercent: num(e.target.value) })}
                    />
                  </Field>
                  <Field label="Fornecedor">
                    <input
                      maxLength={200}
                      value={material.supplier}
                      onChange={(e) => setMaterial({ ...material, supplier: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Observações">
                  <textarea
                    maxLength={4000}
                    value={material.notes}
                    onChange={(e) => setMaterial({ ...material, notes: e.target.value })}
                  />
                </Field>
                <p className="fine-print">
                  A unidade é definida pela tecnologia: MSLA usa mL e FDM usa gramas. O custo unitário
                  é calculado automaticamente pela embalagem cadastrada. Se a resina foi vendida em kg,
                  use o volume informado pelo fabricante ou converta com a densidade do produto; não trate kg como litros.
                </p>
                <Feedback action={action} />
                <Button className="primary" busy={action.busy}>
                  Salvar material
                </Button>
              </Form>
            </Modal>
          )}
        </>
      )}
    </>
  );
}
