FROM postgres:16

COPY proof_tree.sql /docker-entrypoint-initdb.d/proof_tree.sql
