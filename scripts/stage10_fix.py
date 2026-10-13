from pathlib import Path

p = Path('backend/src/modules/manufacturing.ts')
text = p.read_text()
query_old = """        `SELECT j.*,i.order_id
           FROM relic.manufacturing_jobs j
           JOIN relic.order_items i ON i.id=j.order_item_id
          WHERE j.id=$1 FOR UPDATE`,
"""
query_new = """        'SELECT * FROM relic.manufacturing_jobs WHERE id=$1 FOR UPDATE',
"""
order_old = """      const [order] = await tx.query('SELECT status FROM relic.orders WHERE id=$1 FOR UPDATE', [
        job.order_id,
      ]);
"""
order_new = """      const [orderItem] = await tx.query('SELECT order_id FROM relic.order_items WHERE id=$1', [
        job.order_item_id,
      ]);
      ensure(orderItem, 'Item do pedido não encontrado.', 404);
      const [order] = await tx.query('SELECT status FROM relic.orders WHERE id=$1 FOR UPDATE', [
        orderItem.order_id,
      ]);
"""
if query_old not in text:
    raise SystemExit('job query pattern not found')
if order_old not in text:
    raise SystemExit('order lookup pattern not found')
p.write_text(text.replace(query_old, query_new, 1).replace(order_old, order_new, 1))
