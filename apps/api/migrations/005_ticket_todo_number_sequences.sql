-- Atomic human-readable numbers: TSK-000001, #TDO-000001 (see nextval in application code).

CREATE SEQUENCE IF NOT EXISTS ticket_number_seq;

WITH m AS (
  SELECT MAX((regexp_match(ticket_number, '^TSK-([0-9]+)$'))[1]::bigint) AS max_n
  FROM tickets
  WHERE ticket_number ~ '^TSK-[0-9]+$'
)
SELECT setval(
  'ticket_number_seq',
  GREATEST(1, COALESCE((SELECT max_n FROM m), 0)),
  COALESCE((SELECT max_n FROM m), 0) >= 1
);

CREATE SEQUENCE IF NOT EXISTS todo_number_seq;

WITH m AS (
  SELECT MAX((regexp_match(todo_number, '^#TDO-([0-9]+)$'))[1]::bigint) AS max_n
  FROM todos
  WHERE todo_number IS NOT NULL
    AND todo_number ~ '^#TDO-[0-9]+$'
)
SELECT setval(
  'todo_number_seq',
  GREATEST(1, COALESCE((SELECT max_n FROM m), 0)),
  COALESCE((SELECT max_n FROM m), 0) >= 1
);
