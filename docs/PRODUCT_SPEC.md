# HILLink product specification

Status: living document; incomplete until historical product context is transferred and verified.  
Product owner: Kyle Hill  
Coordination: GitHub issue #12

## How to maintain this document

This file captures product truth that cannot be reconstructed reliably from code alone. Every material entry should use one of these labels:

- **Confirmed:** Kyle explicitly approved it.
- **Implemented:** current code behaves this way; implementation is not automatically product approval.
- **Proposed:** an agent recommendation awaiting approval.
- **Open:** unresolved product question.
- **Rejected:** considered and intentionally not selected, with the reason.

When transferring context from a private Claude or ChatGPT conversation, do not silently mark it Confirmed. Include the source/date when known, state the remembered requirement, and ask Kyle to verify anything consequential. Code, migrations, screenshots, and live behavior can establish implementation state but not always intended behavior.

## Product vision and positioning

Document:

- the problem HILLink solves
- target athlete segments
- target business segments
- geographic and school launch strategy
- the core promise to each user type
- differentiation from other NIL platforms
- launch scope versus long-term vision
- terminology and brand voice

## Roles and actors

Define permissions and responsibilities for:

- athlete
- business owner and business staff
- administrator
- unauthenticated customer using a promotional code
- HILLink operations/support
- school or compliance personnel, if applicable
- future roles that must not be assumed to exist yet

## Athlete lifecycle

Specify the intended behavior for:

- waitlist and invitation
- signup and identity verification
- school, team, sport, roster, and location information
- eligibility and compliance confirmation
- profile completeness and discoverability
- applying, accepting invitations, and withdrawing
- proof submission, correction, approval, and dispute
- ratings, HILLink Score, XP, tier, rewards, and leaderboard
- payouts and tax/payment onboarding
- suspension, graduation, transfer, account closure, and return
- history retention and visibility

## Business lifecycle

Specify:

- waitlist, signup, verification, and approval
- business profile, categories, locations, and staff access
- subscription tiers and entitlements
- campaign creation, templates, offers, targeting, and slots
- discovering, inviting, accepting, and removing athletes
- funding, proof review, ratings, disputes, refunds, and reporting
- customer redemption codes and staff links
- cancellation, delinquency, suspension, and account closure
- multi-location and ownership edge cases

## Campaign lifecycle and business rules

Define every allowed state and transition for:

- draft
- published
- accepting applications
- athlete invited/applied/accepted/withdrawn/removed
- funded or unfunded
- active
- proof submitted/resubmitted/rejected/approved/auto-approved
- payout pending/paid/failed
- completed/cancelled/disputed/refunded

For each transition, define who can trigger it, required preconditions, notifications, financial effects, audit history, and reversal behavior.

## College transfers

Resolve and document:

- current school and team identity with effective dates
- transfer portal or transfer-in-progress state
- eligibility/compliance reconfirmation
- treatment of active applications and campaigns
- ratings, score, XP, rewards, earnings, and deliverable history
- visibility of previous affiliations
- edit, verification, approval, and dispute authority
- duplicate profiles and account continuity
- notifications to affected athletes, businesses, and admins
- RLS and audit-log requirements
- configurable NCAA, state, conference, and school constraints

## Compliance and eligibility

Document:

- restricted business and campaign categories
- age, international-athlete, visa, and school-exclusive rules
- disclosure and advertising requirements
- school reporting responsibilities
- configurable versus hard-coded rules
- evidence, attestation, review, expiration, and re-verification
- what must receive legal/compliance review before launch

## Money and monetization

Specify:

- business subscription plans and included features
- platform fee and card-processing treatment
- athlete compensation and in-kind deals
- funding timing and fund custody assumptions
- payout timing, failed payout recovery, and idempotency
- cancellation and refund rules by campaign state
- disputes and administrative adjustments
- coupons, credits, trials, delinquency, and plan changes
- reconciliation, audit, reporting, tax, and legal assumptions

## Matching, discovery, and invitations

Define:

- search and ranking inputs
- distance/location handling
- athlete/business visibility controls
- verified social metrics
- HILLink Score usage
- fairness, cold-start, and new-user handling
- blocks, exclusions, conflicts, and school/category restrictions
- explanation shown to users when a match or application is blocked

## Communications and support

Specify:

- welcome messages for athletes and businesses
- reminders and lifecycle notifications
- email, in-app, and future-channel responsibilities
- notification preferences and mandatory notices
- signed-in role-aware Help Center
- advanced FAQ ownership and update workflow
- escalation from FAQ/agent to human support
- delivery failure, retry, deduplication, and audit expectations

## Admin and operations

Define:

- approval and verification queues
- user, campaign, dispute, payment, and notification controls
- safe recovery and correction tools
- audit logs and reason requirements
- separation between support actions and destructive actions
- monitoring, incident response, backups, and reconciliation
- actions that require two-person or Kyle approval

## Analytics and success metrics

Define authoritative calculations for:

- campaign results
- customer redemptions
- reach and social metrics
- cost per customer
- athlete performance and HILLink Score
- business value and retention
- platform revenue and liabilities
- launch metrics and data-quality caveats

## Privacy, security, and account lifecycle

Specify:

- data visibility by role
- sensitive and public athlete information
- account deletion, retention, export, and restoration
- consent and communication preferences
- session/authentication expectations
- abuse prevention and rate limits
- service-role boundaries
- secrets and operational access
- audit history and privacy/legal review requirements

## UX and design rules

Document:

- mobile-first requirements
- role-specific navigation
- terminology that must remain consistent
- accessibility requirements
- empty, loading, error, blocked, pending, and success states
- tone and amount of explanation for unfamiliar NIL concepts
- design-system decisions and intentional exceptions

## External systems and environments

Maintain a verified map of:

- GitHub branches and deployment flow
- Vercel environments and cron jobs
- primary Supabase project
- separate waitlist Supabase project
- Stripe products, Checkout, Connect, and webhooks
- Instagram/Meta integration
- email delivery
- environment-variable names only, never secret values
- test versus production boundaries

## Rejected approaches and non-goals

Record ideas that were attempted or considered but rejected, including why. This prevents Claude and Codex from repeatedly proposing or rebuilding the same discarded design.

## Open product decisions

Track questions requiring Kyle with:

- decision needed
- why it matters
- options and tradeoffs
- recommended choice
- affected code/data
- deadline or blocking task

## Context-transfer checklist for Claude

When Claude returns with access to its existing HILLink project context:

1. Compare its remembered/project knowledge against every section above.
2. Add missing nuances in a dedicated branch.
3. Label each entry Confirmed, Implemented, Proposed, Open, or Rejected.
4. Cite the relevant code, prior explicit Kyle decision, or approximate conversation date where available.
5. Do not copy secrets, credentials, personal user data, or raw private conversation logs.
6. Post a summary in issue #12 listing:
   - context added
   - contradictions found
   - assumptions that need Kyle's verification
   - product areas still undocumented
7. Ask Codex to independently compare the new specification with current code and migrations.
