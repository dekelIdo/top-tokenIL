-- Order numbers.
--
-- The customer-facing reference (TT-000123) must be unique and readable, and it
-- is handed out under concurrency. A sequence is the only way to get that
-- without a lock: nextval never returns the same value twice, even to
-- transactions that later roll back.
--
-- Gaps are expected and harmless. A rolled-back order consumes a number, which
-- is the correct trade: a gap in the numbering is cheaper than two customers
-- holding the same reference.
--
-- Deliberately NOT the order id. This number appears in emails and support
-- conversations and grants no access on its own; the id stays high-entropy.
CREATE SEQUENCE IF NOT EXISTS order_number_seq
  AS BIGINT
  START WITH 1000
  INCREMENT BY 1
  NO CYCLE;
