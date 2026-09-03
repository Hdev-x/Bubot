type Props = {
  title: string;
  description: string;
};

export default function PlaceholderPage({ title, description }: Props) {
  return (
    <main className="mobile-shell placeholder-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">Botz</p>
          <h1>{title}</h1>
        </div>
      </header>

      <section className="empty-state">
        <p className="eyebrow">다음 작업</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </section>
    </main>
  );
}
