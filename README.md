# atomic_solver_db

## Browse db

Install pgAdmin, then go to the query tool an prepare a query:

```sql
PREPARE child_query(ltree) AS
SELECT *
FROM proof_nodes
WHERE path <@ $1
  AND nlevel(path) = nlevel($1) + 1;
```

Then find the children of a node via:
```sql
EXECUTE child_query('root');
```
