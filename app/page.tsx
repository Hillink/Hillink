import Link from "next/link";

export default function Home() {
  return (
    <div className="landing-page">
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

        <div className="landing-header-actions">
          <Link href="/login">
            <button className="ghost-button">Log in</button>
          </Link>
          <Link href="/signup">
            <button className="cta-button">Get started</button>
          </Link>
        </div>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-badge">Automated NIL marketplace</div>

          <h1 className="hero-title">
            Linking <span className="logo-red">local businesses</span> to{" "}
            <span className="logo-red">college athletes</span>
          </h1>

          <p className="hero-copy">
            HILLink helps businesses launch affordable NIL campaigns with
            verified college athletes, while athletes earn rewards, XP, and
            payouts through a gamified platform built for local growth.
          </p>

          <div className="hero-actions">
            <Link href="/signup?role=business">
              <button className="cta-button large-button">I&apos;m a Business</button>
            </Link>
            <Link href="/signup?role=athlete">
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
              <h3>Does the prototype handle real payments?</h3>
              <p>
                Not yet. This version is built to demonstrate flow, logic, and
                product structure before a secure production build.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-brand footer-brand">
          <img src="/Hillink-logo-black-red.png" alt="HILLink" className="logo-image" />
        </div>

        <div className="footer-copy">
          Connecting local businesses and college athletes through smarter NIL infrastructure.
        </div>
      </footer>
    </div>
  );
}