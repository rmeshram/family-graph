import Link from "next/link"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary/20 via-secondary/10 to-background relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-secondary/10 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-white" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="7" r="3" />
                <circle cx="6" cy="17" r="2.5" />
                <circle cx="18" cy="17" r="2.5" />
                <path d="M12 10v3M8 14l-1.5 2M16 14l1.5 2" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-2xl font-bold text-foreground">Outverse</span>
          </Link>

          <div className="max-w-md">
            <h2 className="text-3xl font-bold text-foreground mb-4">
              Your family&apos;s history, all in one living tree.
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Start with your close family. Add parents, siblings, and relatives. Then discover connections across generations — built for Indian families.
            </p>
            <div className="mt-8 space-y-3">
              {[
                { icon: '🔒', text: 'Your data is private to your family by default' },
                { icon: '🆓', text: 'Free forever for core features — no credit card' },
                { icon: '🌳', text: 'Used by families across India and the diaspora' },
              ].map(({ icon, text }) => (
                <div key={text} className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span>{icon}</span>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-muted-foreground/50">
            © 2026 Outverse · Made with ❤️ for Indian families
          </div>
        </div>
      </div>

      {/* Right side - Auth form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 text-center">
            <Link href="/" className="inline-flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-white" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="7" r="3" />
                  <circle cx="6" cy="17" r="2.5" />
                  <circle cx="18" cy="17" r="2.5" />
                  <path d="M12 10v3M8 14l-1.5 2M16 14l1.5 2" strokeLinecap="round" />
                </svg>
              </div>
              <span className="text-2xl font-bold text-foreground">Outverse</span>
            </Link>
          </div>

          {children}
        </div>
      </div>
    </div>
  )
}
