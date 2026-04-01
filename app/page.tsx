import Link from "next/link";

export default function Home() {
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
            href="https://www.instagram.com/hillink.io"
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
            Let athletes do the marketing for you
          </h2>

          <div className="pricing-grid">
            <div className="pricing-card">
              <h3>Platform Access</h3>
              <div className="pricing-big">
                $200 <span>/ month</span>
              </div>
              <p>
                Businesses pay a base monthly subscription for platform access,
                campaign posting, matching, and dashboard tools.
              </p>
            </div>

            <div className="pricing-card featured-pricing">
                <h3>Let athletes do the marketing for you</h3>
                <p>
                  Launch local campaigns with college athletes who already know
                  how to create attention, drive foot traffic, and keep your
                  business visible in the community.
                </p>
                <p>
                  HILLink gives businesses one simple subscription for access to
                  campaign tools, athlete discovery, and the workflow needed to
                  get promotions live fast.
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
          </div>
        </section>

        {/* PRELAUNCH: bottom CTA section */}
        <section className="landing-section early-access-section">
          <div className="section-kicker">Early Access</div>
          <h2 className="section-heading">Be first when we launch in College Station and Houston</h2>
          <p className="section-copy">
            We are starting narrow and local. If you are a Texas A&amp;M athlete
            or a College Station or Houston-area business, now is the time to get on the list.
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
      </main>

    </div>
  );
}