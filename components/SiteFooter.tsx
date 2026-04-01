"use client";

import Link from "next/link";
import { useState } from "react";

type FooterModal = "contact" | "privacy" | "terms" | null;

export default function SiteFooter() {
  const [modal, setModal] = useState<FooterModal>(null);

  return (
    <>
      <footer className="landing-footer">
        <div className="footer-logo-row">
          <button className="footer-link-btn" onClick={() => setModal("contact")}>
            Contact Us
          </button>
          <Link className="footer-logo-link" href="/" aria-label="Back to home">
            <img src="/LL logo.png" alt="HILLink" className="footer-logo" />
          </Link>
          <button className="footer-link-btn" onClick={() => setModal("terms")}>
            Terms of Service
          </button>
        </div>
        <div className="footer-legal-links">
          <button className="footer-legal-link" onClick={() => setModal("privacy")}>
            Privacy Policy
          </button>
        </div>
        <p className="footer-legal">© 2026 Hillink LLC. All rights reserved.</p>
      </footer>

      {modal === "contact" && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Contact Us</h3>
              <button className="modal-close" onClick={() => setModal(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body footer-modal-body">
              <p>Questions, partnerships, or early-access requests?</p>
              <a href="mailto:contact@hillink.io">contact@hillink.io</a>
            </div>
          </div>
        </div>
      )}

      {modal === "terms" && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal wide" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Terms of Service</h3>
              <button className="modal-close" onClick={() => setModal(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body footer-modal-scroll">
              <p>
                By using HILLink, you agree to use the platform lawfully, provide accurate information, and respect campaign,
                compensation, and content requirements communicated through the service.
              </p>
              <h4>1. Platform Access</h4>
              <p>
                HILLink provides a software platform that helps businesses and college athletes discover, manage, and review NIL
                campaign opportunities. Access may be limited, paused, or revoked at our discretion during prelaunch.
              </p>
              <h4>2. User Responsibilities</h4>
              <p>
                You agree not to misrepresent your identity, social metrics, school status, business affiliation, or campaign intent.
                Users remain responsible for complying with NIL rules, school guidance, and applicable law.
              </p>
              <h4>3. Campaign Conduct</h4>
              <p>
                Businesses must describe deliverables and compensation honestly. Athletes must complete accepted work in good faith.
                HILLink may suspend accounts for abuse, fraud, non-compliance, harassment, or repeated low-quality conduct.
              </p>
              <h4>4. Prelaunch Status</h4>
              <p>
                Features shown in the prototype are illustrative and may change before general availability. Access requests and pilot
                participation do not guarantee approval or timeline commitments.
              </p>
              <h4>5. Contact</h4>
              <p>
                For legal or support questions, contact <a href="mailto:contact@hillink.io">contact@hillink.io</a>.
              </p>
            </div>
          </div>
        </div>
      )}

      {modal === "privacy" && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal wide" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Privacy Policy</h3>
              <button className="modal-close" onClick={() => setModal(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body footer-modal-scroll">
              <p>
                HILLink collects account, campaign, and platform-usage data needed to operate the service, evaluate matches, and
                support reporting. We do not sell personal information.
              </p>
              <h4>1. Information We Collect</h4>
              <p>
                This may include profile details, business information, social handles, campaign submissions, communications, device
                information, and analytics data related to platform usage.
              </p>
              <h4>2. How We Use It</h4>
              <p>
                We use data to provide access, improve matching, communicate about campaigns, monitor security, support analytics,
                and comply with legal obligations.
              </p>
              <h4>3. Sharing</h4>
              <p>
                We may share relevant campaign information between participating athletes and businesses, and with infrastructure or
                payment providers needed to run the platform.
              </p>
              <h4>4. Contact</h4>
              <p>
                Questions about privacy can be sent to <a href="mailto:contact@hillink.io">contact@hillink.io</a>.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}