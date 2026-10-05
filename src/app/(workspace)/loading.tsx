export default function Loading() {
  return (
    <div role="status" aria-label="正在加载" className="loading-page">
      <div className="skeleton skeleton-heading" />
      <div className="skeleton skeleton-panel" />
      <div className="skeleton skeleton-row" />
      <div className="skeleton skeleton-row" />
      <span className="muted">正在加载教学空间…</span>
    </div>
  );
}
