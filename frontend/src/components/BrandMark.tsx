type BrandMarkProps = {
  large?: boolean;
};

export function BrandMark({ large = false }: BrandMarkProps) {
  return (
    <>
      <img className={`brand-logo ${large ? 'large' : ''}`} src="/assets/relic-logo.png" alt="" aria-hidden="true" />
      <div>
        Relic<small>Studios</small>
      </div>
    </>
  );
}
