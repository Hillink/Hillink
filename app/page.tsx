"use client";

import { useState } from "react";
import Link from "next/link";

export default function Home() {
  const [modal, setModal] = useState<"contact" | "privacy" | null>(null);
  const close = () => setModal(null);
  return (
    <div className="landing-page" id="top">
      <header className="landing-header">
        <div className="landing-brand">
          <img src="/Hillink-logo-black-red.png" alt="HILLink" className="logo-image" />
        </div>

        <nav className="landing-nav-links">
          <a href="#about">About</a>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>

          <a
            href="https://www.instagram.com/hillinkofficial?igsh=MWE1eGZ0ZTdxbHpsMQ%3D%3D"
            target="_blank"
            rel="noopener noreferrer"
            className="insta-nav"
          >
            <img src="/instagram-icon.png" alt="Instagram" className="insta-icon-img" />
          </a>
        </nav>

        {/* PRELAUNCH: replaced Log in / Get started with waitlist CTA */}
        <div className="landing-header-actions" style={{ display: "flex", gap: 12 }}>
          <Link href="/waitlist">
            <button className="cta-button">Join the Waitlist</button>
          </Link>
          <Link href="/preview">
            <button className="secondary-button">Check out the Prototype</button>
          </Link>
        </div>
        {/* Optionally, add a section to highlight the prototype elsewhere if desired */}
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-badge">Coming Soon — Join the Waitlist</div>

          <h1 className="hero-title">
            Linking <span className="logo-red">local businesses</span> to{" "}
            <span className="logo-red">college athletes</span>
          </h1>

          <p className="hero-copy">
            HILLink helps businesses launch affordable NIL campaigns with
            verified college athletes, while athletes earn rewards, XP, and
            payouts through a gamified platform built for local growth.
          </p>

          {/* PRELAUNCH: replaced signup buttons with waitlist CTAs */}
          <div className="hero-actions">
            <Link href="/waitlist/business">
              <button className="cta-button large-button">I&apos;m a Business</button>
            </Link>
            <Link href="/waitlist/athlete">
              <button className="secondary-button large-button">I&apos;m an Athlete</button>
            </Link>
          </div>

          <div className="hero-subpoints">
            <span>Affordable local campaigns</span>
            <span>Automated matching</span>
            <span>Trackable ROI</span>
          </div>
        </section>

        <section id="about" className="landing-section">
          <div className="section-kicker">About Us</div>
          <h2 className="section-heading">
            Small businesses can&apos;t navigate NIL. Big athletes are overpriced.
            HILLink fixes both.
          </h2>
          <p className="section-copy">
            HILLink is a subscription-based marketplace that connects local
            businesses with verified college athletes for compliant NIL
            promotions. Businesses create campaigns, athletes receive matching
            opportunities, and the platform handles the workflow from discovery
            to payout.
          </p>

          <div className="about-grid">
            <div className="info-card">
              <h3>The problem</h3>
              <p>
                Small businesses usually do not know how to enter NIL or cannot
                justify large sponsorship costs.
              </p>
            </div>
            <div className="info-card">
              <h3>The solution</h3>
              <p>
                HILLink makes NIL local, affordable, structured, and measurable
                through automation and athlete tiering.
              </p>
            </div>
            <div className="info-card">
              <h3>Why it matters</h3>
              <p>
                Most NIL deals are relatively small. That is exactly where
                HILLink can win and scale.
              </p>
            </div>
          </div>
        </section>

        <section id="features" className="landing-section">
          <div className="section-kicker">Features</div>
          <h2 className="section-heading">
            Everything needed to make the platform make sense fast
          </h2>

          <div className="feature-grid">
            <div className="feature-card">
              <div className="feature-number">1</div>
              <h3>Business campaign builder</h3>
              <p>
                Post campaigns, define deliverables, select athlete tiers, and
                launch locally in minutes.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-number">2</div>
              <h3>Smart athlete matching</h3>
              <p>
                Match by location, tier, availability, and profile strength so
                businesses see the best-fit athletes first.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-number">3</div>
              <h3>XP and tier progression</h3>
              <p>
                Athletes level up from Bronze to Platinum through completed
                campaigns, referrals, streaks, and ratings.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-number">4</div>
              <h3>Diagnostics and analytics</h3>
              <p>
                Businesses see campaign progress, approved posts, engagement
                signals, and renewal opportunities.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-number">5</div>
              <h3>Compliance-friendly flow</h3>
              <p>
                Store campaign terms, timestamps, approvals, compensation type,
                and reporting data in one system.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-number">6</div>
              <h3>Retention loops built in</h3>
              <p>
                Renew campaigns, duplicate winners, push notifications, athlete
                rewards, and referrals keep both sides active.
              </p>
            </div>
          </div>
        </section>

        <section className="landing-section social-section">
          <div className="section-kicker">Social / Visibility</div>
          <h2 className="section-heading">Built for shareable athlete promotion</h2>
          <p className="section-copy">
            Campaigns are designed to be visible on platforms like Instagram,
            TikTok, and X with trackable tags, proof-of-post flow, and future
            analytics integrations.
          </p>

          <div className="social-strip">
            <div className="social-card">
              <div className="social-icon">⌁</div>
              <div>
                <strong>@hillink</strong>
                <p>Platform brand visibility</p>
              </div>
            </div>
            <div className="social-card">
              <div className="social-icon">#</div>
              <div>
                <strong>#HILLinkPartner</strong>
                <p>Campaign tagging for tracking</p>
              </div>
            </div>
            <div className="social-card">
              <div className="social-icon">◎</div>
              <div>
                <strong>Proof of post</strong>
                <p>Submission and verification flow</p>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="landing-section">
          <div className="section-kicker">Pricing</div>
          <h2 className="section-heading">
            Simple pricing that is easy to explain to businesses
          </h2>

          <div className="pricing-grid">
            <div className="pricing-card">
              <h3>Platform Access</h3>
              <div className="pricing-big">
                $250<span>/month</span>
              </div>
              <p>
                Businesses pay a base monthly subscription for platform access,
                campaign posting, matching, and dashboard tools.
              </p>
            </div>

            <div className="pricing-card featured-pricing">
              <h3>Per Athlete Campaign Pricing</h3>
              <div className="price-list">
                <div><span>Bronze</span><strong>$35</strong></div>
                <div><span>Silver</span><strong>$65</strong></div>
                <div><span>Gold</span><strong>$100</strong></div>
                <div><span>Platinum</span><strong>$200</strong></div>
              </div>
              <p>
                Businesses pay based on which athlete tier accepts. HILLink
                keeps the spread and handles the workflow.
              </p>
            </div>
          </div>
        </section>

        <section id="faq" className="landing-section">
          <div className="section-kicker">FAQ</div>
          <h2 className="section-heading">Questions people will ask immediately</h2>

          <div className="faq-grid">
            <div className="faq-card">
              <h3>How does HILLink make money?</h3>
              <p>
                Businesses pay a monthly subscription plus variable campaign
                pricing based on athlete tier and accepted slots.
              </p>
            </div>

            <div className="faq-card">
              <h3>Why would athletes stay active?</h3>
              <p>
                XP, tier progression, visibility, payouts, ratings, and
                referrals create a loop that keeps them engaged.
              </p>
            </div>

            <div className="faq-card">
              <h3>Why would businesses renew?</h3>
              <p>
                If they can see post completion, engagement, and campaign
                results clearly, renewal becomes much easier.
              </p>
            </div>

            <div className="faq-card">
              <h3>Is HILLink live yet?</h3>
              <p>
                We are in prelaunch and onboarding our first wave of businesses
                and athletes. Join the waitlist to get early access.
              </p>
            </div>
                  {/* PRELAUNCH: bottom CTA section */}
                  <section className="landing-section" style={{ textAlign: "center" }}>
                    <div className="section-kicker">Early Access</div>
                    <h2 className="section-heading">Be first when we launch in College Station</h2>
                    <p className="section-copy">
                      We are starting narrow and local. If you are a Texas A&amp;M athlete
                      or a College Station business, now is the time to get on the list.
                    </p>
                    <div className="hero-actions" style={{ justifyContent: "center", marginTop: 24 }}>
                      <Link href="/waitlist/business">
                        <button className="cta-button large-button">I&apos;m a Business</button>
                      </Link>
                      <Link href="/waitlist/athlete">
                        <button className="secondary-button large-button">I&apos;m an Athlete</button>
                      </Link>
                    </div>
                  </section>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="footer-logo-row">
          <button className="footer-link-btn" onClick={() => setModal("contact")}>Contact Us</button>
          <button
            className="footer-logo-link"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-label="Back to top"
          >
            <img src="/LL logo.png" alt="HILLink" className="footer-logo" />
          </button>
          <button className="footer-link-btn" onClick={() => setModal("privacy")}>Privacy Policy</button>
        </div>
        <p className="footer-legal">&copy; 2026 Hillink LLC. All rights reserved.</p>
      </footer>

      {/* Contact Us Modal */}
      {modal === "contact" && (
        <div className="modal-overlay" onClick={close}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Contact Us</h3>
              <button className="modal-close" onClick={close}>✕</button>
            </div>
            <div className="modal-body" style={{ textAlign: "center", padding: "32px 24px" }}>
              <p style={{ fontSize: "1rem", marginBottom: 8 }}>Have a question or need help?</p>
              <a
                href="mailto:contact@hillink.io"
                style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--red)" }}
              >
                contact@hillink.io
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Privacy Policy Modal */}
      {modal === "privacy" && (
        <div className="modal-overlay" onClick={close}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
            <div className="modal-header">
              <h3>Privacy Policy</h3>
              <button className="modal-close" onClick={close}>✕</button>
            </div>
            <div className="modal-body" style={{ overflowY: "auto", padding: "24px", lineHeight: 1.7, fontSize: "0.9rem" }}>
              <p><strong>Effective Date:</strong> November 2025 &nbsp;|&nbsp; <strong>Last Updated:</strong> November 2025</p>
              <p style={{ marginTop: 12 }}>HILLink (&ldquo;HILLink,&rdquo; &ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website, create an account, or use our platform to connect college athletes and businesses for NIL (Name, Image, and Likeness) opportunities. By accessing or using HILLink, you agree to the practices described in this Privacy Policy.</p>

              <h4 style={{ marginTop: 20 }}>1. Information We Collect</h4>
              <p>We collect information in the following ways:</p>
              <p><strong>A. Information You Provide to Us</strong></p>
              <p><em>For Athletes:</em> First and last name, phone number, school email and school information, graduation year and eligibility year, sport(s), social media handle(s), profile details and optional bio.</p>
              <p><em>For Businesses:</em> First and last name, phone number, business email, business name and type, business location, social media handle(s), login credentials, messages or inquiries, uploaded content.</p>
              <p><strong>B. Automatically Collected Information</strong></p>
              <p>IP address, browser type, device type, pages visited, time on site, cookies and tracking technologies.</p>
              <p><strong>C. Information From Third-Party Services</strong></p>
              <p>If you connect social media accounts or other integrations, we may collect engagement metrics, follower counts, impression data, and public social media information — with your explicit permission.</p>

              <h4 style={{ marginTop: 20 }}>2. How We Use Your Information</h4>
              <p>We use your information to create and manage your account, match athletes with businesses for NIL opportunities, communicate about campaigns and support, improve the platform, provide analytics to businesses, maintain security, and comply with legal obligations. <strong>We never sell your personal information.</strong></p>

              <h4 style={{ marginTop: 20 }}>3. How We Share Information</h4>
              <p><strong>With Businesses (Athletes participating in campaigns):</strong> Athlete name, social media handle, relevant engagement metrics, and submitted campaign content.</p>
              <p><strong>With Athletes:</strong> Business name, basic campaign details, and compensation information.</p>
              <p><strong>Service Providers:</strong> Trusted third parties for hosting, analytics, and payment processing.</p>
              <p><strong>Legal Requirements:</strong> When required by law to protect rights, safety, or property. We do not share or sell your data to advertisers.</p>

              <h4 style={{ marginTop: 20 }}>4. Cookies &amp; Tracking</h4>
              <p>We use cookies to keep you logged in, improve performance, and analyze usage. You can disable cookies in your browser settings, but the platform may not function properly.</p>

              <h4 style={{ marginTop: 20 }}>5. Data Security</h4>
              <p>We use encrypted HTTPS connections, secure data storage, and access controls. No method of transmission over the Internet is 100% secure. You use the platform at your own risk.</p>

              <h4 style={{ marginTop: 20 }}>6. Your Rights</h4>
              <p>Depending on your location, you may have the right to access, correct, or delete your personal data, limit certain processing, or withdraw consent. Contact: <a href="mailto:contact@hillink.io">contact@hillink.io</a></p>

              <h4 style={{ marginTop: 20 }}>7. Data Retention</h4>
              <p>We retain your information only as long as necessary to maintain your account, provide services, and comply with legal requirements. You may request account deletion at any time.</p>

              <h4 style={{ marginTop: 20 }}>8. Children&apos;s Privacy</h4>
              <p>HILLink does not knowingly collect personal information from individuals under 13 years old. If you believe a minor has provided information, contact us immediately.</p>

              <h4 style={{ marginTop: 20 }}>9. Third-Party Links</h4>
              <p>Our website may contain links to third-party sites. We are not responsible for their content or privacy practices.</p>

              <h4 style={{ marginTop: 20 }}>10. Changes to This Policy</h4>
              <p>We may update this Privacy Policy periodically. Continued use of the platform after updates constitutes acceptance of the revised policy.</p>

              <h4 style={{ marginTop: 20 }}>11. Contact Us</h4>
              <p>HILLink &mdash; <a href="mailto:contact@hillink.io">contact@hillink.io</a></p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}