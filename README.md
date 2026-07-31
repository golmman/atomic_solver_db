# atomic_solver_db

See proof tree meta data:
```sql
SELECT * FROM proof_tree_meta;
```

See all children of root:
```sql
SELECT * FROM proof_tree WHERE parent_id = 0;
```
