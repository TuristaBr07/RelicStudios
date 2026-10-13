from pathlib import Path

path = Path('frontend/src/pages/Pricing.tsx')
text = path.read_text()
old = """            {[
              ['optimistic', 'Otimista'],
              ['mostLikely', 'Mais provável'],
              ['pessimistic', 'Pessimista'],
            ].map(([key, label]) => (
"""
new = """            {([
              ['optimistic', 'Otimista'],
              ['mostLikely', 'Mais provável'],
              ['pessimistic', 'Pessimista'],
            ] as const).map(([key, label]) => (
"""
if old not in text:
    raise SystemExit('stage 9 tuple pattern not found')
path.write_text(text.replace(old, new, 1))
