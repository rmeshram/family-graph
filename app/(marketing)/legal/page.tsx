"use client"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Link from "next/link"
import { ArrowLeft, Shield, FileText } from "lucide-react"

export default function LegalPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-muted/30">
        <div className="container max-w-5xl mx-auto px-4 py-6">
          <Link href="/">
            <Button variant="ghost" size="sm" className="mb-4 -ml-3">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Legal Information</h1>
              <p className="text-sm text-muted-foreground mt-1">Terms of Service and Privacy Policy</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container max-w-5xl mx-auto px-4 py-12">
        <Tabs defaultValue="terms" className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-8">
            <TabsTrigger value="terms" className="gap-2">
              <FileText className="h-4 w-4" />
              Terms of Service
            </TabsTrigger>
            <TabsTrigger value="privacy" className="gap-2">
              <Shield className="h-4 w-4" />
              Privacy Policy
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="terms" className="mt-0">
            <div className="prose prose-slate dark:prose-invert max-w-none">
              <div className="not-prose mb-8 rounded-xl border bg-card p-6">
                <h2 className="text-2xl font-bold mb-2">Terms of Service</h2>
                <p className="text-sm text-muted-foreground">Effective Date: May 29, 2026</p>
                <p className="text-sm text-muted-foreground mt-1">Last Updated: May 29, 2026</p>
              </div>

              <section className="mb-12">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">1</span>
                  Acceptance of Terms
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  Welcome to Outverse. By accessing or using our service, you agree to be bound by these Terms of Service ("Terms"). 
                  If you do not agree to these Terms, please do not use Outverse.
                </p>
                <p className="text-muted-foreground leading-relaxed mt-4">
                  Outverse is currently in beta testing. During this period, the service is provided on an "as-is" and "as-available" basis. 
                  We may modify, suspend, or discontinue any aspect of the service at any time.
                </p>
              </section>

              <Separator className="my-8" />

              <section className="mb-12">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">2</span>
                  User Responsibilities
                </h3>
                <div className="space-y-4">
                  <div className="rounded-lg border bg-muted/50 p-4">
                    <h4 className="font-semibold mb-2">Content Ownership & Permission</h4>
                    <p className="text-sm text-muted-foreground">
                      You are solely responsible for all content you upload, including family member information, photos, and stories. 
                      You must have the necessary permissions and legal rights to share this information.
                    </p>
                  </div>
                  <div className="rounded-lg border bg-muted/50 p-4">
                    <h4 className="font-semibold mb-2">Prohibited Content</h4>
                    <p className="text-sm text-muted-foreground">
                      You agree not to upload content that is illegal, offensive, defamatory, violates intellectual property rights, 
                      or infringes on the privacy rights of others.
                    </p>
                  </div>
                  <div className="rounded-lg border bg-muted/50 p-4">
                    <h4 className="font-semibold mb-2">Age Requirement</h4>
                    <p className="text-sm text-muted-foreground">
                      You must be at least 13 years old to create an account and use Outverse.
                    </p>
                  </div>
                </div>
              </section>

              <Separator className="my-8" />

              <section className="mb-12">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">3</span>
                  Service Description
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  Outverse is a family tree platform that allows you to map your family network, discover relationships, 
                  and preserve family stories. Our service includes:
                </p>
                <ul className="mt-4 space-y-2">
                  <li className="flex items-start gap-3">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">✓</span>
                    <span className="text-muted-foreground">Interactive family tree visualization and management</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">✓</span>
                    <span className="text-muted-foreground">AI-powered relationship discovery and family insights</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">✓</span>
                    <span className="text-muted-foreground">Collaboration tools to build your family tree with relatives</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">✓</span>
                    <span className="text-muted-foreground">Storage for family photos, stories, and memories</span>
                  </li>
                </ul>
              </section>

              <Separator className="my-8" />

              <section className="mb-12">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">4</span>
                  Beta Program Limitations
                </h3>
                <div className="rounded-xl border-2 border-amber-500/20 bg-amber-500/5 p-6">
                  <p className="font-semibold text-amber-600 dark:text-amber-400 mb-3">Important Beta Notice</p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <span className="text-amber-500">•</span>
                      <span>The service may experience interruptions, bugs, or data inconsistencies</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-amber-500">•</span>
                      <span>Features may be added, modified, or removed without prior notice</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-amber-500">•</span>
                      <span>No uptime or availability guarantees during the beta period</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-amber-500">•</span>
                      <span>The service is currently free; pricing may be introduced in the future with advance notice</span>
                    </li>
                  </ul>
                </div>
              </section>

              <Separator className="my-8" />

              <section className="mb-12">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">5</span>
                  Intellectual Property
                </h3>
                <div className="space-y-4">
                  <p className="text-muted-foreground leading-relaxed">
                    <strong>Your Content:</strong> You retain all ownership rights to the content you upload. By using Outverse, 
                    you grant us a worldwide, non-exclusive license to store, display, and process your content solely for the purpose 
                    of providing our service to you and your invited family members.
                  </p>
                  <p className="text-muted-foreground leading-relaxed">
                    <strong>Our Platform:</strong> Outverse, including its code, design, features, and branding, is owned by us 
                    and protected by copyright and other intellectual property laws.
                  </p>
                </div>
              </section>

              <Separator className="my-8" />

              <section className="mb-12">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">6</span>
                  Disclaimers and Limitation of Liability
                </h3>
                <div className="rounded-xl border bg-muted/50 p-6 space-y-4">
                  <p className="text-sm">
                    <strong>No Warranty:</strong> Outverse is provided "as-is" without warranties of any kind, either express or implied, 
                    including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement.
                  </p>
                  <p className="text-sm">
                    <strong>Limitation of Liability:</strong> To the maximum extent permitted by law, we shall not be liable for any indirect, 
                    incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, 
                    or any loss of data, use, goodwill, or other intangible losses resulting from your use of Outverse.
                  </p>
                  <p className="text-sm">
                    <strong>Maximum Liability:</strong> Our total liability to you for any claims arising from your use of Outverse 
                    shall not exceed the amount you have paid us in the past 12 months (currently $0 during beta).
                  </p>
                </div>
              </section>

              <Separator className="my-8" />

              <section className="mb-12">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">7</span>
                  Account Termination
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  We reserve the right to suspend or terminate your account if you violate these Terms, engage in fraudulent or illegal activity, 
                  or if we believe your actions may harm other users or our service. You may also terminate your account at any time through your account settings.
                </p>
              </section>

              <Separator className="my-8" />

              <section className="mb-12">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">8</span>
                  Changes to Terms
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  We may update these Terms from time to time. When we make material changes, we will notify you via email or through the service. 
                  Your continued use of Outverse after such changes constitutes your acceptance of the new Terms.
                </p>
              </section>

              <Separator className="my-8" />

              <section className="mb-12">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">9</span>
                  Contact Information
                </h3>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  If you have questions about these Terms, please contact us:
                </p>
                <div className="rounded-lg border bg-card p-4">
                  <p className="text-sm">
                    <strong>Email:</strong> <a href="mailto:support@outverse.in" className="text-primary hover:underline">support@outverse.in</a>
                  </p>
                  <p className="text-sm mt-2">
                    <strong>Through the App:</strong> Settings → Help & Feedback
                  </p>
                </div>
              </section>

              <div className="not-prose mt-12 rounded-xl border bg-muted/30 p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  By creating an account and using Outverse, you acknowledge that you have read, understood, 
                  and agree to be bound by these Terms of Service.
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="privacy" className="mt-0">
            <div className="prose prose-slate dark:prose-invert max-w-none">
              <div className="not-prose mb-8 rounded-xl border bg-card p-6">
                <h2 className="text-2xl font-bold mb-2">Privacy Policy</h2>
                <p className="text-sm text-muted-foreground">Effective Date: May 29, 2026</p>
                <p className="text-sm text-muted-foreground mt-1">Last Updated: May 29, 2026</p>
              </div>

              <section className="mb-12">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">1</span>
                  Introduction
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  At Outverse, we take your privacy seriously. This Privacy Policy explains how we collect, use, share, 
                  and protect your personal information when you use our family tree platform. By using Outverse, you consent 
                  to the practices described in this policy.
                </p>
              </section>

              <Separator className="my-8" />

              <section className="mb-12">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">2</span>
                  Information We Collect
                </h3>
                <div className="space-y-6">
                  <div>
                    <h4 className="font-semibold mb-3 text-base">Account Information</h4>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-3">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0"></span>
                        <span className="text-sm text-muted-foreground">Email address (required for account creation)</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0"></span>
                        <span className="text-sm text-muted-foreground">Full name</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0"></span>
                        <span className="text-sm text-muted-foreground">Phone number (optional, if you choose phone-based authentication)</span>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-3 text-base">Family Tree Data</h4>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-3">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0"></span>
                        <span className="text-sm text-muted-foreground">Names and biographical information of family members</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0"></span>
                        <span className="text-sm text-muted-foreground">Birth years, locations, and other details you add</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0"></span>
                        <span className="text-sm text-muted-foreground">Photos, documents, and stories you upload</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0"></span>
                        <span className="text-sm text-muted-foreground">Relationship connections between family members</span>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-3 text-base">Usage Information</h4>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-3">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0"></span>
                        <span className="text-sm text-muted-foreground">Pages visited and features used (via Vercel Analytics)</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0"></span>
                        <span className="text-sm text-muted-foreground">Browser type and device information</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0"></span>
                        <span className="text-sm text-muted-foreground">IP address (for security and abuse prevention)</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0"></span>
                        <span className="text-sm text-muted-foreground">AI chat queries (processed by Google Gemini)</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </section>

              <Separator className="my-8" />

              <section className="mb-12">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">3</span>
                  How We Use Your Information
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border bg-card p-4">
                    <h4 className="font-semibold mb-2 text-sm">Service Delivery</h4>
                    <p className="text-xs text-muted-foreground">To provide and maintain the Outverse platform, including creating your family tree and enabling collaboration.</p>
                  </div>
                  <div className="rounded-lg border bg-card p-4">
                    <h4 className="font-semibold mb-2 text-sm">Product Improvement</h4>
                    <p className="text-xs text-muted-foreground">To analyze usage patterns and improve our features, using anonymized and aggregated data.</p>
                  </div>
                  <div className="rounded-lg border bg-card p-4">
                    <h4 className="font-semibold mb-2 text-sm">Communication</h4>
                    <p className="text-xs text-muted-foreground">To send important service updates, security alerts, and respond to your inquiries.</p>
                  </div>
                  <div className="rounded-lg border bg-card p-4">
                    <h4 className="font-semibold mb-2 text-sm">AI Features</h4>
                    <p className="text-xs text-muted-foreground">To power our AI Copilot feature using Google Gemini for relationship discovery and family insights.</p>
                  </div>
                </div>
              </section>

              <Separator className="my-8" />

              <section className="mb-12">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">4</span>
                  How We Share Your Information
                </h3>
                <div className="space-y-6">
                  <div>
                    <h4 className="font-semibold mb-3 text-base">Service Providers</h4>
                    <p className="text-sm text-muted-foreground mb-3">We share data with trusted third-party service providers who help us operate Outverse:</p>
                    <div className="grid gap-3">
                      <div className="rounded-lg border bg-muted/50 p-3">
                        <p className="text-sm font-medium">Supabase (Database Hosting)</p>
                        <p className="text-xs text-muted-foreground mt-1">Stores your family tree data securely in the United States</p>
                      </div>
                      <div className="rounded-lg border bg-muted/50 p-3">
                        <p className="text-sm font-medium">Google AI (Gemini)</p>
                        <p className="text-xs text-muted-foreground mt-1">Processes AI chat queries to provide relationship insights</p>
                      </div>
                      <div className="rounded-lg border bg-muted/50 p-3">
                        <p className="text-sm font-medium">Vercel (Hosting & Analytics)</p>
                        <p className="text-xs text-muted-foreground mt-1">Hosts our application and provides anonymous usage analytics</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-3 text-base">Family Members You Invite</h4>
                    <p className="text-sm text-muted-foreground">
                      When you invite family members to your tree, they will be able to view the information you've shared based on 
                      your privacy settings and their role (admin, contributor, or viewer).
                    </p>
                  </div>

                  <div className="rounded-xl border-2 border-green-500/20 bg-green-500/5 p-6">
                    <p className="font-semibold text-green-600 dark:text-green-400 mb-3">What We Don't Do</p>
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-start gap-2">
                        <span className="text-green-500">✓</span>
                        <span>We never sell your personal data to third parties</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-500">✓</span>
                        <span>We never use your family data for advertising purposes</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-500">✓</span>
                        <span>We never share your family tree publicly without your explicit permission</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </section>

              <Separator className="my-8" />

              <section className="mb-12">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">5</span>
                  Data Security
                </h3>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  We implement industry-standard security measures to protect your information:
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-start gap-3 rounded-lg border bg-card p-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Shield className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Encryption</p>
                      <p className="text-xs text-muted-foreground mt-1">All data transmitted over HTTPS with TLS encryption</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-lg border bg-card p-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Shield className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Access Controls</p>
                      <p className="text-xs text-muted-foreground mt-1">Row-level security ensures only authorized users access your data</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-lg border bg-card p-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Shield className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Regular Updates</p>
                      <p className="text-xs text-muted-foreground mt-1">We keep our systems up-to-date with the latest security patches</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-lg border bg-card p-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Shield className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Limited Access</p>
                      <p className="text-xs text-muted-foreground mt-1">Our team has minimal, audited access to user data</p>
                    </div>
                  </div>
                </div>
              </section>

              <Separator className="my-8" />

              <section className="mb-12">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">6</span>
                  Your Privacy Rights
                </h3>
                <div className="space-y-3">
                  <div className="rounded-lg border bg-card p-4">
                    <h4 className="font-semibold text-sm mb-2">Access & Export</h4>
                    <p className="text-xs text-muted-foreground">You can request a copy of your data at any time by contacting us.</p>
                  </div>
                  <div className="rounded-lg border bg-card p-4">
                    <h4 className="font-semibold text-sm mb-2">Correction</h4>
                    <p className="text-xs text-muted-foreground">You can edit your family tree data directly through the app at any time.</p>
                  </div>
                  <div className="rounded-lg border bg-card p-4">
                    <h4 className="font-semibold text-sm mb-2">Deletion</h4>
                    <p className="text-xs text-muted-foreground">You can delete your account through Settings → Account → Delete Account. This will permanently remove your data.</p>
                  </div>
                  <div className="rounded-lg border bg-card p-4">
                    <h4 className="font-semibold text-sm mb-2">Privacy Controls</h4>
                    <p className="text-xs text-muted-foreground">Control who can see your profile through privacy settings (Public, Family, or Private).</p>
                  </div>
                  <div className="rounded-lg border bg-card p-4">
                    <h4 className="font-semibold text-sm mb-2">Revoke Access</h4>
                    <p className="text-xs text-muted-foreground">As a family admin, you can revoke access for any family member at any time.</p>
                  </div>
                </div>
              </section>

              <Separator className="my-8" />

              <section className="mb-12">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">7</span>
                  Cookies and Tracking
                </h3>
                <p className="text-muted-foreground leading-relaxed mb-4">We use minimal cookies and similar technologies:</p>
                <ul className="space-y-2">
                  <li className="flex items-start gap-3">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0"></span>
                    <span className="text-sm text-muted-foreground"><strong>Essential cookies:</strong> Required for authentication and core functionality</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0"></span>
                    <span className="text-sm text-muted-foreground"><strong>Analytics cookies:</strong> Vercel Analytics (anonymous usage data)</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0"></span>
                    <span className="text-sm text-muted-foreground"><strong>Preference cookies:</strong> Remember your theme preference (light/dark mode)</span>
                  </li>
                </ul>
              </section>

              <Separator className="my-8" />

              <section className="mb-12">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">8</span>
                  Children's Privacy
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  While you can add children to your family tree, individuals under 13 years of age may not create their own accounts. 
                  If we learn that we have collected personal information from a child under 13 without parental consent, we will delete that information promptly.
                </p>
              </section>

              <Separator className="my-8" />

              <section className="mb-12">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">9</span>
                  International Data Transfers
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  Your data is stored on servers located in the United States. By using Outverse, you consent to the transfer of your 
                  information to the United States and processing in accordance with this Privacy Policy and applicable U.S. law.
                </p>
              </section>

              <Separator className="my-8" />

              <section className="mb-12">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">10</span>
                  Changes to This Policy
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  We may update this Privacy Policy from time to time. We will notify you of material changes by email or through a notice 
                  on our service. Your continued use of Outverse after such changes constitutes your acceptance of the updated policy.
                </p>
              </section>

              <Separator className="my-8" />

              <section className="mb-12">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">11</span>
                  Contact Us
                </h3>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  If you have questions about this Privacy Policy or want to exercise your privacy rights, please contact us:
                </p>
                <div className="rounded-xl border bg-card p-6 space-y-3">
                  <div>
                    <p className="text-sm font-semibold">General Privacy Questions</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Email: <a href="mailto:privacy@outverse.in" className="text-primary hover:underline">privacy@outverse.in</a>
                    </p>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-sm font-semibold">Data Deletion or Export Requests</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Subject line: "Data Request - [Your Email]"<br />
                      Email: <a href="mailto:privacy@outverse.in" className="text-primary hover:underline">privacy@outverse.in</a>
                    </p>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-sm font-semibold">Through the App</p>
                    <p className="text-sm text-muted-foreground mt-1">Settings → Help & Feedback</p>
                  </div>
                </div>
              </section>

              <div className="not-prose mt-12 rounded-xl border bg-muted/30 p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  By using Outverse, you acknowledge that you have read and understood this Privacy Policy and consent to 
                  the collection, use, and sharing of your information as described herein.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
