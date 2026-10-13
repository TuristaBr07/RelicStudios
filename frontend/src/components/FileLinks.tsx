import { useState } from 'react';
import { ExternalLink, Link as LinkIcon, Plus } from 'lucide-react';
import {
  useData,
  useAction,
  api,
  send,
  Field,
  Form,
  Button,
  Feedback,
  ErrorBox,
  type Row,
} from '../lib';
export function FileLinks({ entity, id }: { entity: 'orderId' | 'quoteId'; id: string }) {
  const { data, error, reload } = useData<Row[]>(`/files?${entity}=${id}`);
  const [open, setOpen] = useState(false),
    [name, setName] = useState(''),
    [url, setUrl] = useState(''),
    [externalId, setExternalId] = useState('');
  const action = useAction();
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>
          <LinkIcon size={18} /> Arquivos e referências
        </h2>
        <button className="text-button" onClick={() => setOpen(!open)}>
          <Plus size={15} /> Adicionar link
        </button>
      </div>
      <ErrorBox error={error} />
      {data?.length ? (
        data.map((f) => (
          <a
            key={f.id}
            className="file-link"
            href={f.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>
              {f.name}
              <small>{f.provider === 'GOOGLE_DRIVE' ? 'Google Drive' : 'Referência externa'}</small>
            </span>
            <ExternalLink size={16} />
          </a>
        ))
      ) : (
        <p className="muted">
          Adicione links de STL, imagens e documentos. Os arquivos permanecem no serviço de origem.
        </p>
      )}
      {open && (
        <Form
          onSubmit={() =>
            void action.run(async () => {
              await api(
                '/files',
                send('POST', {
                  [entity]: id,
                  name,
                  url,
                  provider: externalId ? 'GOOGLE_DRIVE' : 'LINK',
                  externalId,
                }),
              );
              setName('');
              setUrl('');
              setExternalId('');
              setOpen(false);
              await reload();
            })
          }
        >
          <Field label="Nome da referência">
            <input
              required
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="URL HTTPS">
            <input
              required
              type="url"
              placeholder="https://"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </Field>
          <Field label="ID do Google Drive (opcional)">
            <input value={externalId} onChange={(e) => setExternalId(e.target.value)} />
          </Field>
          <Feedback action={action} />
          <Button busy={action.busy} className="primary">
            Salvar referência
          </Button>
        </Form>
      )}
    </section>
  );
}
