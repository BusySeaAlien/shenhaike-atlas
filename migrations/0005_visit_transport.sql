PRAGMA foreign_keys = ON;

-- Mode of the leg *arriving at* this stop from the previous stop
-- (Wishlist & mileage handoff §2.2). NULL for a journey's first stop (no
-- arriving leg); display and mileage ignore a first stop's value.
-- Additive-only ALTER: existing rows become NULL, so no table rebuild (0003
-- rebuilt tables because it *changed* existing CHECKs; this adds one).
ALTER TABLE atlas_visits
ADD COLUMN transport_mode TEXT
  CHECK (transport_mode IS NULL OR transport_mode IN
    ('plane','train','ship','car','bus','walk','other'));
