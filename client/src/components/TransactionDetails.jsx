/**
 * TransactionDetails — back-office-grade receipt cards for a transaction.
 *
 * Renders the response of GET /api/transactions/:id (Altruon's transaction
 * details API), which links the SAME payment across three systems:
 *
 *   transaction  → the payment GATEWAY (Checkout.com, Adyen, dLocal, ...)
 *                  with `urlAtGateway` deep-linking to the gateway dashboard
 *   customer /
 *   invoice /
 *   subscription → the BILLING provider (Stripe, Chargebee, Recurly, ...)
 *                  each with `urlAtBilling` deep links
 *
 * Every id gets a copy-to-clipboard button — the detail support teams
 * always wish checkout pages had.
 */

import React, { useState } from "react";
import { formatDisplayAmount } from "../utils/money.js";
import "./TransactionDetails.css";

/** Human-friendly date like "June 10, 2026, 06:30 PM". */
function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Monospace id with a copy button. */
function CopyableId({ value }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="td-value">—</span>;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (http origin) — ignore */
    }
  };

  return (
    <span className="td-copyable">
      <span className="td-value mono">{value}</span>
      <button onClick={copy} title="Copy" aria-label={`Copy ${value}`}>
        {copied ? (
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M3 8.5L6.5 12L13 5" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <rect x="5" y="5" width="8" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2H4.5A1.5 1.5 0 0 0 3 3.5v7A1.5 1.5 0 0 0 4.5 12H5" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        )}
      </button>
    </span>
  );
}

/** "View in Stripe ↗" style external deep link. */
function ExternalLink({ url, label }) {
  if (!url) return null;
  return (
    <a className="td-external" href={url} target="_blank" rel="noopener noreferrer">
      {label}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path d="M7 17L17 7M17 7H8M17 7v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}

function Section({ icon, title, action, children }) {
  return (
    <section className="td-section card">
      <header>
        <div className="td-section-title">
          {icon}
          <h3>{title}</h3>
        </div>
        {action}
      </header>
      <div className="td-grid">{children}</div>
    </section>
  );
}

const Item = ({ label, children, wide }) => (
  <div className={`td-item${wide ? " wide" : ""}`}>
    <span className="td-label">{label}</span>
    {children}
  </div>
);

/** Capitalized platform name for link labels ("stripe" → "Stripe"). */
const platformLabel = (name) =>
  name ? name.charAt(0).toUpperCase() + name.slice(1) : "billing provider";

export default function TransactionDetails({ details }) {
  const { transaction, customer, invoice, subscription } = details || {};

  const iconProps = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none" };
  const stroke = { stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" };

  return (
    <div className="transaction-details">
      {/* ── Gateway side ─────────────────────────────────────────────── */}
      {transaction && (
        <Section
          title="Payment"
          icon={
            <svg {...iconProps}>
              <rect x="3" y="6" width="18" height="13" rx="2" {...stroke} />
              <path d="M3 10h18" {...stroke} />
            </svg>
          }
          action={<ExternalLink url={transaction.urlAtGateway} label="View in gateway" />}
        >
          <Item label="Amount" wide>
            <span className="td-value td-amount">
              {formatDisplayAmount(transaction)}
            </span>
          </Item>
          <Item label="Transaction ID">
            <CopyableId value={transaction.id} />
          </Item>
          <Item label="Gateway reference">
            <CopyableId value={transaction.idAtGateway} />
          </Item>
          <Item label="Gateway">
            <span className="td-value capitalize">{transaction.gateway || "—"}</span>
          </Item>
          <Item label="Type">
            <span className="td-value capitalize">{transaction.type || "—"}</span>
          </Item>
          {transaction.errorMessage && (
            <Item label="Error" wide>
              <span className="td-value td-error">{transaction.errorMessage}</span>
            </Item>
          )}
        </Section>
      )}

      {/* ── Billing provider side ────────────────────────────────────── */}
      {customer && (
        <Section
          title="Customer"
          icon={
            <svg {...iconProps}>
              <circle cx="12" cy="8" r="4" {...stroke} />
              <path d="M5 21c0-3.9 3.1-7 7-7s7 3.1 7 7" {...stroke} />
            </svg>
          }
          action={
            <ExternalLink
              url={customer.urlAtBilling}
              label={`View in ${platformLabel(customer.billingPlatform)}`}
            />
          }
        >
          <Item label="Customer ID">
            <CopyableId value={customer.idAtBillingPlatform} />
          </Item>
          <Item label="Billing platform">
            <span className="td-value capitalize">{customer.billingPlatform || "—"}</span>
          </Item>
        </Section>
      )}

      {invoice && (
        <Section
          title="Invoice"
          icon={
            <svg {...iconProps}>
              <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6l6 6v10a2 2 0 0 1-2 2Z" {...stroke} strokeLinejoin="round" />
              <path d="M9 13h6M9 17h6" {...stroke} />
            </svg>
          }
          action={
            <ExternalLink
              url={invoice.urlAtBilling}
              label={`View in ${platformLabel(invoice.billingPlatform)}`}
            />
          }
        >
          <Item label="Invoice ID">
            <CopyableId value={invoice.idAtBillingPlatform} />
          </Item>
          <Item label="Amount">
            <span className="td-value">{formatDisplayAmount(invoice)}</span>
          </Item>
        </Section>
      )}

      {subscription && (
        <Section
          title="Subscription"
          icon={
            <svg {...iconProps}>
              <path d="M12 8v4l2.5 2.5" {...stroke} />
              <circle cx="12" cy="12" r="9" {...stroke} />
            </svg>
          }
          action={
            <ExternalLink
              url={subscription.urlAtBilling}
              label={`View in ${platformLabel(subscription.billingPlatform)}`}
            />
          }
        >
          <Item label="Subscription ID">
            <CopyableId value={subscription.idAtBillingPlatform} />
          </Item>
          <Item label="Next billing date">
            <span className="td-value">{formatDate(subscription.nextBillingDate)}</span>
          </Item>
        </Section>
      )}
    </div>
  );
}
