-- Enable trigram extension for fuzzy (typo-tolerant) search.
-- Used by the search API to match "Acess" -> "Access", etc.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
