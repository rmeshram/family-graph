export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="light-theme" style={{ background: '#FAFAF7', color: '#111827', minHeight: '100vh' }}>
      {children}
    </div>
  )
}
