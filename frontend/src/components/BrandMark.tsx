type BrandMarkProps = {
  large?: boolean;
};

export function BrandMark({ large = false }: BrandMarkProps) {
  return (
    <span className={`brand-mark ${large ? 'large' : ''}`}>
      <img className="brand-logo" src="/assets/relic-logo.png" alt="" aria-hidden="true" />
      <span className="brand-name">
        Relic<small>Studios</small>
      </span>
    </span>
  );
}
